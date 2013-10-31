var config = require('./config.js'),
    MongoClient = require('mongodb').MongoClient,
    format = require('util').format;

MongoClient.connect(config.mongodb, {db: {native_parser: true, w : 1}}, function(err, db) {
    if(err) {
        return err;
    }

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
});

