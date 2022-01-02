module.exports = {
    tunnel_num: 3,
    targets: [
        {host: "t1.0x7c00.site", port: 8080},
        {host: "t2.0x7c00.site", port: 8080}
    ],               //服务器地址
    local_port: 10011,
    local_host: "0.0.0.0",
    s_target_port: 444,
    s_target_host: "localhost",
    s_local_port: 8080,
    s_local_host: "0.0.0.0",
    min_tunnel_timeout: 8,
    max_tunnel_timeout: 10
}
