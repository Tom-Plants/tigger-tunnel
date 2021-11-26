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
    console.log("可写管道：", count);
}

function send_data(data, referPort, clients) {
    let num_buffer = Buffer.allocUnsafe(6);
    num_buffer.writeUInt32LE(data.length + 2, 0);
    num_buffer.writeUInt16LE(referPort, 4);
    let send_buffer = Buffer.concat([num_buffer, data]);

    for(let i of clients) {
        if(i._paused == false || i._paused == undefined) {
            //表明没有阻塞，那么发送数据

            let send_block = i.write(send_buffer);

            if(!send_block) {
                //发送后阻塞
                i._paused = true;
            }else {
                i._paused = false;
            }

            return send_block;
        }
    }
    //随便选一个通道发出去
    let index = randomInt(tunnel_num);
    clients[index].write(send_buffer);
    return false;
}

module.exports = {
    send_data,
    print_allow_write,
    handleData
}