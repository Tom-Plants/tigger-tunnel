const {createConnection} = require('net');
const {recv_handle} = require("./rcv_buffer");
const {target_host, target_port} = require("./client_config");
const {clear_data} = require("./snd_buffer");
const { push_client, need_new_client } = require('./clients_controller');


function new_client(lkdata) {
    let client = createConnection({host: target_host, port: target_port})
    .on("connect", () => {
        console.log(target_host, ":", target_port, "connect successfull");
        if(!push_client(client)) {
            client.destroy();
            return;
        }
        client.emit("drain");
    }).on("error", (e) => {
        console.log(e);
    }).on("drain", () => {
        client._paused = false;
        let s_rtn = clear_data();
        if(s_rtn == true) {
            for(let j in mapper) {
                if(mapper[j] != undefined) mapper[j].s.resume();
            }
        }
    }).on("data", (data) => {
        lkdata(data);
    }).on("close", () => {
        client._state = 0;
    }).setKeepAlive(true, 1000 * 30);
}

function init_clients(mapper) {
    while(true) {
        let lkdata = recv_handle((data) => {
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
                }
            }
            
            if(mapper[num] != undefined) {
                mapper[num].rh(pkt_num, real_data);
            }

        });
        if(need_new_client()) {
            new_client(lkdata);
        }
    }
}

module.exports = {
    init_clients
}