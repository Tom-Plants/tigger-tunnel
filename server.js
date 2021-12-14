const {createConnection} = require('net');
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;
const {init_server} = require("./server_channel");
const send_data = require("./snd_buffer").push_data;
const {s_target_host, s_target_port} = require("./config");

let     mapper = {};

setInterval(show_mapper(mapper), 1000);

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
    return () => {
        console.log("vvvvvvvvvvvvvvvvvvvvvvv");
        for(let i in mapper) {
            if(mapper[i] != undefined) {
                console.log(i, mapper[i].s.bytesWritten, mapper[i].s.bytesRead, "read:", mapper[i].s.isPaused(), "write", mapper[i]._paused);
            }
        }
        console.log("^^^^^^^^^^^^^^^^^^^^^^^");

    }
}

init_server(mapper, new_outgoing);

function new_outgoing(num) {


    let conn = createConnection({host: s_target_host, port: s_target_port, allowHalfOpen: true});

    mapper[num] = {
        s:conn,
        sh: st(),
        rh: ph(data_recive, num),
        _paused: false
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
        if((await send_data(data, num, cur)) == false) {
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