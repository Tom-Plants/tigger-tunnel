const {createConnection} = require('net');
const {recv_handle} = require("./rcv_buffer");
const {target_host, target_port} = require("./config");
const {clear_data} = require("./snd_buffer");
const { push_client, need_new_client } = require('./clients_controller');
const send_data = require("./snd_buffer").push_data;
const zlib = require("zlib");

let m_data_length = 0;
let real_data_length = 0;


function new_client(lkdata, mapper) {
    let client = createConnection({host: target_host, port: target_port, allowHalfOpen: true})
    .on("connect", () => {
        //console.log(target_host, ":", target_port, "connect successfull");
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
                if(mapper[j] != undefined) {
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
        client._state = 0;
    }).setKeepAlive(true, 1000 * 30);
}

function init_clients(mapper) {
    let lkdata = recv_handle((data) => {
        let pkt_num = data.readInt16LE(0);
        let num = data.readUInt16LE(2);
        let real_data = data.slice(4);
        real_data = zlib.unzipSync(real_data);

        m_data_length += data.length;
        real_data_length += real_data.length;

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
            }
        }
        
        if(mapper[num] != undefined) {
            mapper[num].rh(pkt_num, real_data);
        }

    });
    if(need_new_client()) {
        new_client(lkdata, mapper);
    }
}

function getCompresstion() {
    return {cps:(real_data_length - m_data_length) / real_data_length, m: m_data_length, r: real_data_length};
}

module.exports = {
    init_clients,
    getCompresstion
}