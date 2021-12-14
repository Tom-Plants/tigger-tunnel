const {createServer} = require('net');
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;
const {init_clients} = require("./client_channel");
const send_data = require("./snd_buffer").push_data;
const {local_port, local_host} = require("./config");

let     mapper = {};

init_local_server();

setInterval(() => {
    init_clients(mapper);
    show_mapper(mapper);
}, 1000);

setInterval(() => {
    check_dead_conn(mapper);
}, 1000 * 60);

function check_dead_conn(mapper) {
    for(let i in mapper) {
        if(mapper[i] != undefined) {
            send_data(Buffer.from("PTCHK"), i, -1);
        }
    }
}

function show_mapper(mapper) {
    console.log("vvvvvvvvvvvvvvvvvvvvvvv");
    for(let i in mapper) {
        if(mapper[i] != undefined) {
            console.log(i, mapper[i].s.bytesWritten, mapper[i].s.bytesRead, "read:", mapper[i].s.isPaused(), "write", mapper[i]._paused);
        }
    }
    console.log("^^^^^^^^^^^^^^^^^^^^^^^");
}

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
        mapper[referPort] = {s:socket, sh:st(), rh:ph(data_recive, referPort), _paused: false};

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
        }).on("data", async (data) => {
            if(mapper[referPort] == undefined) {return};
            let cur = mapper[referPort].sh();
            if((await send_data(data, referPort, cur)) == false) {
                for(let i in mapper) {
                    if(mapper[i] != undefined) mapper[i].s.pause();
                }
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
                mapper[referPort]._paused = false;
                mapper[referPort].s.resume();
                return;
            }else if(cmd == "PTSTP") {
                mapper[referPort]._paused = true;
                mapper[referPort].s.pause();
                return;
            }

        }
        if(mapper[referPort].s.write(data) == false) {
            let cur = mapper[referPort].sh();
            send_data(Buffer.from("PTSTP"), referPort, cur);
        }
    }
}