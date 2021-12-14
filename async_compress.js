const zstd = require("zstd-codec").ZstdCodec;

async function compress(data) {
    return new Promise((resolve) => {
        zstd.run(z => {
            const simple = new z.Simple();
            resolve(simple.compress(data));
        });
    });
}

async function uncompress(data) {
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