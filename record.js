var config = require('./config.js'),
    MongoClient = require('mongodb').MongoClient,
    format = require('util').format;

MongoClient.connect(config.mongodb, {w : 1}, function(err, db) {
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
});

