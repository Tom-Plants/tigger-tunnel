const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {handleData, print_allow_write} = require("./common");
const {recv_handle} = require("./rcv_buffer");
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;
const {push_client} = require("./clients_controller");
const {clear_data} = require("./snd_buffer");
const {s_local_port, s_local_host, tunnel_timeout} = require("./config");

function init_server(mapper, new_outgoing) {
    createServer({allowHalfOpen: true}, (socket) => {
        let lkdata = recv_handle((data) => {
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

        if(!push_client(socket)) {
            socket.destroy();
            return;
        }
        socket.emit("drain");

        reg_client(socket, lkdata, mapper);

    }).listen({port: s_local_port, host: s_local_host});
}

function reg_client(socket, lkdata, mapper) {
    socket.on("error", (e) => {
        console.log(e);
    }).on("drain", () => {
        socket._paused = false;
        let s_rtn = clear_data();
        if(s_rtn == true) {
            for(let i in mapper) {
                if(mapper[i] != undefined) mapper[i].s.resume();
            }
        }
    }).on("data", (data) => {
        lkdata(data);
    }).on("timeout", () => {
        socket.end();
        socket._state = 0;
    }).on("close", () => {
        socket._state = 0;
    }).setKeepAlive(true, 1000 * 30)
    .setTimeout(1000 * tunnel_timeout);
}

module.exports = {
    init_server
}