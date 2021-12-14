const zstd = require("zstd-codec").ZstdCodec;

function compress(data) {
    return new Promise((resolve) => {
        zstd.run(z => {
            const simple = new z.Simple();
            resolve(simple.compress(data));
        });
    });
}

function uncompress(data) {
    return new Promise((resolve) => {
        zstd.run(z => {
            const simple = new z.Simple();
            resolve(simple.decompress(data));
        });
    });
}

module.exports = {
    uncompress,
    compress
};