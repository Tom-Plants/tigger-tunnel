const { get_noblock_client } = require("./clients_controller");
const mix = require("./mix_packet");

let pending_data = [];

/**
 * 返回true：缓冲区接收了这个数据包，上层应用可以继续推入
 * 返回false：缓冲区已满，上层应用需要暂停推入
 */
function push_data(data, referPort, current_packet_num) {
    let send = mix(data, current_packet_num, referPort);
    pending_data.push(send);
    let client = get_noblock_client();
    if(client == undefined) { return false; }
    let is_b = client.write(pending_data.shift());
    if(!is_b) { client._paused = true; }
    return true;
}

/**
 * 返回true：缓冲区接收了这个数据包，上层应用可以继续推入
 * 返回false：缓冲区已满，上层应用需要暂停推入
 */
function unshift_data(data, referPort, current_packet_num) {
    let send = mix(data, current_packet_num, referPort);
    pending_data.unshift(send);
    let client = get_noblock_client();
    if(client == undefined) { return false; }
    let is_b = client.write(pending_data.shift());
    if(!is_b) { client._paused = true; }
    return true;
}

/**
 * 返回true：缓冲区已经干净
 * 返回false：缓冲区还没传送完
 * 会遇到没人手而且buffer为空的情况，这个需要手动通知
 * @param {*} clients 
 * @param {*} tunnel_num 
 */
function clear_data() {
    while(true) {
        let client = get_noblock_client();
        if(client == undefined) return false;
        let send = pending_data.shift();
        if(send == undefined) return true;
        let is_b = client.write(send);
        if(!is_b) { client._paused = true; }
    }
}

module.exports = {
    clear_data,
    push_data,
    unshift_data
}