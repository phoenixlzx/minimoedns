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

pool.getConnection(function(err, connection) {
    if (err) {
        console.log(err);
        pool.releaseConnection();
    }

    // Ping database for every 1 hour as it may close connection while idle.
    setInterval(keepAlive, 3600000);

    exports.queryRecord = function(name, type, callback) {
        connection.query('SELECT * from `records` WHERE `paused` IS FALSE AND `name` = ? AND (`type` = ? OR `type` = "CNAME") AND `geo` IS NULL',
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
                    connection.query('SELECT * from `records` WHERE `paused` IS FALSE AND `name` = ? AND (`type` = ? OR `type` = "CNAME")',
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
    }

    exports.queryGeo = function(name, type, dest, isp, callback) {
        if (dest === null || isp === null) {
            return callback(null, []);
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
    }

    function keepAlive() {
        connection.query('SELECT 1', [], function(err, result) {
            if(err) return console.log(err);
            connection.release();
            // console.log(result);

            setTimeout(function() {
                if (!result) {
                    console.log('ERR: Database connection seems lost...');
                    throw new Error('Database connection lost');
                }
            }, 100)
        });
    }
// WTF pooling never re-connect...
/*
    function handleError () {

        connection.query('SELECT 1', function (err) {
            if (err) {
                console.log('error when connecting to db:', err);
                setTimeout(handleError , 2000);
            }
        });

        connection.on('error', function (err) {
            console.log('db error', err);
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                handleError();
            } else {
                throw err;
            }
        });
    }
    handleError();
*/
});
