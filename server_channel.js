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
        cert: fs.readFileSync("./cert.cert"),
        key: fs.readFileSync("./key.key"),
        ca: fs.readFileSync("./ca.ca")
    }, (socket) => {
        let lkdata = recv_handle((data) => {
            let pkt_num = data.readBigInt64LE(0);
            let num = data.readUInt16LE(8);
            let real_data = data.slice(10);

            if(real_data.length == 5) {
                if(pkt_num == -1) {
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
                            mapper[num].sh.clean();
                            console.log(num, "被清理了");
                            mapper[num].s.destroy();
                            mapper[num].rh.clean();
                            mapper[num].rh = undefined;
                            mapper[num].sh = undefined;
                            mapper[num] = undefined;
                        }
                        return;
                    }else if(cmd == "TLREG") {
                        clearTimeout(socket._auth_timer);

                        if(!push_client(socket)) {
                            socket.destroy();
                            return;
                        }

                        let ack = mix(Buffer.from("TLREG"), -1, 0);
                        socket.write(ack);

                        setTimeout(() => {
                            socket.end();
                            socket._state = 0;
                            //let login = mix(Buffer.from("TLEND"), -1, 0);
                            //socket.write(login);
                            //setTimeout(() => {
                                //socket.end();
                                //socket._state = 0;
                            //}, 1000 * 10);
                        }, 1000 * randomInt(min_tunnel_timeout, max_tunnel_timeout));

                        socket.emit("drain");
                        return;
                    }
                }else {
                    let cmd = real_data.toString();
                    if(cmd == "PTSYN") {    
                        if(mapper[num] != undefined) {
                            mapper[num].sh.sync(pkt_num, mapper, socket);
                        }
                        return;
                    }else if(cmd == "PTRCV") {
                        if(mapper[num] != undefined) {
                            mapper[num].sh.recv(pkt_num, mapper, socket);
                        }
                        return;
                    }
                }

            }

            if(mapper[num] != undefined) {
                mapper[num].rh.recv(pkt_num, real_data);
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
        socket._state = 0;
    }).on("drain", () => {
        socket._paused = false;
        let s_rtn = clear_data();
        if(s_rtn == true) {
            for(let i in mapper) {
                if(mapper[i] != undefined) {
                    mapper[i].sh.drain();
                    if(mapper[i]._cache_paused == false) mapper[i].s.resume();
                }
            }
        }
    }).on("data", (data) => {
        if(socket._state != 1 && data.indexOf("GET ") != -1) {
            socket.write("HTTP/1.1 200 OK\r\nServer: Tigger_Super_HTTP\r\nContent-Length: 38\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\nYou Have no access to request Server !");
            socket.destroy();
            return;
        }
        lkdata(data);
    }).on("close", () => {
        socket._state = 0;
    }).setKeepAlive(true, 1000 * 20);

    socket._auth_timer = setTimeout(() => {
        socket._state = 2;
        socket.destroy();
    }, 1000 * 10);
}

module.exports = {
    init_server
}