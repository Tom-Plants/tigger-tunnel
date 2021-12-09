const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {handleData, print_allow_write} = require("./common");
const {sd, cd} = require("./common").send_data();
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;

const   tunnel_num = 4;                 //通道数
const   local_port = 8080;             //服务器端口
const   local_host = "0.0.0.0";               //服务器地址

init_server();


function init_server(mapper, clients, new_outgoing) {
    createServer({}, (socket) => {
        let lkdata = handleData((data) => {
            let pkt_num = data.readInt16LE(0);
            let num = data.readUInt16LE(2);
            let real_data = data.slice(4);

            if(real_data.length == 5 && pkt_num == -1) {
                let cmd = real_data.toString();
                if(cmd == "COPEN") {
                    //这里会创建针对mapper[num]的对象
                    if(mapper[num] != undefined) {
                        return;
                    }
                    new_outgoing(num);
                    return;
                }else if(cmd == "PTCLS") {
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

        let found = false;
        for(let i = 0; i < tunnel_num; i++) {
            if(clients[i] == undefined) {
                clients[i] = socket;
                found = true;
                break;
            }
            if(clients[i]._state == 0) {
                clients[i] = socket;
                found = true;
                break;
            }
        }

        if(!found) {
            socket.destroy();
            return;
        }

        reg_client(socket, clients, lkdata);
        socket.on("close", () => {
            socket._state = 0;
        });

    }).listen({port: local_port, host: local_host});
}

function reg_client(socket, clients, lkdata) {
    socket._paused = false;
    socket._state = 1;

    socket.on("error", (e) => {
    }).on("drain", () => {
        socket._paused = false;
        let s_rtn = cd(clients, tunnel_num);
        if(s_rtn == true) {
            tunnel_block = false;
            for(let i in mapper) {
                if(mapper[i] != undefined) mapper[i].s.resume();
            }
        }
    }).on("data", (data) => {
        lkdata(data);
    }).on("timeout", () => {
        socket.end();
    }).setKeepAlive(true, 1000 * 30)
    .setTimeout(1000 * 5);

    return socket;
}

function send_data(data, referPort, current_packet_num, clients) {
    if(referPort == undefined) throw "!";
    return sd(data, referPort, clients, tunnel_num, current_packet_num);
}

module.exports = {
    send_data,
    init_server
}