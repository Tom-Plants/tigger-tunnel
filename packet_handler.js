const { push_data, unshift_data } = require("./snd_buffer");

function pk_handle(callback, referPort, mapper) {
    let cb = callback;
    let recv_count = 0;
    let buffer = {};
    let rp = referPort;
    let m = mapper;

    //延时通知对端已接受的包号
    let data_sync_timer = undefined;
    return {
        recv: (pkt_num, data) => {
            //每次进入都设定

            if (pkt_num == recv_count) {
                //console.log("接收到包", rp, recv_count, pkt_num);
                cb(data, rp, recv_count);
                buffer[recv_count] = undefined;
                while (true) {
                    recv_count++;
                    //if(recv_count == 1000) {
                    //recv_ratio++;
                    //}
                    if (buffer[recv_count] != undefined) {
                        //console.log("接收到包", rp, recv_count, pkt_num);
                        cb(buffer[recv_count], rp, pkt_num);
                        buffer[recv_count] = undefined;

                    } else break;
                }


            } else {
                if (pkt_num < recv_count) {
                } else { buffer[pkt_num] = data; }
            }


            setImmediate(() => {
                console.log(rp, recv_count, "同步");
                push_data(Buffer.from("PTSYN"), rp, recv_count);    //请求重传包, 如果重传包没发到位，则定时器会控制继续发送
            });
            //clearTimeout(data_sync_timer);
            //data_sync_timer = setTimeout(() => {
            //发送接收到的包的指针
            //}, 100);
            //if(m[rp] == undefined) {
            //console.log("强制关闭");
            //push_data(Buffer.from("PFCLS"), 0, -1);
            //return;
            //}

        }, clean: () => {
            //clearInterval(data_sync_timer);
            //data_sync_timer = undefined;
        }
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

    return {
        send: (data, mapper) => {
            //if(send_count == 1000) {
            //send_count = 0;
            //}

            cached_buffer[send_count] = data;

            //if(data_sync_timer != undefined) {
            //clearInterval(data_sync_timer);
            //data_sync_timer = undefined;
            //}

            if ((BigInt(send_count) - BigInt(synced_send_count)) > 5) {
                if (mapper[rp] != undefined && mapper[rp]._cache_paused == false) {
                    mapper[rp]._cache_paused = true;
                    mapper[rp].s.pause();
                }
            }

            if (data_sync_timer == undefined) {
                data_sync_timer = setInterval(() => {
                    if ((synced_send_count) == send_count) {
                        //console.log("不需要重传");
                        return;
                    }
                    //发送接收到的包的指针
                    console.log("发现", rp, "的", (synced_send_count), "-", send_count, "需要重传");
                    if (paused == true) console.log("通道正忙");

                    let _send_count = synced_send_count;


                    // if (paused == false) {
                    //     if (cached_buffer[_send_count] != undefined) {
                    //         //console.log(_send_count);
                    //         if (push_data(cached_buffer[_send_count], rp, _send_count) == false) {
                    //             paused = true;
                    //         }
                    //     } else {
                    //         if (data_sync_timer != undefined) {
                    //             console.log(send_count, synced_send_count, _send_count, rp, "检测到无法传输的数据，关闭定时器");
                    //             clearInterval(data_sync_timer);
                    //             data_sync_timer = undefined;
                    //         }

                    //     }
                    // } else {
                    //     //console.log("通道正忙");
                    // }

                    while (true) {

                        if (_send_count == send_count) {
                            break;
                        }

                        if (paused == false) {
                            if (cached_buffer[_send_count] != undefined) {
                                //console.log(_send_count);
                                if (push_data(cached_buffer[_send_count], rp, _send_count) == false) {
                                    paused = true;
                                }
                            } else {
                                if (data_sync_timer != undefined) {
                                    console.log(send_count, synced_send_count, _send_count, rp, "检测到无法传输的数据，关闭定时器");
                                    clearInterval(data_sync_timer);
                                    data_sync_timer = undefined;
                                }

                            }
                        } else {
                            //console.log("通道正忙");
                            break;
                        }
                        _send_count++;
                    }
                }, 1000 * 1);
            }
            return send_count++;
        },
        clean: () => {
            if (data_sync_timer != undefined) {
                clearInterval(data_sync_timer);
                data_sync_timer = undefined;
            }
        },
        sync: (count, mapper, socket) => {
            if (count < synced_send_count) {
                return;
            }

            console.log("接收到同步信号", rp, count);

            //console.log("接收到PTSYN的包", rp, count);
            synced_send_count = count;  //同步已经发送的单元

            if ((BigInt(send_count) - BigInt(count)) <= 5) {
                if (mapper[rp] != undefined) {
                    mapper[rp]._cache_paused = false;
                    socket.emit("drain");   //触发流完事件
                }
            }

            while (true) {
                if (sended_cache_point == synced_send_count) {
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