var config = require('./config.js'),
    mysql = require('mysql');

var pool  = '';

if (!config.mysqlsocket) {
    pool  = mysql.createPool({
        host     : config.mysqlhost,
        database : config.mysqldb,
        user     : config.mysqluser,
        password : config.mysqlpass,
        connectionLimit: 100
    });
} else {
    pool  = mysql.createPool({
        socketPath : config.mysqlsocket,
        database : config.mysqldb,
        user     : config.mysqluser,
        password : config.mysqlpass,
        connectionLimit: 100
    });
}

exports.queryRecord = function(name, type, callback) {
    pool.getConnection(function(err, connection) {
        if (err) {
            console.log(err.message);
        }
        connection.query('SELECT * from `records` WHERE `paused` IS NOT TRUE AND `name` = ? AND (`type` = ? OR `type` = "CNAME") AND `geo` IS NULL',
            [name, type],
            function(err, result) {
                if (err) {
                    connection.release();
                    return callback(err, null);
                }
                // console.log(result);
                if (result[0]) {
                    connection.release();
                    callback(null, result);
                } else {
                    connection.query('SELECT * from `records` WHERE `paused` IS NOT TRUE AND `name` = ? AND (`type` = ? OR `type` = "CNAME")',
                        [name, type],
                        function(err, result2) {
                            if (err) {
                                connection.release();
                                return callback(err, null);
                            }
                            connection.release();
                            callback(null, result2);
                        });
                }

            });
    });
}

exports.queryGeo = function(name, type, dest, isp, callback) {
    if (dest === null || isp === null) {
        return callback(null, []);
    }
    pool.getConnection(function(err, connection) {
        if (err) {
            console.log(err.message);
        }
        connection.query('SELECT * FROM `records` WHERE `name` = ? AND (`type` = ? OR `type` = "CNAME") AND (`geo` = ? OR `geo` = ? OR `geo` = ? OR `geo` = ?) AND (INSTR(?, `geoisp`))',
            [name, type, dest.country_code, dest.country_code3, dest.country_name, dest.continent_code, isp],
            function(err, result) {
                if (err) {
                    connection.release();
                    return callback(err, null);
                }
                if (result[0]) {
                    connection.release();
                    return callback(null, result);
                } else {
                    connection.query('SELECT * FROM `records` WHERE `name` = ? AND (`type` = ? OR `type` = "CNAME") AND (`geo` = ? OR `geo` = ? OR `geo` = ? OR `geo` = ?) AND `geoisp` IS NULL',
                        [name, type, dest.country_code, dest.country_code3, dest.country_name, dest.continent_code],
                        function(err, result2) {
                            if (err) {
                                connection.release();
                                return callback(err, null);
                            }
                            connection.release();
                            callback(null, result2);
                        });
                }
            });
    });

}