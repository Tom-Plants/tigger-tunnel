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

        let id = get_noblock_tunnel(clients, tunnel_num);
        console.log(id);
        if(id == -1) {
            clients[0].write(send_buffer);
            return false;
        }
        let is_b = clients[id].write(send_buffer);
        console.log("aaa", is_b);
        if(!is_b) {
            clients[id]._paused = true;
        }
        return is_b;
    };
}

function get_noblock_tunnel(clients, tunnel_num) {
    for(let i = 0; i < tunnel_num; i++)
    {
        if(clients[i]._paused == false)
        {
            return i;
        }

    }
    return -1;
}

module.exports = {
    send_data,
    print_allow_write,
    handleData
}