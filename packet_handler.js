function pk_handle(callback, referPort) {
    let cb = callback;
    let recv_count = 0;
    let buffer = {};
    let rp = referPort;
    return (pkt_num, data) => {
        if(pkt_num == recv_count) {
            cb(data, rp, recv_count);
            while(true) {
                recv_count ++;
                if(recv_count == 128) {
                    recv_count = 0
                }
                if(buffer[recv_count] != undefined) {
                    cb(buffer[recv_count], rp, recv_count);
                }else break;
            }
        }else {
            buffer[pkt_num] = data;
        }

    }
}

function st_handle() {
    let send_count = 0;
    return () => {
        if(send_count == 128) {
            send_count = 0;
        }
        return send_count++;
    }
}

module.exports = {
    pk_handle,
    st_handle
}