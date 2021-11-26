const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {randomInt} = require("crypto");

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

            let lkdata = handleData((data) => {
                let num = data.readUInt16LE(0);
                let real_data = data.slice(2);
                if(real_data.length == 5) {
                    let cmd = real_data.toString();
                    if(cmd == "PTCLS") {
                        if(mapper[num] != undefined) {
                            mapper[num].destroy();
                            mapper[num] = undefined;
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
                            if(send_data(data, num) == false) {
                                conn.pause();
                            }
                        }).on("close", () => {
                            send_data(Buffer.from("PTCLS", num));
                            if(mapper[num] != undefined) {
                                mapper[num].destroy();
                                mapper[num] = undefined;
                            }
                        })
                        .on("error", (e) => {
                            console.log(e);
                        })
                        .on("drain", () => {
                            send_data(Buffer.from("PTCTN"), num);
                        }).setKeepAlive(true, 200);

                        mapper[num] = conn;
                        send_data(Buffer.from("PTCTN"), num);
                        return;
                    }

                }
                
                if(mapper[num] != undefined) {
                    if(mapper[num].write(real_data) == false) {
                        send_data(Buffer.from("PTSTP", num));
                    }
                }

            });

            socket.on("error", (e) => {
                console.log(e);
            }).on("close", () => {
                --connected_count;
                console.log("tunnel has down");
            }).on("drain", () => {
                socket._paused = false;
                for(let i in mapper) {
                    if(mapper[i] != undefined) mapper[i].resume();
                }
            }).on("data", (data) => {
                lkdata(data);
            });

            clients.push(socket);
        }).listen({port: local_port, host: local_host});
    }
}
function send_data(data, referPort) {
    let num_buffer = Buffer.allocUnsafe(6);
    num_buffer.writeUInt32LE(data.length + 2, 0);
    num_buffer.writeUInt16LE(referPort, 4);
    let send_buffer = Buffer.concat([num_buffer, data]);

    for(let i of clients) {
        console.log(i._paused);
        if(i._paused == false || i._paused == undefined) {
            //表明没有阻塞，那么发送数据

            let send_block = i.write(send_buffer);

            if(!send_block) {
                //发送后阻塞
                i._paused = true;
                console.log(referPort, "tunnel塞住了,推不出去");
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

/**
 * 处理粘包分包
 * @param data 处理粘包分包
 */
function handleData(callback) {
    let packetData = null;
    let value = (callback == undefined ? () => {} : callback);
    return (data) => {
        let d1 = data;
        if(packetData != null) { d1 = Buffer.concat([packetData, d1]); }
        let packet_length;
        while(true) {
            if(d1.length <= 4)
            {
                packetData = d1;
                break;
            }
            packet_length = d1.readUInt32LE(0);

            if(packet_length == d1.length - 4)
            {
                packetData = null;
                value(d1.slice(4, d1.length));
                break;
            }else {
                if(packet_length > d1.length - 4) //没接收完
                {
                    packetData = d1;
                    break;
                }
                else if(packet_length < d1.length - 4) //接过头了
                {
                    //有可能多次接过头，则循环处理
                    let left = d1.slice(4, packet_length + 4);
                    let right = d1.slice(packet_length + 4, d1.length);

                    value(left);
                    packetData = right;
                    d1 = right;
                }
            }

        }
    };
}