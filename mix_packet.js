const {compress} = require("./async_compress");
function mix(data, current_packet_num, referPort) {
    let num_buffer = Buffer.allocUnsafe(10);
    num_buffer.writeBigInt64LE(BigInt(current_packet_num), 0);
    num_buffer.writeUInt16LE(referPort, 8);

    let length_buffer = Buffer.allocUnsafe(4);

    let g_data = compress(Buffer.concat([num_buffer, data]));

    length_buffer.writeUInt32LE(g_data.length, 0);

    return Buffer.concat([length_buffer, g_data]);
}

module.exports = mix;