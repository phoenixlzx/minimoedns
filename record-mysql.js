var config = require('./config.js'),
    mysql = require('mysql');
var pool  = mysql.createPool({
    host     : config.mysqlhost,
    database : config.mysqldb,
    user     : config.mysqluser,
    password : config.mysqlpass
});

pool.getConnection(function(err, connection) {
    if (err) {
        console.log(err);
    }

    exports.queryRecord = function(name, type, callback) {
        connection.query('SELECT * from `records` WHERE `name` = ? AND `type` = ?',
            [name, type],
            function(err, result) {
                if (err) {
                    connection.release();
                    return callback(err, null);
                }
                // console.log(result);
                connection.release();
                callback(null, result);
        });
    }

    exports.queryGeo = function(name, type, dest, callback) {
        if (dest === null) {
            return callback(null, null);
        }
        connection.query('SELECT * FROM `records` WHERE `name` = ? AND `type` = ? AND (`geo` = ? OR `geo` = ? OR `geo` = ? OR `geo` = ?)',
            [name, type, dest.country_code, dest.country_code3, dest.country_name, dest.continent_code],
            function(err, result) {
                if (err) {
                    connection.release();
                    return callback(err, null);
                }
                connection.release();
                callback(null, result);
        });
    }

});