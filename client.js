const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {handleData, print_allow_write} = require("./common");
const sd = require("./common").send_data;

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
            let lkdata = handleData((data) => {
                let num = data.readUInt16LE(0);
                let real_data = data.slice(2);

                if(real_data.length == 5) {
                    let cmd = real_data.toString();
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
                
                if(mapper[num] != undefined) {
                    if(mapper[num].write(real_data) == false) {
                        send_data(Buffer.from("PTSTP", num));
                    }
                }

            });
            let client = createConnection({host: target_host, port: target_port}, () => {
                console.log(target_host, ":", target_port, "connect successfull");
                if(++connected_count == tunnel_num) {
                    console.log("ALL tunnel has successfull connected !");
                    allow_data_transfer = true;
                }
            })
            .on("error", (e) => {
                console.log(e);
            }).on("close", () => {
                console.log("num", ":", i, "has disconnected");
                --connected_count;
            }).on("drain", () => {
                console.log("num", ":", i, "has drained");
                client._paused = false;
                for(let j in mapper) {
                    if(mapper[j] != undefined) mapper[j].resume();
                }
            }).on("data", (data) => {
                lkdata(data);
            });

            client._paused = false;

            clients.push(client);
        }
    };
}
function send_data(data, referPort) {
    let num_buffer = Buffer.allocUnsafe(6);
    num_buffer.writeUInt32LE(data.length + 2, 0);
    num_buffer.writeUInt16LE(referPort, 4);
    let send_buffer = Buffer.concat([num_buffer, data]);

    for(let i of clients) {
        if(i._paused == false || i._paused == undefined) {
            //表明没有阻塞，那么发送数据

            let send_block = i.write(send_buffer);

            if(!send_block) {
                //发送后阻塞
                i._paused = true;
            }else {
                i._paused = false;
            }

            return send_block;
        }
    }
    //随便选一个通道发出去
    let index = randomInt(tunnel_num);
    clients[index].write(send_buffer);
    return false;
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
            print_allow_write();
            if(send_data(data, referPort) == false) {
                socket.pause();
                console.log(referPort, "tunnel塞住了,推不出去");
            }
        }).on("error", () => {})
        .on("drain", () => {
            send_data(Buffer.from("PTCTN"), referPort);
        }).setKeepAlive(true, 200);

        mapper[referPort] = socket;
        send_data(Buffer.from("COPEN"), referPort);
    }).listen({port: local_port, host: local_host});
}

function send_data(data, referPort) {
    sd(data, referPort, clients);
}