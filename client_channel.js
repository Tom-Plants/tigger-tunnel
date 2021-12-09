const {createConnection} = require('net');
const {handleData} = require("./common");
const {sd, cd} = require("./common").send_data();

const   tunnel_num = 4;                //通道数
const   target_port = 8080;             //服务器端口
const   target_host = "ru1.0x7c00.site";               //服务器地址

function new_client(lkdata) {
    let client = createConnection({host: target_host, port: target_port})
    .on("connect", () => {
        console.log(target_host, ":", target_port, "connect successfull");
        client._state = 1; //已连接
    })
    .on("error", (e) => {
        console.log(e);
    }).on("drain", () => {
        client._paused = false;
        let s_rtn = cd(clients, tunnel_num);
        if(s_rtn == true) {
            tunnel_block = false;
            for(let j in mapper) {
                if(mapper[j] != undefined) mapper[j].s.resume();
            }
        }
    }).on("data", (data) => {
        lkdata(data);
    }).setKeepAlive(true, 1000 * 30);

    client._paused = false; //未阻塞
    client._state = 0;  //未连接

    return client;
}

function init_clients(mapper, clients) {
    for(let i = 0; i < tunnel_num; i++) {
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
                }
            }
            
            if(mapper[num] != undefined) {
                mapper[num].rh(pkt_num, real_data);
            }

        });
        let client = new_client(lkdata);
        client.on("close", () => {
            client._state = 0;
            console.log("新连接");
            new_client(lkdata);
        });
        clients.push(client);
    }
}

function send_data(data, referPort, current_packet_num, clients) {
    if(referPort == undefined) throw "!";
    return sd(data, referPort, clients, tunnel_num, current_packet_num);
}

module.exports = {
    send_data,
    init_clients
}