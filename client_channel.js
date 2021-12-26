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
            //ca: fs.readFileSync("./certificate.pem"),
            
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
                    return;
                }
            }else {
                let cmd = real_data.toString();
                if(cmd == "PTSYN") {
                    if(mapper[num] != undefined) {
                        mapper[num].sh.sync(pkt_num);
                    }
                    return;
                }
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
        client._state = 2;
    }).on("drain", () => {
        client._paused = false;
        let s_rtn = clear_data();
        if(s_rtn == true) {
            for(let j in mapper) {
                if(mapper[j] != undefined) {
                    mapper[j].sh.drain();
                    if(mapper[j]._paused == false) mapper[j].s.resume();
                }
            }
        }
    }).on("data", (data) => {
        lkdata(data);
    }).on("close", () => {
        client._state = 0;
    }).on("end", () => {
        client.end();
        client._state = 2;
    }).setKeepAlive(true, 1000);
}

function init_clients(mapper) {
    if(need_new_client()) {
        new_client(mapper);
    }
}



module.exports = {
    init_clients
}