const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {handleData, print_allow_write} = require("./common");
const {sd, cd} = require("./common").send_data();
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;

const   tunnel_num = 32;                 //通道数
const   target_port = 8080;             //服务器端口
const   target_host = "ru1.0x7c00.site";               //服务器地址
const   local_port = 10009;             //本地监听端口
const   local_host = "0.0.0.0";                //本地监听地址

let     allow_data_transfer = false;    //数据传输标志位
let     tunnel_block = false;   //多线程通道堵塞时，该值为true


let     clients = [];
let     pending_data = [];
let     mapper = {};

init_clients()();
init_local_server();


function init_clients() {
    return () => {
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

            let client = createConnection({host: target_host, port: target_port})
            .on("connect", () => {
                console.log(target_host, ":", target_port, "connect successfull");
                client._state = 1; //已连接
                notify_if_connect_success();
            })
            .on("error", (e) => {
            }).on("close", () => {
                client._state = 0;
                client.connect();
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

            clients.push(client);
        }
    };
}

function notify_if_connect_success() {
    let count = 0;
    for(let i of clients) {
        if(i._state == 1) {
            count++;
        }
    }
    if(count == tunnel_num) {
        console.log("ALL tunnel has successfull connected !");
    }
}

function init_local_server() {
    return createServer({
        allowHalfOpen: true,
        pauseOnConnect: true
    }, (socket) => {
        let referPort = socket.remotePort;
        if(referPort == undefined || allow_data_transfer == false || mapper[referPort] != undefined) {
            socket.destroy();
            return;
        }
        //注意释放
        mapper[referPort] = {s:socket, sh:st(), rh:ph(data_recive, referPort)};

        if(tunnel_block == true) {
            socket.pause();
        }

        socket.on("close", () => {
            if(mapper[referPort] == undefined) { return };
            let cur = mapper[referPort].sh();
            send_data(Buffer.from("PTCLS"), referPort, cur);
            if(mapper[referPort] != undefined){
                mapper[referPort].s.destroy();
                mapper[referPort].rh = undefined;
                mapper[referPort].sh = undefined;
                mapper[referPort] = undefined;
            }
        }).on("end", () => {
            if(mapper[referPort] == undefined) { return };
            let cur = mapper[referPort].sh();
            send_data(Buffer.from("CHALF"), referPort, cur);
        }).on("data", (data) => {
            if(mapper[referPort] == undefined) {return};
            let cur = mapper[referPort].sh();
            if(send_data(data, referPort, cur) == false) {
                tunnel_block = true;
                for(let i in mapper) {
                    if(mapper[i] != undefined) mapper[i].s.pause();
                }
                //console.log(referPort, "tunnel塞住了,推不出去");
            }
        }).on("error", () => {})
        .on("drain", () => {
            if(mapper[referPort] == undefined) { return };
            let cur = mapper[referPort].sh();
            send_data(Buffer.from("PTCTN"), referPort, cur);
        }).setKeepAlive(true, 200);

        send_data(Buffer.from("COPEN"), referPort, -1);
    }).listen({port: local_port, host: local_host});
}

function data_recive(data, referPort, pkt) {
    if(mapper[referPort] != undefined) {
        if(data.length == 5) {
            let cmd = data.toString();
            if(cmd == "PTCLS") {
                mapper[referPort].s.destroy();
                mapper[referPort].rh = undefined;
                mapper[referPort].sh = undefined;
                mapper[referPort] = undefined;
                return;
            }else if(cmd == "SHALF") {
                mapper[referPort].s.end();
                return;
            }else if(cmd == "PTCTN") {
                mapper[referPort].s.resume();
                return;
            }else if(cmd == "PTSTP") {
                mapper[referPort].s.pause();
                return;
            }

        }
        if(mapper[referPort].s.write(data) == false) {
            let cur = mapper[referPort].sh();
            send_data(Buffer.from("PTSTP"), referPort, cur);
        }
    }else {
        send_data(Buffer.from("PTCLS"), referPort, -1);
    }
}

function send_data(data, referPort, current_packet_num) {
    if(referPort == undefined) throw "!";
    return sd(data, referPort, clients, tunnel_num, current_packet_num);
}