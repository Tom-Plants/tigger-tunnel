const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {handleData, print_allow_write} = require("./common");
const sd = require("./common").send_data;
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;

const   tunnel_num = 2;                 //通道数
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
                            mapper[num].rh = undefined;
                            mapper[num].sh = undefined;
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
                    mapper[num].rh(pkt_num, real_data);
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
        //注意释放
        mapper[referPort] = {s:socket, sh:st(), rh:ph(data_recive, referPort)};

        socket.on("close", () => {
            send_data(Buffer.from("PTCLS"), referPort, -1);
            if(mapper[referPort] != undefined){
                mapper[referPort].s.destroy();
                mapper[referPort].rh = undefined;
                mapper[referPort].sh = undefined;
                mapper[referPort] = undefined;
            }
        }).on("end", () => {
            send_data(Buffer.from("CHALF"), referPort, -1);
        }).on("data", (data) => {
            let cur = mapper[referPort].sh();
            console.log(referPort, cur, data);
            if(send_data(data, referPort, cur) == false) {
                socket.pause();
                //console.log(referPort, "tunnel塞住了,推不出去");
            }
        }).on("error", () => {})
        .on("drain", () => {
            send_data(Buffer.from("PTCTN"), referPort, -1);
        }).setKeepAlive(true, 200);


        send_data(Buffer.from("COPEN"), referPort, -1);
    }).listen({port: local_port, host: local_host});
}

function data_recive(data, referPort, pkt) {
    console.log(referPort, pkt, data);
    if(mapper[referPort] != undefined) {
        if(mapper[referPort].s.write(data) == false) {
            send_data(Buffer.from("PTSTP"), referPort, -1);
        }
    }
}

function send_data(data, referPort, current_packet_num) {
    if(referPort == undefined) throw "!";
    return sd(data, referPort, clients, tunnel_num, current_packet_num);
}