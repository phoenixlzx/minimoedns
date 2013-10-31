// Configuration
var config = require('./config.js');

// DNS Server settings.
var dns = require('native-dns'),
    consts = require('native-dns-packet').consts,
    geoip = require('geoip'),
    tld = require('tldjs'),
    record = require('./record.js');

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
    // console.log(request);

    var name = request.question[0].name,
        type = consts.qtypeToName(request.question[0].type);

    record.queryRecord(name, type, function(err, records) {
        // console.log(records);
        if (err) {
            console.log(err);
        } else if (!records[0]) {
            // Try query for SOA, if failed then send NXDOMAIN.
            record.queryRecord(tld.getDomain(name), 'SOA', function(err, doc) {
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
            }
            response.send();
        }
    });
/*
    response.answer.push(dns.A({
        name: request.question[0].name,
        address: '127.0.0.1',
        ttl: 600
    }));
    response.answer.push(dns.A({
        name: request.question[0].name,
        address: '127.0.0.2',
        ttl: 600
    }));
    response.additional.push(dns.A({
        name: 'hostA.example.org',
        address: '127.0.0.3',
        ttl: 600
    }));
    response.send();
    */
    console.log(response);
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