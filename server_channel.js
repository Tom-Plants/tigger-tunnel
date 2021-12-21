const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {recv_handle} = require("./rcv_buffer");
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;
const {push_client} = require("./clients_controller");
const {clear_data} = require("./snd_buffer");
const {s_local_port, s_local_host, max_tunnel_timeout, min_tunnel_timeout} = require("./config");
const {randomInt} = require("crypto");
const send_data = require("./snd_buffer").push_data;
const fs = require('fs');
const tls = require("tls");
const mix = require("./mix_packet");
const config = require("./config");
const get_Q = require("./send_q_getter").get_port_send_Q;

let timer_mapper = {};

function init_server(mapper, new_outgoing) {
    tls.createServer({
        allowHalfOpen: true,
        cert: fs.readFileSync("./certificate.pem"),
        key: fs.readFileSync("./key.pem")
    }, (socket) => {
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
                }else if(cmd == "PTCHK") {
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
                    socket.destroy();
                    socket._state = 0;
                }
            }

            if(mapper[num] != undefined) {
                mapper[num].rh(pkt_num, real_data);
            }

        });

        if(timer_mapper[socket.remoteAddress] != undefined) {
            if(timer_mapper[socket.remoteAddress][socket.remotePort] != undefined) {
                clearTimeout(timer_mapper[socket.remoteAddress][socket.remotePort]);
                timer_mapper[socket.remoteAddress][socket.remotePort] = undefined;
            }
        }

        reg_client(socket, lkdata, mapper);

    }).listen({port: s_local_port, host: s_local_host}).on("connection", (_socket) => {
        let timer = setTimeout(() => {
            if(!_socket.destroyed) {
                _socket.destroy();
            }
            if(timer_mapper[_socket.remoteAddress] != undefined) {
                timer_mapper[_socket.remoteAddress][_socket.remotePort] = undefined;
            }
        }, 1000 * 10);

        timer_mapper[_socket.remoteAddress] = {
            [_socket.remotePort]: timer
        };
    });
}

function reg_client(socket, lkdata, mapper) {
    socket.on("error", (e) => {
        console.log(e);
    }).on("drain", () => {
        socket._paused = false;
        let s_rtn = clear_data();
        if(s_rtn == true) {
            for(let i in mapper) {
                if(mapper[i] != undefined) {
                    if(mapper[i]._paused == false) mapper[i].s.resume();
                }
            }
        }
    }).on("data", (data) => {
        if(data.toString() == "HELLOHUZHIJIAN2000") {
            clearTimeout(socket._auth_timer);

            if(!push_client(socket)) {
                let FIN = mix(Buffer.from("TLRST"), -1, 0);

                socket.write(FIN, () => {
                    let self_check = setInterval(() => {
                        get_Q(socket.remotePort, (a) => {
                            if(a == "0") {
                                clearInterval(self_check);
                                socket.destroy();
                            }
                        })
                    }, 1000);
                });

                return;
            }


            setTimeout(() => {
                let FIN = mix(Buffer.from("TLFIN"), -1, 0);

                socket.write(FIN, () => {
                    //let self_check = setInterval(() => {
                        //get_Q(socket.remoteAddress, (a) => {
                            //if(a == "0") {
                                //clearInterval(self_check);
                                //socket.destroy();
                                //socket._state = 0;
                            //}
                        //})
                    //}, 1000);
                });
                socket._state = 2;
                //socket._fin_timer = setTimeout(() => {
                    //socket.destroy();
                    //socket._state = 0;
                //}, config.time_wait_timeout);
            }, 1000 * randomInt(min_tunnel_timeout, max_tunnel_timeout));

            socket.emit("drain");
            return;
        }
        lkdata(data);
    }).on("close", () => {
        //socket._state = 0;
    }).on("end", () => {
        //socket.end();
        //socket._state = 0;
    }).setKeepAlive(true, 1000 * 20);

    socket._auth_timer = setTimeout(() => {
        socket.destroy();
    }, 1000 * 10);


}

module.exports = {
    init_server
}