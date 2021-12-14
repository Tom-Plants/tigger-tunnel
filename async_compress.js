const zstd = require("zstd-codec").ZstdCodec;

let simple;
function init_compress() {
    return new Promise((resolve) => {
        zstd.run(z => {
            simple = new z.Simple();
            resolve();
        });
    });
}

function compress(data) {
    return Buffer.from(simple.compress(data, 5));
}

function uncompress(data) {
    return Buffer.from(simple.decompress(data));
}

module.exports = {
    init_compress,
    uncompress,
    compress
};