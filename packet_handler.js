const zlib = require("zlib");
function pk_handle(callback, referPort) {
    let cb = callback;
    let recv_count = 0;
    let buffer = {};
    let rp = referPort;
    return (pkt_num, data) => {
        let ung_data = zlib.gunzipSync(data);
        if(pkt_num == recv_count) {
            cb(ung_data, rp, recv_count);
            while(true) {
                recv_count ++;
                if(recv_count == 32767) {
                    recv_count = 0
                }
                if(buffer[recv_count] != undefined) {
                    cb(buffer[recv_count], rp, recv_count);
                    buffer[recv_count] = undefined;
                }else break;
            }
        }else {
            buffer[pkt_num] = ung_data;
        }

    }
}

function st_handle() {
    let send_count = 0;
    return () => {
        if(send_count == 32767) {
            send_count = 0;
        }
        return send_count++;
    }
}

module.exports = {
    pk_handle,
    st_handle
}