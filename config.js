module.exports = {
    tunnel_num: 3,

    //客户端配置
    targets: [
        {host: "t1.0x7c00.site", port: 8080},
        {host: "t2.0x7c00.site", port: 8080}
    ],
    connect_interval: 2,
    
    //客户端 && redirector配置
    local_port: 10011,
    local_host: "0.0.0.0",

    //redirector 目标
    target_host: "",
    target_port: 0,

    //服务器配置
    s_target_port: 444,
    s_target_host: "localhost",

    //服务器 && redirector 配置
    s_local_port: 8080,
    s_local_host: "0.0.0.0",

    //客户端 && 服务器 && redirector 配置
    min_tunnel_timeout: 8,
    max_tunnel_timeout: 10,

    //客户端 && 服务器 重传配置
    sync_timeout: 1
}
