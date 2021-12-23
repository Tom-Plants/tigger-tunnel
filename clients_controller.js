const {tunnel_num} = require("./config");
const {Socket} = require("net");

/**
 * @var {Array<Socket>} clients
 */
let clients = [];
/**
 * @var {Number} client_pointer
 */
let client_pointer = 0;

/**
 * 返回true，添加成功，返回false，添加失败
 * @param {Socket} client 
 * @returns {Boolean}
 */
function push_client(client) {
    client._paused = false;
    client._state = 1;  //已连接
    for(let i = 0; i < tunnel_num; i++) {
        if(clients[i] == undefined) {
            clients[i] = client;
            return true;
        }
        if(clients[i]._state == 0) {
            clients[i] = client;
            return true;
        }
        if(clients[i].remotePort == undefined) {
            clients[i].destroy();
            return true;
        }
        if(clients[i].localPort == undefined) {
            clients[i].destroy();
            return true;
        }
    }
    return false;
}

/**
 * 返回可用的客户端
 * @returns {Socket}
 */
function get_noblock_client() {
    let num = client_pointer;
    while(true) {
        if(clients[num] != undefined &&
            clients[num]._paused == false &&
            clients[num]._state == 1 &&
            clients[num].remotePort != undefined &&
            clients[num].localPort != undefined) {
            client_pointer = num;
            if((++client_pointer) == tunnel_num) {
                client_pointer = 0;
            }
            return clients[num];
        }
        num ++;
        if(num == tunnel_num) { num = 0; }
        if(num == client_pointer) { return undefined; }
    }
}

function need_new_client() {
    for(let i = 0; i < tunnel_num; i++) {
        if(clients[i] == undefined) {
            return true;
        }
        if(clients[i]._state == 0) {
            return true;
        }
        if(clients[i].remotePort == undefined) {
            return true;
        }
        if(clients[i].localPort == undefined) {
            return true;
        }
    }
    return false;
}

module.exports = {
    push_client,
    get_noblock_client,
    need_new_client,
    clients
}