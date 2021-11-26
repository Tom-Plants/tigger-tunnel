const Client = require('net').Socket;
const {Server, createServer, createConnection} = require('net');
const {randomInt} = require("crypto");
const {handleData, print_allow_write} = require("./common");
const sd = require("./common").send_data;

const   tunnel_num = 8;                 //通道数
const   target_port = 444;             //服务器端口
const   target_host = "localhost";               //服务器地址
const   local_port = 8080;             //本地监听端口
const   local_host = "0.0.0.0";                //本地监听地址

let     clients = [];
let     pending_data = [];
let     mapper = {};

init_server()();

let lkdata = handleData((data) => {
    let num = data.readUInt16LE(0);
    let real_data = data.slice(2);
    console.log("<<<", num, real_data);
    if(real_data.length == 5) {
        let cmd = real_data.toString();
        if(cmd == "PTCLS") {
            if(mapper[num] != undefined) {
                mapper[num].destroy();
                mapper[num] = undefined;
            }
            return;
        }else if(cmd == "CHALF") {
            if(mapper[num] != undefined) {
                mapper[num].end();
            }
            return;
        }else if(cmd == "PTCTN") {
            if(mapper[num] != undefined) {
                mapper[num].resume();
            }
            return;
        }else if(cmd == "PTSTP") {
            if(mapper[num] != undefined) {
                mapper[num].pause();
            }
            return;
        }else if(cmd == "COPEN") {
            new_outgoing(num);
            return;
        }

    }
    
    if(mapper[num] != undefined) {
        if(mapper[num].write(real_data) == false) {
            send_data(Buffer.from("PTSTP", num));
        }
    }

});

function new_outgoing(num) {
    let conn = createConnection({host: target_host, port: target_port, allowHalfOpen: true}, () => {
        send_data(Buffer.from("PTCTN", num));
    }).on("end", () => {
        send_data(Buffer.from("SHALF"), num);
    }).on("data", (data) => {
        if(send_data(data, num) == false) {
            conn.pause();
            console.log(num, "tunnel塞住了,推不出去");
        }
    }).on("close", () => {
        send_data(Buffer.from("PTCLS", num));
        if(mapper[num] != undefined) {
            mapper[num].destroy();
            mapper[num] = undefined;
        }
    })
    .on("error", (e) => {
        console.log(e);
    })
    .on("drain", () => {
        send_data(Buffer.from("PTCTN"), num);
    }).setKeepAlive(true, 200);

    mapper[num] = conn;
    send_data(Buffer.from("PTCTN"), num);

}

function init_server() {
    let connected_count = 0;
    
    return () => {
        createServer({}, (socket) => {
            socket._paused = false;
            ++connected_count;
            if(connected_count == tunnel_num) {
                console.log("ALL tunnel has successfull connected !");
            }else if(connected_count > tunnel_num) {
                socket.destroy();
                --connected_count;
                return;
            }


            socket.on("error", (e) => {
                console.log(e);
            }).on("close", () => {
                --connected_count;
                console.log("tunnel has down");
            }).on("drain", () => {
                socket._paused = false;
                for(let i in mapper) {
                    if(mapper[i] != undefined) mapper[i].resume();
                }
            }).on("data", (data) => {
                lkdata(data);
            });

            clients.push(socket);
        }).listen({port: local_port, host: local_host});
    }
}

function send_data(data, referPort) {
    if(referPort == undefined) throw "!";
    console.log(">>>", referPort, data);
    sd(data, referPort, clients);
}