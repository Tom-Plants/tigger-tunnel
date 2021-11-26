const Client = require('net').Socket;
const {Server, createServer} = require('net');

const   tunnel_num = 8;                 //通道数
const   target_port = 8080;             //服务器端口
const   target_host = "ru1.0x7c00.site";               //服务器地址
const   local_port = 10009;             //本地监听端口
const   local_host = "0.0.0.0";                //本地监听地址

let     allow_data_transfer = false;    //数据传输标志位

let     clients = [];
let     pending_data = [];
let     mapper = {};

init_clients()();
init_local_server();


function clear_clients() {

}
function init_clients() {
    let connected_count = 0;
    
    return () => {
        for(let i = 0; i < tunnel_num; i++) {
            clients.push(new Client());
        }
        clients.map((value, index) => {
            value.connect(target_port, target_host)
            .on("connect", () => {
                console.log(target_host, ":", target_port, "connect successfull");
                if(++connected_count == tunnel_num) {
                    console.log("ALL tunnel has successfull connected !");
                    allow_data_transfer = true;
                }
            }).on("error", (e) => {
                console.log(e);
            }).on("close", () => {
                console.log("num", ":", index, "has disconnected");
                --connected_count;
            }).on("drain", () => {
                console.log("num", ":", index, "has drained");
                value._paused = false;
                mapper.forEach((value) => {
                    value.resume();
                });
            }).on("data", (data) => {
                let num = data.readUInt16LE(0);
                let real_data = data.slice(2);

                console.log(num, real_data);

                if(real_data.length == 5) {
                    let cmd = data.toString();
                    if(cmd == "PTCLS") {
                        if(mapper[num] != undefined) {
                            mapper[num] = undefined;
                            mapper[num].destroy();
                        }
                        return;
                    }else if(cmd == "SHALF") {
                        if(mapper[num] != undefined) {
                            mapper[num].end();
                        }
                        return;
                    }else if(cmd == "PTCTN") {
                        if(mapper[num] != undefined) {
                            mapper[num].resume();
                        }
                        return;
                    }else if(cmd == "PTSTP") {
                        if(mapper[num] != undefined) {
                            mapper[num].pause();
                        }
                        return;
                    }

                }
                
                if(mapper[num].write(real_data) == false) {
                    send_data(Buffer.from("PTSTP", num));
                }
            });
        });
    };
}
function send_data(data, referPort) {
    for(let i of clients) {
        if(i._paused == false || i._paused == undefined) {
            //表明没有阻塞，那么发送数据
            let num_buffer = Buffer.allocUnsafe(2);
            num_buffer.writeUInt16LE(referPort);
            let send_buffer = Buffer.concat([num_buffer, data]);

            let send_block = i.write(send_buffer);

            if(!send_block) {
                //发送后阻塞
                console.log("发送阻塞");
                i._paused = true;
            }

            return send_block;
        }
    }
}
function init_local_server() {
    return createServer({
        allowHalfOpen: true,
        pauseOnConnect: true
    }, (socket) => {
        let referPort = socket.remotePort;
        if(referPort == undefined || allow_data_transfer == false) {
            socket.destroy();
            return;
        }
        socket.on("close", () => {
            send_data(Buffer.from("PTCLS"), referPort);
            if(mapper[referPort] != undefined){
                mapper[referPort].destroy();
                mapper[referPort] = undefined;
            }
        }).on("end", () => {
            send_data(Buffer.from("CHALF"), referPort);
        }).on("data", (data) => {
            console.log(referPort, data);
            if(send_data(data, referPort) == false) {
                socket.pause();
            }
        }).on("error", () => {})
        .on("drain", () => {
            send_data(Buffer.from("PTCTN"), referPort);
        }).setKeepAlive(true, 200);

        mapper[referPort] = socket;
        send_data(Buffer.from("COPEN"), referPort);
    }).listen({port: local_port, host: local_host});
}