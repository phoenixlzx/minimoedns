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
                type: type
            },  { $or: [
                    {geo: dest.country_code},
                    {geo: dest.country_code3},
                    {geo: dest.continent_code}
                ]})
            .toArray(function(err, docs) {
                if (err) {
                    return callback(err, null);
                }
                callback(null, docs);
            });
    }
});

