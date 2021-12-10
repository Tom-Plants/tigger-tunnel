const {createConnection} = require('net');
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;
const {init_server} = require("./server_channel");
const send_data = require("./snd_buffer").push_data;

const   target_port = 444;             //服务器端口
const   target_host = "localhost";               //服务器地址

let     mapper = {};

init_server(mapper, new_outgoing);

function new_outgoing(num) {


    let conn = createConnection({host: target_host, port: target_port, allowHalfOpen: true});

    mapper[num] = {
        s:conn,
        sh: st(),
        rh: ph(data_recive, num)
    };

    conn.on("connect", () => {
        if(mapper[num] == undefined) { return };
        let cur = mapper[num].sh();
        send_data(Buffer.from("PTCTN"), num, cur);
    }).on("end", () => {
        if(mapper[num] == undefined) { return };
        let cur = mapper[num].sh();
        send_data(Buffer.from("SHALF"), num, cur);
    }).on("data", (data) => {
        if(mapper[num] == undefined) { return };
        let cur = mapper[num].sh();
        if(send_data(data, num, cur) == false) {
            Object.keys(mapper).map((value) => {
                if(mapper[value] != undefined) {
                    mapper[value].s.pause();
                }
            });
        }
    }).on("close", () => {
        if(mapper[num] == undefined) { return };
        let cur = mapper[num].sh();
        send_data(Buffer.from("PTCLS"), num, cur);
        if(mapper[num] != undefined) {
            mapper[num].s.destroy();
            mapper[num].rh = undefined;
            mapper[num].sh = undefined;
            mapper[num] = undefined;
        }
    })
    .on("error", (e) => {
        console.log(e);
    })
    .on("drain", () => {
        if(mapper[num] == undefined) { return };
        let cur = mapper[num].sh();
        send_data(Buffer.from("PTCTN"), num, cur);
    }).setKeepAlive(true, 200);
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
            }else if(cmd == "CHALF") {
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