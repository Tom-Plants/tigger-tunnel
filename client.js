const {createServer} = require('net');
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;
const {init_clients} = require("./client_channel");
const _send_data = require("./client_channel").send_data;

const   local_port = 10009;             //本地监听端口
const   local_host = "0.0.0.0";                //本地监听地址

let     tunnel_block = false;   //多线程通道堵塞时，该值为true

let     clients = [];
let     mapper = {};

init_local_server();

setInterval(() => {
    init_clients(mapper, clients);
}, 1000);

function init_local_server() {
    return createServer({
        allowHalfOpen: true,
        pauseOnConnect: true
    }, (socket) => {
        let referPort = socket.remotePort;
        if(referPort == undefined || mapper[referPort] != undefined) {
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
    return _send_data(data, referPort, current_packet_num, clients);
}