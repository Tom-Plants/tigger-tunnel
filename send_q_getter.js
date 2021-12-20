const exec = require('child_process').exec;
let config = require("./config");

function execute(command, callback){
    exec(command, function(error, stdout, stderr){ callback(stdout); });
};

function get_port_send_Q(port, callback)  {
    let cmd = `netstat -tunp | grep ESTABLISHED | grep node | grep ${config.s_local_port} | grep ${port}`;
    execute(cmd, (std) => {
        let j = 0;
        let _t = false;
        for(let i = 0; i < std.length; i++) {
            if(std[i] != " " && _t == false) {
                _t = true;
                j++;
                if(j == 3) {
                    callback(std[i]);
                }
            }
            if(std[i] == " " && _t == true) {
                _t = false;
            }
        }
    });
}

module.exports = {
    get_port_send_Q
}