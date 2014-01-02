// Configuration
var config = require('./config.js');

// DNS Server settings.
var dns = require('native-dns'),
    consts = require('native-dns-packet').consts,
    tld = require('tldjs'),
    async = require('async'),
    geoip = require('geoip');

var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

var Record = '';

// GeoIP setup
var country = new geoip.Country(config.GeoDB),
    country_v6 = new geoip.Country6(config.GeoDB6),
    isp = new geoip.Org(config.GeoISP);
/*
setInterval(function() {
    country.update(config.GeoDB);
    country_v6.update(config.GeoDB6);
    isp.update(config.GeoISP);
    // console.log('GeoIP Data updated.');
}, 86400000);
*/

if (config.db === 'mongodb') {
    Record = require('./record-mongodb.js');
} else if (config.db === 'mysql') {
    Record = require('./record-mysql.js');
} else {
    return console.log('Incorrect database selection.');
}

if (cluster.isMaster) {
    console.log("Starting master process...");

    // Fork workers.
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
/*
    cluster.on('listening', function(worker, address){
        console.log('listening: worker ' + worker.process.pid + ', Address: ' + address.address + ":" + address.port);
    });

    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' exited.');
    });*/
} else {

// Start servers
    var UDPserver = dns.createServer({ dgram_type: 'udp4' });
    UDPserver.serve(config.port);

// TCP server
    if (config.enableTCP) {
        var TCPserver = dns.createTCPServer();
        if (config.enableV6) {
            TCPserver.serve(config.port, '::');
        } else {
            TCPserver.serve(config.port);
        }
    }

// IPv6
    if (config.enableV6) {
        var UDPserver6 = dns.createUDPServer({ dgram_type: 'udp6' });
        UDPserver6.serve(config.port);
    }

    console.log('DNS Server started at port ' + config.port + '.');

// Query events...
    UDPserver.on('request', minimoedns);
    UDPserver6.on('request', minimoedns);
    TCPserver.on('request', minimoedns);

    UDPserver.on('error', function (err, buff, req, res) {
        console.log('UDP Server ERR:\n');
        console.log(err);
    });
    UDPserver6.on('error', function(err, buff, req, res) {
        console.log('UDP6 Server ERR:\n');
        console.log(err);
    });
    TCPserver.on('error', function (err, buff, req, res) {
        console.log('TCP Server ERR:\n');
        console.log(err);
    });

}

// Functions
function randomOrder() {
    return (Math.round(Math.random()) - 0.5);
}

function authorityNS(res, queryName, callback) {
    // Send authority NS records.
    config.nameservers.forEach(function(ns) {
        res.authority.push(dns.NS({
            name: queryName,
            data: ns,
            ttl: config.defaultTTL
        }));
    });
    callback();
}

function minimoedns(request, response) {
    // console.log(request);
    // console.log(JSON.stringify(request.edns_options[0].data));
    // console.log(request.edns_options[0].data);

    var name = request.question[0].name,
        type = consts.qtypeToName(request.question[0].type),
        sourceIP = request.address.address;
    var tldname = tld.getDomain(name);

    // EDNS options
    // TODO IPv6 support.
    if (request.edns_options[0]) {
        var tempip = request.edns_options[0].data.slice(4);
        // console.log(JSON.stringify(tempip))
        if (request.edns_options[0].data.toJSON()[2] <= 32) {
            // client is IPv4
            tempip = tempip.toJSON().join('.');
            if (request.edns_options[0].data.toJSON()[2] < 24) {
                for (var i = request.edns_options[0].data.toJSON()[2]; i < 24; i += 8) {
                    tempip += '.0';
                }
            }
            sourceIP = tempip;
            console.log(sourceIP);
            response.edns_options.push(request.edns_options[0]);
            response.additional.push({
                name: '',
                type: 41,
                rdlength: 8
            });
        } else if (request.edns_options[0].data.toJSON()[2] === 128) {
            // client is IPv6
            // TODO implement IPv6 edns_options
        }

    }

    // Get source IP
    // console.log(sourceIP);
    var sourceDest = country.lookupSync(sourceIP),
        sourceISP = isp.lookupSync(sourceIP);
    if (!sourceDest) {
        sourceDest = country_v6.lookupSync(sourceIP)
    }
    // console.log(sourceDest);
    // console.log(sourceISP);
    console.log(sourceIP + ' requested ' + name);
    if (!tld.isValid(name)) {
        response.header.rcode = consts.NAME_TO_RCODE.NOTFOUND;
        return response.send();
    }
    // return version if quested version.bind
    if (name === 'version.bind' && type === 'TXT') {
        response.answer.push(dns.TXT({
            name: 'version.bind',
            data: config.version || 'MiniMoeDNS',
            ttl: 5
        }));
        response.answer[0].class = 3;
        // console.log(response);
        return response.send();
    }

    Record.queryRecord(tldname, 'SOA', function(err, SOAresult) {
        if (err) {
            console.log(err);
        } else if (!SOAresult[0]) {
            response.header.rcode = consts.NAME_TO_RCODE.NOTFOUND;
            response.send();
        } else {
            response.header.aa = 1;

            Record.queryGeo(name, type, sourceDest, sourceISP, function(err, georecords) {
                // console.log(georecords);
                if (err) {
                    console.log(err);
                }
                if (georecords[0]) {
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
                                response.answer.push(dns.CNAME({
                                    name: record.name,
                                    data: record.content,
                                    ttl: record.ttl||config.defaultTTL
                                }));
                            });
                            break;
                    }
                    // Send authority NS records.
                    config.nameservers.forEach(function(ns) {
                        response.authority.push(dns.NS({
                            name: tldname,
                            data: ns,
                            ttl: config.defaultTTL
                        }));
                        /* 
                        response.additional.push(dns.A({
                            name: ns,
                            address: config.nameserversIP[config.nameservers.indexOf(ns)],
                            ttl: config.defaultTTL
                        }));
                        */
                    });
                    return response.send();
                } else {
                    Record.queryRecord(name, type, function(err, records) {
                        // console.log('exec1');
                        // console.log(records);
                        if (err) {
                            console.log(err);
                        } else if (!records[0]) {
                            // Query if wildcard exists.
                            var sub = tld.getSubdomain(name),
                                pattern = new RegExp(/\./);
                            // console.log(sub);
                            if (sub == '') {
                                // directly send SOA as we queried before.
                                // push SOA to authority section
                                var content = SOAresult[0].content.split(" ");
                                response.authority.push(dns.SOA({
                                    name: SOAresult[0].name,
                                    primary: content[0],
                                    admin: content[1].replace("@", "."),
                                    serial: content[2],
                                    refresh: content[3],
                                    retry: content[4],
                                    expiration: content[5],
                                    minimum: content[6],
                                    ttl: SOAresult[0].ttl||config.defaultTTL
                                }));
                                response.header.rcode = consts.NAME_TO_RCODE.NOTFOUND;
                                response.send();
                                /*
                                Record.queryRecord(name, 'SOA', function(err, doc) {
                                    // console.log('exec2');
                                    // console.log(doc);
                                    if (err) {
                                        console.log(err);
                                    }
                                    if (doc[0]) {
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
                                        response.header.rcode = consts.NAME_TO_RCODE.NOTFOUND;
                                        response.send();
                                    } else {
                                        // console.log('NXDOMAIN');
                                        response.header.rcode = consts.NAME_TO_RCODE.NOTFOUND;
                                        response.send();
                                    }
                                });
                                */
                            } else  {
                                var queryName = name;
                                async.until(function() {
                                    return !tld.getSubdomain(queryName);
                                }, function(callback) {
                                    queryName = queryName.substr(queryName.indexOf('.') + 1);
                                    // console.log(queryName);
                                    Record.queryRecord('*.' + queryName, type, function(err, doc) {
                                        // console.log(doc)
                                        if (err) {
                                            console.log(err);
                                        }
                                        if (doc[0]) {
                                            // console.log(doc[0].type);
                                            switch (doc[0].type) {
                                                case 'A':
                                                    response.answer.push(dns.A({
                                                        name: name,
                                                        address: doc[0].content,
                                                        ttl: doc[0].ttl||config.defaultTTL
                                                    }));
                                                    break;
                                                case 'AAAA':
                                                    response.answer.push(dns.AAAA({
                                                        name: name,
                                                        address: doc[0].content,
                                                        ttl: doc[0].ttl||config.defaultTTL
                                                    }));
                                                    break;
                                                case 'CNAME':
                                                    response.answer.push(dns.CNAME({
                                                        name: name,
                                                        data: doc[0].content,
                                                        ttl: doc[0].ttl||config.defaultTTL
                                                    }));
                                                    break;
                                            }
                                            // Send authority NS records.
                                            config.nameservers.forEach(function(ns) {
                                                response.authority.push(dns.NS({
                                                    name: tldname,
                                                    data: ns,
                                                    ttl: config.defaultTTL
                                                }));
                                            });
                                            return response.send();
                                        }
                                        callback();
                                    });
                                }, function() {
                                    /*
                                    Record.queryRecord(tld.getDomain(name), 'SOA', function(err, doc) {
                                        if (err) {
                                            console.log(err);
                                        }
                                        if (doc[0]) {
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
                                        }
                                        response.header.rcode = consts.NAME_TO_RCODE.NOTFOUND;
                                        response.send();
                                    });
                                    */
                                    // push SOA to authority section
                                    var content = SOAresult[0].content.split(" ");
                                    response.authority.push(dns.SOA({
                                        name: SOAresult[0].name,
                                        primary: content[0],
                                        admin: content[1].replace("@", "."),
                                        serial: content[2],
                                        refresh: content[3],
                                        retry: content[4],
                                        expiration: content[5],
                                        minimum: content[6],
                                        ttl: SOAresult[0].ttl||config.defaultTTL
                                    }));
                                    response.header.rcode = consts.NAME_TO_RCODE.NOTFOUND;
                                    response.send();
                                });
                            }

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
                                    /*
                                     async.eachSeries(records, function(record, callback) {
                                     records.forEach(function(record) {
                                     var ns = config.nameservers.indexOf(record.content);
                                     if (ns > -1) {
                                     // we are authoerity server, sending additional information...
                                     response.additional.push(dns.A({
                                     name: record.content,
                                     address: config.nameserversIP[ns],
                                     ttl: config.defaultTTL
                                     }));
                                     }
                                     response.answer.push(dns.NS({
                                     name: record.name,
                                     data: record.content,
                                     ttl: record.ttl||config.defaultTTL
                                     }));
                                     });

                                     Record.queryRecord(record.content, 'A', function(err, docs) {
                                     // console.log(record.content);
                                     // console.log(docs);
                                     if (err) {
                                     console.log(err);
                                     }

                                     if (docs) {
                                     docs.forEach(function(doc) {
                                     console.log(doc);
                                     response.additional.push(dns.A({
                                     name: doc.name,
                                     address: doc.content,
                                     ttl: doc.ttl||config.defaultTTL
                                     }));
                                     });
                                     }

                                     callback();
                                     });
                                     }, function() {
                                     records.forEach(function(record) {
                                     response.answer.push(dns.NS({
                                     name: record.name,
                                     data: record.content,
                                     ttl: record.ttl||config.defaultTTL
                                     }));
                                     });
                                     });
                                     */
                                    records = records.sort(randomOrder);
                                    records.forEach(function(record) {
                                        /* 
                                        var ns = config.nameservers.indexOf(record.content);
                                        if (ns > -1) {
                                            // we are authoerity server, sending additional information...
                                            response.additional.push(dns.A({
                                                name: record.content,
                                                address: config.nameserversIP[ns],
                                                ttl: config.defaultTTL
                                            }));
                                        } 
                                        */
                                        response.answer.push(dns.NS({
                                            name: record.name,
                                            data: record.content,
                                            ttl: record.ttl||config.defaultTTL
                                        }));
                                    });

                                    return response.send();
                                case 'CNAME':
                                    records = records.sort(randomOrder);
                                    records.forEach(function(record) {
                                        response.answer.push(dns.CNAME({
                                            name: record.name,
                                            data: record.content,
                                            ttl: record.ttl||config.defaultTTL
                                        }));

                                    });
                                    break;
                            }

                            // Send authority NS records.
                            config.nameservers.forEach(function(ns) {
                                response.authority.push(dns.NS({
                                    name: tldname,
                                    data: ns,
                                    ttl: config.defaultTTL
                                }));
                                /*
                                response.additional.push(dns.A({
                                    name: ns,
                                    address: config.nameserversIP[config.nameservers.indexOf(ns)],
                                    ttl: config.defaultTTL
                                }));
                                */
                            });
                            response.send();
                            // console.log(response);
                        }
                    });
                }
            });
        }
    });
}
