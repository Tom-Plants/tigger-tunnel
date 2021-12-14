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
    simple.compress(data, 5);
}

function uncompress(data) {
    simple.decompress(data);
}

module.exports = {
    init_compress,
    uncompress,
    compress
};