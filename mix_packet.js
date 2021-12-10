function mix(data, current_packet_num, referPort) {
    let num_buffer = Buffer.allocUnsafe(8);
    num_buffer.writeUInt32LE(data.length + 4, 0);
    num_buffer.writeInt16LE(current_packet_num, 4);
    num_buffer.writeUInt16LE(referPort, 6);
    return Buffer.concat([num_buffer, data]);
}

module.exports = mix;