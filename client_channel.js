const {createConnection} = require('net');
const {recv_handle} = require("./rcv_buffer");
const {min_tunnel_timeout, max_tunnel_timeout, targets} = require("./config");
const {clear_data} = require("./snd_buffer");
const { push_client, need_new_client } = require('./clients_controller');
const send_data = require("./snd_buffer").push_data;
const tls = require("tls");
const fs = require('fs');
const config = require("./config");
const mix = require("./mix_packet");
const get_Q = require("./send_q_getter").get_port_send_Q;
const { randomInt } = require('crypto');

let timer_mapper = {};

function new_client(mapper, target) {
    let client = tls.connect(
        {
            host: target.host,
            port: target.port,
            //allowHalfOpen: true,
            //ca: fs.readFileSync("./certificate.pem"),
            ca: fs.readFileSync("./certificate.pem"),
            checkServerIdentity: (host, cert) => {
                return undefined;
            }
            
        }, () => {

            if(timer_mapper[client.localPort] != undefined) {
                clearTimeout(timer_mapper[client.localPort]);
                timer_mapper[client.localPort] = undefined;
            }

            //发送客户端唯一标识
            let login = mix(Buffer.from("TLREG"), -1, 0);
            client.write(login);
    });

    let lkdata = recv_handle((data) => {
        let pkt_num = data.readBigInt64LE(0);
        let num = data.readUInt16LE(8);
        let real_data = data.slice(10);

        if(real_data.length == 5) {
            
            if(pkt_num == -1) {
                let cmd = real_data.toString();

                if(cmd == "PTCHK") {
                    if(mapper[num] == undefined) {
                        send_data(Buffer.from("PFCLS"), num, -1);
                    }
                    return;
                }else if(cmd == "PFCLS") {
                    if(mapper[num] != undefined) {
                        console.log(num, "被清理了");
                        mapper[num].sh.clean();
                        mapper[num].s.destroy();
                        mapper[num].rh.clean();
                        mapper[num].rh = undefined;
                        mapper[num].sh = undefined;
                        mapper[num] = undefined;
                    }
                    return;
                }else if(cmd == "TLREG") {
                    if(!push_client(client)) {
                        client.destroy();
                        return;
                    }

                    setTimeout(() => {
                        client.end();
                        client._state = 0;
                    }, 1000 * randomInt(min_tunnel_timeout, max_tunnel_timeout));
                    return;
                }
            }else {
                let cmd = real_data.toString();
                if(cmd == "PTSYN") {
                    if(mapper[num] != undefined) {
                        mapper[num].sh.sync(pkt_num, mapper, client);
                    }
                    return;
                }else if(cmd == "PTRCV") {
                    if(mapper[num] != undefined) {
                        mapper[num].sh.recv(pkt_num, mapper, client);
                    }
                    return;
                }
            }
        }
        
        if(mapper[num] != undefined) {
            mapper[num].rh.recv(pkt_num, real_data);
        }

    });

    //client.on("connect", () => {
        ////console.log(target_host, ":", target_port, "connect successfull");
    //})
    
    client.on("error", (e) => {
        console.log(e);
        client._state = 0;
    }).on("drain", () => {
        client._paused = false;
        let s_rtn = clear_data();
        if(s_rtn == true) {
            for(let j in mapper) {
                if(mapper[j] != undefined) {
                    mapper[j].sh.drain();
                    if(mapper[j]._cache_paused == false) mapper[j].s.resume();
                }
            }
        }
    }).on("data", (data) => {
        lkdata(data);
    }).on("close", () => {
        client._state = 0;
    }).setKeepAlive(true, 1000 * 30);
}

function init_clients(mapper) {
    if(need_new_client()) {
        for(let target of targets) {
            new_client(mapper, target);
        }
    }
}



module.exports = {
    init_clients
}