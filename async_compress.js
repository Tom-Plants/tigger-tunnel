const zstd = require("zstd-codec").ZstdCodec;
const fs = require("fs");
const lzw = require("./lzw3.node");

let simple;

let k = {m: 0, s: 0};

function init_compress() {
    //return new Promise((resolve) => {
        //zstd.run(z => {
            //simple = new z.Simple();
            //resolve();
        //});
    //});
}

function compress(data) {
    let _data = lzw.compress(data);

    k.m += _data.length;
    k.s += data.length;

    return data;
}

function uncompress(data) {
    let _data = Buffer.from(simple.decompress(data));

    k.m += data.length;
    k.s += _data.length;

    return data;
}

module.exports = {
    init_compress,
    uncompress,
    compress,
    k
};