'use strict';
var request = require('request');

var pathVarsRe = /\${([^\}]+)}/g;

function getPathVars(path) {
    var pathVars = [];
    var match;

    while ((match = pathVarsRe.exec(path)) !== null) {
        pathVars.push(match[1]);
    }

    return pathVars;
}

function parse(pathPattern) {
    var splitByQuestionMark = pathPattern.split('?');

    return {
        withoutParams: splitByQuestionMark[0],
        params: splitByQuestionMark.length > 1 ? splitByQuestionMark[1].split('|') : [],
        pathVars: getPathVars(pathPattern),
    };
}

function uriJoin(a, b) {
    if (!a.endsWith('/')) {
        a = a + '/';
    }

    if (b.startsWith('/')) {
        b = b.substr(1);
    }

    return a + b;
}

function buildUri(root, args, parseResult) {
    var uri = uriJoin(root, parseResult.withoutParams);
    var params = [];

    Object.keys(args).forEach(function (key) {
        var value = args[key];
        var pathVarIndex = parseResult.pathVars.indexOf(key);
        var paramsIndex;

        if (pathVarIndex !== -1) {
            uri = uri.replace('${' + key + '}', value);
        } else if ((paramsIndex = parseResult.params.indexOf(key)) !== -1) {
            params.push(key + '=' + value);
        }
    });

    if (params.length) {
        uri = uri + '?' + params.join('&');
    }

    return uri;
}

function buildWrapperFn(root, parseResult, method, requestModule, requestOptions) {
    requestOptions = requestOptions || {};

    if ([ 'patch', 'post', 'put' ].indexOf(method) !== -1) {
        return function (args, body, cb) {
            var uri = buildUri(root, args, parseResult);

            requestOptions.uri = uri;
            requestOptions.method = method.toUpperCase();
            requestOptions.body = body;

            return requestModule(requestOptions, cb);
        }
    } else {
        return function (args, cb) {
            var uri = buildUri(root, args, parseResult);

            requestOptions.uri = uri;
            requestOptions.method = method.toUpperCase();

            return requestModule(requestOptions, cb);
        }
    }
}

function getMethodIterator(config, cb) {
    var httpMethods = [ 'delete', 'get', 'head', 'patch', 'post', 'put' ];

    httpMethods.forEach(function (method) {
        var methodMap = config[method];

        if (methodMap) {
            Object.keys(methodMap).forEach(function (key) {
                var value = methodMap[key];

                cb(method, key, value);
            });
        }
    });
}

module.exports.create = function (config) {
    var root = config.root;
    var requestDefaults = config.requestDefaults;
    var requestModule = requestDefaults ? request.defaults(requestDefaults) : request;
    var wrapper = {};

    getMethodIterator(config, function (method, key, value) {
        var pathPattern;
        var requestOptions;
        var parseResult;

        if (typeof value === 'string') {
            pathPattern = value;
            requestOptions = null;
        } else {
            pathPattern = value.pathPattern;
            requestOptions = value.requestOptions;
        }

        parseResult = parse(pathPattern);
        wrapper[key] = buildWrapperFn(root, parseResult, method, requestModule, requestOptions);
    });

    return wrapper;
}