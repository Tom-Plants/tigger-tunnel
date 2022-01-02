const { recv_handle } = require("./rcv_buffer");

//导入两个，懒得写
const push_client_s = require("./clients_controller").push_client;//服务器用
const resume_all_s = require("./clients_controller").resume_all;
const pause_all_s = require("./clients_controller").pause_all;
const { push_client, need_new_client, resume_all, pause_all } = require('./clients_controller2');  //客户端用

//依旧导入两个，懒得写
const clear_data_s = require("./snd_buffer").clear_data;    //服务器用
const push_data_s = require("./snd_buffer").push_data;
const { clear_data, push_data } = require("./snd_buffer2"); //客户端用

const { s_local_port, s_local_host, max_tunnel_timeout, min_tunnel_timeout, target_host, target_port } = require("./config");

const { randomInt } = require("crypto");

const fs = require('fs');
const tls = require("tls");
const mix = require("./mix_packet");
const config = require("./config");

let timer_mapper = {};

function init_server() {
    tls.createServer({
        cert: fs.readFileSync("./certificate.pem"),
        key: fs.readFileSync("./key.pem")
    }, (socket) => {
        let lkdata = recv_handle((data) => {
            let pkt_num = data.readBigInt64LE(0);
            let num = data.readUInt16LE(8);
            let real_data = data.slice(10);

            if (real_data.length == 5) {
                let cmd = real_data.toString();
                if (cmd == "TLREG") {
                    clearTimeout(socket._auth_timer);

                    if (!push_client_s(socket)) {
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
            }

            console.log(num, pkt_num, real_data);
            if(push_data(real_data, num, pkt_num) == false) {
                socket.pause();
            }

        });

        if (timer_mapper[socket.remoteAddress] != undefined) {
            if (timer_mapper[socket.remoteAddress][socket.remotePort] != undefined) {
                clearTimeout(timer_mapper[socket.remoteAddress][socket.remotePort]);
                timer_mapper[socket.remoteAddress][socket.remotePort] = undefined;
            }
        }

        reg_client(socket, lkdata);

    }).listen({ port: s_local_port, host: s_local_host }).on("connection", (_socket) => {
        let timer = setTimeout(() => {
            if (!_socket.destroyed) {
                _socket.destroy();
            }
            if (timer_mapper[_socket.remoteAddress] != undefined) {
                timer_mapper[_socket.remoteAddress][_socket.remotePort] = undefined;
            }
        }, 1000 * 10);

        timer_mapper[_socket.remoteAddress] = {
            [_socket.remotePort]: timer
        };
    });
}

function reg_client(socket, lkdata) {
    socket.on("error", (e) => {
        console.log(e);
        socket._state = 0;
    }).on("drain", () => {
        socket._paused = false;
        let s_rtn = clear_data();
        if (s_rtn == true) {
            resume_all(); //对于服务器来说，流完了应该重新打开
        }
    }).on("data", (data) => {
        if (socket._state != 1 && data.indexOf("GET ") != -1) {
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

function new_client() {
    let client = tls.connect({
        host: target_host,
        port: target_port,
        //allowHalfOpen: true,
        //ca: fs.readFileSync("./certificate.pem"),
    }, () => {

        if (timer_mapper[client.localPort] != undefined) {
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

        if (real_data.length == 5) {

            let cmd = real_data.toString();
            if (cmd == "TLREG") {
                if (!push_client(client)) {
                    client.destroy();
                    return;
                }

                setTimeout(() => {
                    client.end();
                    client._state = 0;
                }, 1000 * randomInt(min_tunnel_timeout, max_tunnel_timeout));

                client.emit("drain");
                return;
            }
        }

        //发到远端
        console.log(num, pkt_num, real_data);
        if (push_data_s(real_data, num, pkt_num) == false) {
            client.pause();
        }

    });

    //client.on("connect", () => {
    ////console.log(target_host, ":", target_port, "connect successfull");
    //})

    client.on("error", (e) => {
        console.log(e);
        client._state = 0;
    }).on("drain", () => {
        let s_rtn = clear_data();
        if (s_rtn == true) {
            resume_all_s();
        }
    }).on("data", (data) => {
        lkdata(data);
    }).on("close", () => {
        client._state = 0;
    }).setKeepAlive(true, 1000 * 30);
}

function init_clients() {
    if (need_new_client()) {
        new_client();
    }
}

init_server();

setInterval(() => {
    init_clients();
}, 300);