const {uncompress} = require("./async_compress");
/**
 * 每一条线都需要一个粘包处理器
 * @param {*} callback 
 * @returns 
 */
function recv_handle(callback) {
    let packetData = null;
    let value = (callback == undefined ? () => {} : callback);
    return async (data) => {
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
                value(await uncomp(d1.slice(4, d1.length)));
                //value(d1.slice(4, d1.length));
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

                    value(await uncomp(left));
                    //value(left);
                    packetData = right;
                    d1 = right;
                }
            }

        }
    };
}

async function uncomp(data) {
    let _data = Buffer.from(await uncompress(data));
    return _data;
}

module.exports = {
    recv_handle
}