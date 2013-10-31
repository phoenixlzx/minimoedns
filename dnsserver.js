// Configuration
var config = require('./config.js');

// DNS Server settings.
var dns = require('native-dns'),
    consts = require('native-dns-packet').consts,
    tld = require('tldjs'),
    geoip = require('geoip'),
    Record = require('./record.js');

var server = dns.createServer();

// Live status listener
if (config.statusReport) {
    var net = require('net');
    var statusServer = net.createServer(function(c) { //'connection' listener
        console.log('server connected');
    });
    statusServer.listen(5353, function() { //'listening' listener
        console.log('Status server started at port 5353.');
    });
}

server.on('request', function (request, response) {
    console.log(request.address.address);

    var name = request.question[0].name,
        type = consts.qtypeToName(request.question[0].type),
        sourceIP = request.address.address;

    // Get source IP
    // Open the country data file
    var Country = geoip.Country;
    var country = new Country(config.GeoDB);
    var sourceDest = country.lookupSync('8.8.8.8');
    // console.log(sourceDest);

    Record.queryGeo(name, type, sourceDest, function(err, georecords) {
        if (err) {
            console.log(err);
        }
        if (georecords) {
            console.log(georecords);
            console.log('GeoDNS Record(s) found, sending optimized records...');
            switch (georecords[0].type) {
                case 'A':
                    georecords = georecords.sort(randomOrder);
                    georecords.forEach(function(record) {
                        response.answer.push(dns.A({
                            name: record.name,
                            address: record.address,
                            ttl: record.ttl||config.defaultTTL
                        }));
                    });
                    break;
                case 'AAAA':
                    georecords = georecords.sort(randomOrder);
                    georecords.forEach(function(record) {
                        response.answer.push(dns.AAAA({
                            name: record.name,
                            address: record.address,
                            ttl: record.ttl||config.defaultTTL
                        }));
                    });
                    break;
                case 'CNAME':
                    georecords.forEach(function(record) {
                        response.answer.push(dns.SRV({
                            name: record.name,
                            data: record.data,
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
                            response.authority.push(dns.SOA({
                                name: doc[0].name,
                                primary: doc[0].primary,
                                admin: doc[0].admin,
                                serial: doc[0].serial,
                                refresh: doc[0].refresh,
                                retry: doc[0].retry,
                                expiration: doc[0].expiration,
                                minimum: doc[0].minimum,
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
                            records.forEach(function(record) {
                                response.answer.push(dns.SOA({
                                    name: record.name,
                                    primary: record.primary,
                                    admin: record.admin,
                                    serial: record.serial,
                                    refresh: record.refresh,
                                    retry: record.retry,
                                    expiration: record.expiration,
                                    minimum: record.minimum,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'A':
                            records = records.sort(randomOrder);
                            records.forEach(function(record) {
                                response.answer.push(dns.A({
                                    name: record.name,
                                    address: record.address,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'AAAA':
                            records = records.sort(randomOrder);
                            records.forEach(function(record) {
                                response.answer.push(dns.AAAA({
                                    name: record.name,
                                    address: record.address,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'MX':
                            records = records.sort(randomOrder);
                            records.forEach(function(record) {
                                response.answer.push(dns.MX({
                                    name: record.name,
                                    priority: record.priority,
                                    exchange: record.exchange,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'TXT':
                            records.forEach(function(record) {
                                response.answer.push(dns.TXT({
                                    name: record.name,
                                    data: record.data,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'SRV':
                            records.forEach(function(record) {
                                response.answer.push(dns.SRV({
                                    name: record.name,
                                    priority: record.priority,
                                    weight: record.weight,
                                    port: record.port,
                                    target: record.target,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                        case 'NS':
                            records.forEach(function(record) {
                                response.answer.push(dns.NS({
                                    name: record.name,
                                    data: record.data,
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
                                                address: doc.address,
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
                                    data: record.data,
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
    return (Math.round(Math.random())-0.5);
}


server.serve(15353);
console.log('DNS Server started at port 53.');