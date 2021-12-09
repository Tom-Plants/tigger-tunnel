let get_noblock_tunnel = _get_noblock_tunnel();
/**
 * 处理粘包分包
 * @param data 处理粘包分包
 */

function handleData(callback) {
    let packetData = null;
    let value = (callback == undefined ? () => {} : callback);
    return (data) => {
        let d1 = data;
        if(packetData != null) { d1 = Buffer.concat([packetData, d1]); }
        let packet_length;
        while(true) {
            if(d1.length <= 4)
            {
                packetData = d1;
                break;
            }
            packet_length = d1.readUInt32LE(0);

            if(packet_length == d1.length - 4)
            {
                packetData = null;
                value(d1.slice(4, d1.length));
                break;
            }else {
                if(packet_length > d1.length - 4) //没接收完
                {
                    packetData = d1;
                    break;
                }
                else if(packet_length < d1.length - 4) //接过头了
                {
                    //有可能多次接过头，则循环处理
                    let left = d1.slice(4, packet_length + 4);
                    let right = d1.slice(packet_length + 4, d1.length);

                    value(left);
                    packetData = right;
                    d1 = right;
                }
            }

        }
    };
}

function print_allow_write(clients) {
    let count = 0;
    for(let i of clients) {
        if(i._paused == false) count++;
    }
}

function send_data() {
    return (data, referPort, clients, tunnel_num, current_packet_num) => {
        let num_buffer = Buffer.allocUnsafe(8);
        num_buffer.writeUInt32LE(data.length + 4, 0);
        num_buffer.writeInt16LE(current_packet_num, 4);
        num_buffer.writeUInt16LE(referPort, 6);
        let send_buffer = Buffer.concat([num_buffer, data]);

        let {id, count} = get_noblock_tunnel(clients, tunnel_num);
        if(id == -1) {
            clients[count].write(send_buffer);
            return false;
        }
        let is_b = clients[id].write(send_buffer);
        if(!is_b) {
            clients[id]._paused = true;
        }
        return true;
    };
}

function _get_noblock_tunnel() {
    let count = 0;
    return (clients, tunnel_num) => {
        let num = count;
        while(true) {
            if(clients[num]._paused == false) {
                count = num;
                if(++count == tunnel_num) {
                    count = 0;
                }
                return {id: num, count};
            }
            num ++;
            if(num == tunnel_num) { num = 0; }
            if(num == count) { return {id: -1, count}; }
        }
    }
}

module.exports = {
    send_data,
    print_allow_write,
    handleData
}