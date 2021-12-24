const {push_data} = require("./snd_buffer");

function pk_handle(callback, referPort, mapper) {
    let cb = callback;
    let recv_count = 0;
    let buffer = {};
    let rp = referPort;
    let m = mapper;
    
    //延时通知对端已接受的包号
    let data_sync_timer = undefined;
    return (pkt_num, data) => {
        if(pkt_num == recv_count) {
            //console.log("接收到包", rp, recv_count, pkt_num);
            cb(data, rp, recv_count);
            buffer[recv_count] = undefined;
            while(true) {
                recv_count ++;
                if(recv_count == 32767) {
                    recv_count = 0
                }
                if(buffer[recv_count] != undefined) {
                    //console.log("接收到包", rp, recv_count, pkt_num);
                    cb(buffer[recv_count], rp, recv_count);
                    buffer[recv_count] = undefined;
                }else break;
            }

            if(data_sync_timer != undefined) {
                clearTimeout(data_sync_timer);
                data_sync_timer = undefined;
            }
            data_sync_timer = setTimeout(() => {
                //发送接收到的包的指针
                console.log(rp, recv_count, "同步");
                push_data(Buffer.from("PTSYN"), rp, recv_count);    //请求重传包, 如果重传包没发到位，则定时器会控制继续发送

                data_sync_timer = undefined;
            }, 100);
        }else {
            if(pkt_num < recv_count || (pkt_num-recv_count) > 10000) {
            } else { buffer[pkt_num] = data; }
        }


        if(m[rp] == undefined) {
            console.log("强制关闭");
            push_data(Buffer.from("PFCLS"), 0, -1);
            return;
        }

    }
}

function st_handle(referPort) {
    let send_count = 0;
    let synced_send_count = 0;
    let data_sync_timer = undefined;
    let cached_buffer = [];
    cached_buffer.length = 32767;
    let sended_cache_point = 0; //被它指到的单元还没释放
    let rp = referPort;
    let paused = false;
    return {
        send: (data) => {
            if(send_count == 32767) {
                send_count = 0;
            }

            cached_buffer[send_count] = data;

            if(data_sync_timer != undefined) {
                clearInterval(data_sync_timer);
                data_sync_timer = undefined;
            }

            data_sync_timer = setInterval(() => {
                if(synced_send_count == send_count) {
                    //console.log("不需要重传");
                    return;
                }
                //发送接收到的包的指针
                console.log("发现", rp, "的", synced_send_count, "-", send_count  , "需要重传");

                let _send_count = synced_send_count;
                while(true) {
                    if(_send_count == 32767) {
                        _send_count = 0;
                    }

                    if(_send_count == send_count) {
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
                                console.log(send_count, synced_send_count, _send_count, rp, "检测到无法传输的数据，关闭定时器");
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
            if(count < synced_send_count || (count-synced_send_count) > 10000) {
                //console.log("出现异样");
                return;
            }

            //console.log("接收到PTSYN的包", rp, count);
            synced_send_count = count;  //同步已经发送的单元

            while(true) {
                if(sended_cache_point == 32767) {
                    sended_cache_point = 0;
                }

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