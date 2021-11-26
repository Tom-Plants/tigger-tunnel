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
                let pkt_num = data.readInt8(0);
                let num = data.readUInt16LE(1);
                let real_data = data.slice(3);
                if(real_data.length == 5 && pkt_num == -1) {
                    let cmd = real_data.toString();
                    if(cmd == "PTCLS") {
                        if(mapper[num] != undefined) {
                            mapper[num].s.destroy();
                            mapper[num] = undefined;
                        }
                        return;
                    }else if(cmd == "SHALF") {
                        if(mapper[num] != undefined) {
                            mapper[num].s.end();
                        }
                        return;
                    }else if(cmd == "PTCTN") {
                        if(mapper[num] != undefined) {
                            mapper[num].s.resume();
                        }
                        return;
                    }else if(cmd == "PTSTP") {
                        if(mapper[num] != undefined) {
                            mapper[num].s.pause();
                        }
                        return;
                    }

                }
                
                if(mapper[num] != undefined) {
                    mapper[num].recv_handle[pkt_num] = {
                        data: real_data,
                        next: (pkt_num + 1) == 128 ? 0: pkt_num + 1
                    }

                    let k = true;
                    while(true) {
                        if(mapper[num].current_needed == pkt_num) {
                            if(mapper[num].s.write(mapper[num].recv_handle[pkt_num].data) == false) {
                                if(k) {
                                    send_data(Buffer.from("PTSTP"), num, -1);
                                    k = false;
                                }
                            }
                            mapper[num].current_needed ++;
                            if(mapper[num].current_needed == 128) {
                                mapper[num].current_needed = 0;
                            }
                            pkt_num = mapper[num].recv_handle[pkt_num].next;
                        }else {break;}
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
                    if(mapper[j] != undefined) mapper[j].s.resume();
                }
            }).on("data", (data) => {
                lkdata(data);
            });

            client._paused = false;

            clients.push(client);
        }
    };
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
            send_data(Buffer.from("PTCLS"), referPort, -1);
            if(mapper[referPort] != undefined){
                mapper[referPort].s.destroy();
                mapper[referPort] = undefined;
            }
        }).on("end", () => {
            send_data(Buffer.from("CHALF"), referPort, -1);
        }).on("data", (data) => {
            let cur = mapper[referPort].send_count;
            mapper[referPort].send_count ++;
            if(mapper[referPort].send_count == 128) {
                mapper[referPort].send_count = 0;
            }
            if(send_data(data, referPort, cur) == false) {
                socket.pause();
                //console.log(referPort, "tunnel塞住了,推不出去");
            }
        }).on("error", () => {})
        .on("drain", () => {
            send_data(Buffer.from("PTCTN"), referPort, -1);
        }).setKeepAlive(true, 200);

        mapper[referPort] = {
            s:socket,
            recv_handle: {},
            current_needed: 0,
            send_count: 0
        };
        send_data(Buffer.from("COPEN"), referPort, -1);
    }).listen({port: local_port, host: local_host});
}

function send_data(data, referPort, current_packet_num) {
    print_allow_write(clients);
    if(referPort == undefined) throw "!";
    sd(data, referPort, clients, tunnel_num, current_packet_num);
}