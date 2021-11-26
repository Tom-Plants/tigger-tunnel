const Client = require('net').Socket;
const {Server, createServer} = require('net');

const   tunnel_num = 8;                 //通道数
const   target_port = 444;             //服务器端口
const   target_host = "localhost";               //服务器地址
const   local_port = 8080;             //本地监听端口
const   local_host = "0.0.0.0";                //本地监听地址

let     allow_data_transfer = false;    //数据传输标志位

let     clients = [];
let     pending_data = [];
let     mapper = {};

init_server()();

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
        value.paused = false;
        mapper.forEach((value) => {
            value.resume();
        });
    });
});

init_local_server();


function init_server() {
    let connected_count = 0;
    
    return () => {
        createServer({}, (socket) => {
            ++connected_count;
            if(connected_count == tunnel_num) {
                console.log("ALL tunnel has successfull connected !");
            }else if(connected_count > tunnel_num) {
                socket.destroy();
                --connected_count;
                return;
            }

            socket.on("error", (e) => {
                console.log(e);
            }).on("close", () => {
                --connected_count;
                console.log("tunnel has down");
            }).on("drain", () => {
                value.paused = false;
                mapper.forEach((value) => {
                    value.resume();
                });
            }).on("data", (data) => {
                let num = data.readUInt16LE(0);
                let real_data = data.slice(2);

                if(real_data.length == 5) {
                    let cmd = data.toString();
                    if(cmd == "PTCLS") {
                        if(mapper[num] != undefined) {
                            mapper[num] = undefined;
                            mapper[num].destroy();
                        }
                        return;
                    }else if(cmd == "CHALF") {
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
                    }else if(cmd == "COPEN") {
                        let conn = createConnection({host: target_host, port: target_port}, () => {
                            send_data(Buffer.from("PTCTN", num));
                        }).on("end", () => {
                            send_data(Buffer.from("SHALF"), num);
                        }).on("data", (data) => {
                        }).on("close", () => {
                            send_data(Buffer.from("PTCLS", num));
                            if(mapper[num] != undefined) {
                                mapper[num].destroy();
                                mapper[num] = undefined;
                            }
                        }).on("error", () => {})
                        .on("drain", () => {
                            send_data(Buffer.from("PTCTN"), num);
                        }).setKeepAlive(true, 200);

                        mapper[num] = conn;
                        return;
                    }

                }
                
                if(mapper[num] != undefined) {
                    if(mapper[num].write(real_data) == false) {
                        send_data(Buffer.from("PTSTP", num));
                    }
                }

            });

            clients.push(socket);
        }).listen({port: local_port, host: local_host});
    }
}
function send_data(data, referPort) {
    for(let i of clients) {
        if(i.paused == false || i.paused == undefined) {
            //表明没有阻塞，那么发送数据
            let num_buffer = Buffer.allocUnsafe(2).writeUInt16LE(referPort);

            let send_block = i.write(Buffer.concat([num_buffer, data]));

            if(!send_block) {
                //发送后阻塞
                i.paused = true;
            }

            return send_block;
        }
    }
}