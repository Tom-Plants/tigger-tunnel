const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {handleData, print_allow_write} = require("./common");
const sd = require("./common").send_data;
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;

const   tunnel_num = 8;                 //通道数
const   target_port = 444;             //服务器端口
const   target_host = "localhost";               //服务器地址
const   local_port = 8080;             //本地监听端口
const   local_host = "0.0.0.0";                //本地监听地址

let     clients = [];
let     pending_data = [];
let     mapper = {};

init_server()();


function new_outgoing(num) {


    let conn = createConnection({host: target_host, port: target_port, allowHalfOpen: true}, () => {
        send_data(Buffer.from("PTCTN"), num, -1);
    });

    mapper[num] = {
        s:conn,
        sh: st(),
        rh: ph(data_recive, num)
    };

    conn.on("end", () => {
        send_data(Buffer.from("SHALF"), num, -1);
    }).on("data", (data) => {
        let cur = mapper[num].sh();
        console.log(num, cur, data);
        if(send_data(data, num, cur) == false) {
            conn.pause();
            // console.log(num, "tunnel塞住了,推不出去");
        }
    }).on("close", () => {
        send_data(Buffer.from("PTCLS"), num, -1);
        if(mapper[num] != undefined) {
            mapper[num].s.destroy();
            mapper[num].rh = undefined;
            mapper[num].sh = undefined;
            mapper[num] = undefined;
        }
    })
    .on("error", (e) => {
        console.log(e);
    })
    .on("drain", () => {
        send_data(Buffer.from("PTCTN"), num, -1);
    }).setKeepAlive(true, 200);
}


function init_server() {
    let connected_count = 0;
    
    return () => {
        createServer({}, (socket) => {
            let lkdata = handleData((data) => {
                let pkt_num = data.readInt16LE(0);
                let num = data.readUInt16LE(2);
                let real_data = data.slice(4);
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
                    }else if(cmd == "CHALF") {
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
                    }else if(cmd == "COPEN") {
                        new_outgoing(num);
                        return;
                    }

                }
                
                if(mapper[num] != undefined) {
                    mapper[num].rh(pkt_num, real_data);
                }

            });
            socket._paused = false;
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
                socket._paused = false;
                for(let i in mapper) {
                    if(mapper[i] != undefined) mapper[i].s.resume();
                }
            }).on("data", (data) => {
                lkdata(data);
            });

            clients.push(socket);
        }).listen({port: local_port, host: local_host});
    }
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