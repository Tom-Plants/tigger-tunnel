const {tunnel_num} = require("./client_config");
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
    client._state = 1;
    if(clients.length == tunnel_num) {
        //clients满了，检查clients内有无已经销毁的client
        let found = false;
        for(let i = 0; i < tunnel_num; i++) {
            if(clients[i]._state == 0 && clients[i].connecting == false) {
                //设置销毁的socket为新socket
                clients[i] = client;
                found = true;
                break;
            }
        }
        if(found) {
            return true;
        }
        return false;
    }
    clients.push(client);
    return true;
}

/**
 * 返回可用的客户端
 * @returns {Socket}
 */
function get_noblock_client() {
    let num = client_pointer;
    while(true) {
        if(clients[num]._paused == false && clients[num]._state == 1) {
            client_pointer = num + 1;
            if(client_pointer == tunnel_num) {
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
    let count = 0;
    for(let i = 0; i < tunnel_num; i++) {
        if(clients[i]._state == 1) {
            //有一个无法传输client
            count ++;
            continue;
        }
    }
    if(count >= tunnel_num)
    {
        return false;
    }
    return true;
}

module.exports = {
    push_client,
    get_noblock_client,
    need_new_client
}