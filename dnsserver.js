// Configuration
var config = require('./config.js');

// DNS Server settings.
var dns = require('native-dns'),
    consts = require('native-dns-packet').consts,
    tld = require('tldjs'),
    geoip = require('geoip');

var Record = '';

if (config.db === 'mongodb') {
    Record = require('./record-mysql.js');
} else if (config.db === 'mysql') {
    Record = require('./record-mysql.js');
} else {
    return console.log('Incorrect database selection.');
}

var server = dns.createServer();

// Live status listener
if (config.statusReport) {
    var net = require('net');
    var statusServer = net.createServer(function() { //'connection' listener
        console.log('Status server connected');
    });
    statusServer.listen(5353, function() { //'listening' listener
        console.log('Status server started at port 5353.');
    });
}

server.on('request', function (request, response) {
    // console.log(request);

    var name = request.question[0].name,
        type = consts.qtypeToName(request.question[0].type),
        sourceIP = request.address.address;

    // Get source IP
    // Open the country data file
    var Country = geoip.Country;
    var country = new Country(config.GeoDB);
    var sourceDest = country.lookupSync(sourceIP);
    // console.log(sourceDest);

    Record.queryGeo(name, type, sourceDest, function(err, georecords) {
        if (err) {
            console.log(err);
        }
        if (georecords) {
            // console.log(georecords);
            // console.log('GeoDNS Record(s) found, sending optimized records...');
            switch (georecords[0].type) {
                case 'A':
                    georecords = georecords.sort(randomOrder);
                    georecords.forEach(function(record) {
                        response.answer.push(dns.A({
                            name: record.name,
                            address: record.content,
                            ttl: record.ttl||config.defaultTTL
                        }));
                    });
                    break;
                case 'AAAA':
                    georecords = georecords.sort(randomOrder);
                    georecords.forEach(function(record) {
                        response.answer.push(dns.AAAA({
                            name: record.name,
                            address: record.content,
                            ttl: record.ttl||config.defaultTTL
                        }));
                    });
                    break;
                case 'CNAME':
                    georecords.forEach(function(record) {
                        response.answer.push(dns.SRV({
                            name: record.name,
                            data: record.content,
                            ttl: record.ttl||config.defaultTTL
                        }));
                    });
                    break;
            }
            response.send();
        } else {
            Record.queryRecord(name, type, function(err, records) {
                // console.log(records);
                if (err) {
                    console.log(err);
                } else if (!records[0]) {
                    // Try query for SOA, if failed then send NXDOMAIN.
                    Record.queryRecord(tld.getDomain(name), 'SOA', function(err, doc) {
                        // console.log(doc);
                        if (err) {
                            console.log(err);
                        }
                        if (doc) {
                            var content = doc[0].content.split(" ");
                            response.authority.push(dns.SOA({
                                name: doc[0].name,
                                primary: content[0],
                                admin: content[1].replace("@", "."),
                                serial: content[2],
                                refresh: content[3],
                                retry: content[4],
                                expiration: content[5],
                                minimum: content[6],
                                ttl: doc[0].ttl||config.defaultTTL
                            }));
                            response.send();
                        } else {
                            console.log('NXDOMAIN');
                        }
                    });
                } else {
                    switch (records[0].type) {
                        case 'SOA':
                            var content = records[0].content.split(" ");
                            response.answer.push(dns.SOA({
                                name: records[0].name,
                                primary: content[0],
                                admin: content[1].replace("@", "."),
                                serial: content[2],
                                refresh: content[3],
                                retry: content[4],
                                expiration: content[5],
                                minimum: content[6],
                                ttl: records[0].ttl||config.defaultTTL
                            }));
                            break;
                        case 'A':
                            records = records.sort(randomOrder);
                            records.forEach(function(record) {
                                response.answer.push(dns.A({
                                    name: record.name,
                                    address: record.content,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'AAAA':
                            records = records.sort(randomOrder);
                            records.forEach(function(record) {
                                response.answer.push(dns.AAAA({
                                    name: record.name,
                                    address: record.content,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'MX':
                            records = records.sort(randomOrder);
                            records.forEach(function(record) {
                                response.answer.push(dns.MX({
                                    name: record.name,
                                    priority: record.prio,
                                    exchange: record.content,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'TXT':
                            records.forEach(function(record) {
                                response.answer.push(dns.TXT({
                                    name: record.name,
                                    data: record.content,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'SRV':
                            records.forEach(function(record) {
                                var content = record.content.split(" ");
                                response.answer.push(dns.SRV({
                                    name: record.name,
                                    priority: record.prio,
                                    weight: content[0],
                                    port: content[1],
                                    target: content[2],
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'NS':
                            records.forEach(function(record) {
                                response.answer.push(dns.NS({
                                    name: record.name,
                                    data: record.content,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                                // fixme: Additional section not working.
                                Record.queryRecord(record.data, 'A', function(err, docs) {
                                    // console.log(record.data);
                                    // console.log(docs);
                                    if (err) {
                                        console.log(err);
                                    }
                                    if (docs) {
                                        docs.forEach(function(doc) {
                                            response.additional.push(dns.A({
                                                name: doc.name,
                                                address: doc.content,
                                                ttl: doc.ttl||config.defaultTTL
                                            }));
                                        });
                                    }
                                });
                            });

                            break;
                        case 'CNAME':
                            records.forEach(function(record) {
                                response.answer.push(dns.SRV({
                                    name: record.name,
                                    data: record.content,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                    }
                    response.send();
                    // console.log(response);
                }
            });
        }
    });

});

server.on('error', function (err, buff, req, res) {
    console.log(err.stack);
});

// Functions
function randomOrder(){
    return (Math.round(Math.random()) - 0.55);
}


server.serve(15353);
console.log('DNS Server started at port 53.');