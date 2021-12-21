const {createConnection} = require('net');
const {recv_handle} = require("./rcv_buffer");
const {target_host, target_port} = require("./config");
const {clear_data} = require("./snd_buffer");
const { push_client, need_new_client } = require('./clients_controller');
const send_data = require("./snd_buffer").push_data;
const tls = require("tls");
const fs = require('fs');
const config = require("./config");
const mix = require("./mix_packet");
const get_Q = require("./send_q_getter").get_port_send_Q;

let timer_mapper = {};

function new_client(mapper) {
    let client = tls.connect(
        {
            host: target_host,
            port: target_port,
            allowHalfOpen: true,
            ca: fs.readFileSync("./certificate.pem"),
            checkServerIdentity: (host, cert) => {
                return undefined;
            }
        }, () => {

            if(timer_mapper[client.localPort] != undefined) {
                clearTimeout(timer_mapper[client.localPort]);
                timer_mapper[client.localPort] = undefined;
            }

            if(!push_client(client)) {
                let ACK = mix(Buffer.from("TLFIN"), -1, 0);
                client.write(ACK, () => {
                    let self_check = setInterval(() => {
                        get_Q(client.localPort, (a) => {
                            if(a == "0") {
                                client.destroy();
                                clearInterval(self_check);
                            }
                        })
                    }, 1000);
                });
                return;
            }
            client._state = 2;
            //发送客户端唯一标识
            client.write(Buffer.from("HELLOHUZHIJIAN2000"), () => {
                let count = 0;
                let self_check = setInterval(() => {
                    get_Q(client.localPort, (a) => {
                        count ++;
                        if(a == "0") {
                            clearInterval(self_check);
                            client._state = 1;
                            client.emit("drain");
                            return;
                        }
                        if(count >= 10) {
                            clearInterval(self_check);
                            client._state = 0;
                            client.destroy();
                        }
                    })
                }, 1000);
            });
    }).on("connection", (socket) => {
        let timer = setTimeout(() => {
            if(!socket.destroyed) {
                socket.destroy();
            }
            timer_mapper[socket.localPort] = undefined;
        }, 1000 * 10);
        timer_mapper[socket.localPort] = timer;
    });

    let lkdata = recv_handle((data) => {
        let pkt_num = data.readInt16LE(0);
        let num = data.readUInt16LE(2);
        let real_data = data.slice(4);

        if(real_data.length == 5 && pkt_num == -1) {
            let cmd = real_data.toString();

            if(cmd == "PTCHK") {
                if(mapper[num] == undefined) {
                    send_data(Buffer.from("PFCLS"), num, -1);
                }
                return;
            }else if(cmd == "PFCLS") {
                if(mapper[num] != undefined) {
                    mapper[num].s.destroy();
                    mapper[num].rh = undefined;
                    mapper[num].sh = undefined;
                    mapper[num] = undefined;
                }
                return;
            }else if(cmd == "TLFIN") {
                let ACK = mix(Buffer.from("TLFIN"), -1, 0);
                client.write(ACK, () => {
                    let self_check = setInterval(() => {
                        get_Q(client.localPort, (a) => {
                            if(a == "0") {
                                clearInterval(self_check);
                                client.destroy();
                                client._state = 0;
                            }
                        })
                    }, 1000);
                });
                client._state = 2;
            }else if(cmd == "TLRST") {
                client.destroy();
                client._state = 0;
            }
        }
        
        if(mapper[num] != undefined) {
            mapper[num].rh(pkt_num, real_data);
        }

    });

    //client.on("connect", () => {
        ////console.log(target_host, ":", target_port, "connect successfull");
    //})
    
    client.on("error", (e) => {
        console.log(e);
    }).on("drain", () => {
        client._paused = false;
        let s_rtn = clear_data();
        if(s_rtn == true) {
            for(let j in mapper) {
                if(mapper[j] != undefined) {
                    if(mapper[j]._paused == false) mapper[j].s.resume();
                }
            }
        }
    }).on("data", (data) => {
        lkdata(data);
    }).on("close", () => {
        //client._state = 0;
    }).on("end", () => {
        //client.end();
        //client._state = 0;
    }).setKeepAlive(true, 1000 * 30);
}

function init_clients(mapper) {
    if(need_new_client()) {
        new_client(mapper);
    }
}



module.exports = {
    init_clients
}