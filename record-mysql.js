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
        connection.query('SELECT * from `records` where `name` = ? AND `type` = ?',
            [name, type],
            function(err, result) {
                if (err) {
                    connection.release();
                    return callback(err, null);
                }
                console.log(result);
                connection.release();
                callback(null, result);
        });
    }

    exports.queryGeo = function(name, type, dest, callback) {
        return callback(null, null);
    }

    /*
    exports.queryRecord = function(name, type, callback) {
        var collection = db
            .collection('records')
            .find({
                name: name,
                type: type
            })
            .toArray(function(err, docs) {
                if (err) {
                    return callback(err, null);
                }
                callback(null, docs);
            });
    }

    exports.queryGeo = function(name, type, dest, callback) {
        if (dest === null) {
            return callback(null);
        }
        var collection = db
            .collection('records')
            .find({
                name: name,
                type: type,
                geo: {$in: [
                    dest.country_code,
                    dest.country_code3,
                    dest.country_name,
                    dest.continent_code
                ]}
            })
            .toArray(function(err, docs) {
                if (err) {
                    return callback(err, null);
                }
                callback(null, docs);
            });
    }
    */

});