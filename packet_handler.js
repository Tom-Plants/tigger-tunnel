const {push_data} = require("./snd_buffer");

function pk_handle(callback, referPort, mapper) {
    let cb = callback;
    let recv_count = 0;
    let buffer = {};
    let rp = referPort;
    let m = mapper;
    let recv_ratio = 0;
    
    //延时通知对端已接受的包号
    let data_sync_timer = undefined;
    let real_pkg_num = (pkt) => {
        return recv_ratio * 32767 + pkt;
    }
    return (pkt_num, data) => {
        if(pkt_num == recv_count) {
            //console.log("接收到包", rp, recv_count, pkt_num);
            cb(data, rp, real_pkg_num(recv_count));
            buffer[real_pkg_num(recv_count)] = undefined;
            while(true) {
                recv_count ++;
                if(recv_count == 32767) {
                    recv_count = 0;
                    recv_ratio++;
                }
                if(buffer[real_pkg_num(recv_count)] != undefined) {
                    //console.log("接收到包", rp, recv_count, pkt_num);
                    cb(buffer[real_pkg_num(recv_count)], rp, real_pkg_num(real_pkg_num));
                    buffer[real_pkg_num(recv_count)] = undefined;
                }else break;
            }

            if(data_sync_timer != undefined) {
                clearTimeout(data_sync_timer);
                data_sync_timer = undefined;
            }
            data_sync_timer = setTimeout(() => {
                //发送接收到的包的指针
                console.log(rp, real_pkg_num(pkt_num), "同步");
                push_data(Buffer.from("PTSYN"), rp, recv_count);    //请求重传包, 如果重传包没发到位，则定时器会控制继续发送

                data_sync_timer = undefined;
            }, 1);
        }else {
            if(real_pkg_num(pkt_num) < recv_count) {
            } else { buffer[pkt_num] = data; }
        }


        //if(m[rp] == undefined) {
            //console.log("强制关闭");
            //push_data(Buffer.from("PFCLS"), 0, -1);
            //return;
        //}

    }
}

function st_handle(referPort) {
    let send_count = 0;
    let synced_send_count = 0;
    let data_sync_timer = undefined;
    let cached_buffer = {};
    let sended_cache_point = 0; //被它指到的单元还没释放
    let rp = referPort;
    let paused = false;
    let recv_ratio = 0;

    let real_pkg_num = (pkt) => {
        return recv_ratio * 32767 + pkt;
    }
    return {
        send: (data) => {
            if(send_count == 32767) {
                send_count = 0;
                recv_ratio++;
                console.log(rp, "升级拉，当前为", recv_ratio);
            }

            cached_buffer[real_pkg_num(send_count)] = data;

            if(data_sync_timer != undefined) {
                clearInterval(data_sync_timer);
                data_sync_timer = undefined;
            }

            data_sync_timer = setInterval(() => {
                if(real_pkg_num(synced_send_count) == real_pkg_num(send_count)) {
                    //console.log("不需要重传");
                    return;
                }
                //发送接收到的包的指针
                console.log("发现", rp, "的", real_pkg_num(synced_send_count), "-", real_pkg_num(send_count)  , "需要重传");

                let _send_count = real_pkg_num(synced_send_count);
                while(true) {

                    if(_send_count == real_pkg_num(send_count)) {
                        break;
                    }

                    if(paused == false) {
                        if(cached_buffer[_send_count] != undefined) {
                            //console.log(_send_count);
                            if(push_data(cached_buffer[_send_count], rp, _send_count) == false) {
                                paused = true;
                            }
                        }else {
                            if(data_sync_timer != undefined) {
                                console.log(send_count, real_pkg_num(synced_send_count), _send_count, rp, "检测到无法传输的数据，关闭定时器");
                                clearInterval(data_sync_timer);
                                data_sync_timer = undefined;
                            }

                        }
                    }else {
                        //console.log("通道正忙");
                    }
                    _send_count++;
                }
            }, 1000 * 1);

            return send_count++;
        },
        clean: () => {
            if(data_sync_timer != undefined) {
                clearInterval(data_sync_timer);
                data_sync_timer = undefined;
            }
        },
        sync: (count) => {
            if(real_pkg_num(count) < real_pkg_num(synced_send_count)) {
                return;
            }

            console.log("接收到同步信号", rp, real_pkg_num(count));

            //console.log("接收到PTSYN的包", rp, count);
            synced_send_count = real_pkg_num(count);  //同步已经发送的单元

            while(true) {
                if(sended_cache_point == synced_send_count) {
                    break;
                }
                //console.log("清除", rp, sended_cache_point);
                cached_buffer[sended_cache_point] = undefined;

                sended_cache_point++;
            }
        },
        drain: () => {
            paused = false;
        }
    }
}

module.exports = {
    pk_handle,
    st_handle
}