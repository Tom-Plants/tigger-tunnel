let get_noblock_tunnel = _get_noblock_tunnel();
/**
 * 处理粘包分包
 * @param data 处理粘包分包
 */

function handleData(callback) {
}

function print_allow_write(clients) {
    let count = 0;
    for(let i of clients) {
        if(i._paused == false) count++;
    }
}

function send_data() {
    let pending_data = [];
    return {
        sd:(data, referPort, clients, tunnel_num, current_packet_num) => {
            let send_buffer = packet_data(data, current_packet_num, referPort);
            pending_data.push(send_buffer);

            let id = get_noblock_tunnel(clients, tunnel_num);
            if(id == -1) {
                return false;
            }
            let is_b = clients[id].write(pending_data.shift());
            if(!is_b) {
                clients[id]._paused = true;
            }
            return true;
        },
        cd:(clients, tunnel_num) => {
            while(true) {
                let send_buffer = pending_data.shift();
                if(send_buffer == undefined) return true;

                let id = get_noblock_tunnel(clients, tunnel_num);
                if(id == -1) {
                    return false;
                }
                let is_b = clients[id].write(pending_data.shift());
                if(!is_b) {
                    clients[id]._paused = true;
                }
            }
        }
    };
}


function _get_noblock_tunnel() {
    let count = 0;
    return (clients, tunnel_num) => {
        let num = count;
        while(true) {
            if(clients[num]._paused == false && clients[num]._state == 1) {
                count = num;
                return num;
            }
            num ++;
            if(num == tunnel_num) { num = 0; }
            if(num == count) { return -1; }
        }
    }
}

module.exports = {
    send_data,
    print_allow_write,
    handleData
}