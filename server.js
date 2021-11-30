const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {handleData, print_allow_write} = require("./common");
const sd = require("./common").send_data;
const ph = require("./packet_handler").pk_handle;
const st = require("./packet_handler").st_handle;

const   tunnel_num = 4;                 //通道数
const   target_port = 444;             //服务器端口
const   target_host = "localhost";               //服务器地址
const   local_port = 8080;             //本地监听端口
const   local_host = "0.0.0.0";                //本地监听地址

let     clients = [];
let     pending_data = [];
let     mapper = {};

let     allow_data_transfer = false;    //数据传输标志位

init_server()();


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
            conn.pause();
            // console.log(num, "tunnel塞住了,推不出去");
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


function init_server() {
    let connected_count = 0;
    
    return () => {
        createServer({}, (socket) => {
            let lkdata = handleData((data) => {
                let pkt_num = data.readInt16LE(0);
                let num = data.readUInt16LE(2);
                let real_data = data.slice(4);

                if(real_data.length == 5 && pkt_num == -1) {
                    let cmd = real_data.toString();
                    if(cmd == "COPEN") {
                        //这里会创建针对mapper[num]的对象
                        new_outgoing(num);
                        return;
                    }
                }

                if(mapper[num] != undefined) {
                    mapper[num].rh(pkt_num, real_data);
                }

            });
            socket._paused = false;
            if(!allow_data_transfer) {
                ++connected_count;
                if(connected_count == tunnel_num) {
                    console.log("ALL tunnel has successfull connected !");
                    allow_data_transfer = true;
                }
            }else {
                socket.destroy();
                return;
            }


            socket.on("error", (e) => {
                console.log(e);
            }).on("close", () => {
                console.log("tunnel has down");
            }).on("drain", () => {
                socket._paused = false;
                for(let i in mapper) {
                    if(mapper[i] != undefined) mapper[i].s.resume();
                }
            }).on("data", (data) => {
                lkdata(data);
            }).setKeepAlive(true, 1000 * 60 * 2);

            clients.push(socket);
        }).listen({port: local_port, host: local_host});
    }
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
    }
}

function send_data(data, referPort, current_packet_num) {
    if(referPort == undefined) throw "!";
    return sd(data, referPort, clients, tunnel_num, current_packet_num);
}