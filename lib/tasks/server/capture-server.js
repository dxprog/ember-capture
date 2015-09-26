/* jshint node: true */
'use strict';

var fs           = require('fs');
var http         = require('http');
var path         = require('path');
var stream       = require('stream');
var querystring  = require('querystring');
var Promise      = require('ember-cli/lib/ext/promise');
var Task         = require('ember-cli/lib/models/task');
var express      = require('express');
var bodyParser   = require('body-parser');
var SilentError  = require('silent-error');
var webdriver    = require('selenium-webdriver');
var mkdirp       = require('mkdirp');
var cleanBaseURL = require('clean-base-url');
var execFile     = require('child_process').execFile;
var optipng      = require('optipng-bin');

function o_keys(dict) {
  return Object.keys.call(Object, dict);
}

function getDrivers(options) {
  // Set up the drivers dictionary.
  var drivers = Object.create(null);
  drivers.firefox = undefined;
  // drivers.safari = undefined;
  // drivers.chrome = undefined;
  // drivers.opera = undefined;

  // Set up all of the drivers.
  o_keys(drivers).forEach(function(browser) {
    var driver = new webdriver.Builder().forBrowser(browser);

    // Fix up Chrome's arguments.
    if (browser === 'chrome') {
      driver.withCapabilities({ browserName: 'chrome', 'chromeOptions': { args: ['test-type', 'start-maximized'] } });
    }

    drivers[browser] = driver.build();
    drivers[browser].manage().window().setPosition(0, 0)
    drivers[browser].manage().window().maximize();
  });

  return drivers;
}

function createServer(drivers, options) {
  var app = express();

  // Enable CORS.
  app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  });

  // For parsing application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({ extended: true }));

  // Information about the capture server.
  app.get('/', function(req, res) {
    res.send('Capture server ready. Drivers prepared: ' + o_keys(drivers).join(', ') + '.');
  });

  app.post('/screenshot', function(req, res) {
    var browser = req.body.captureClientID;
    var driver = drivers[browser];

    // TODO: Force full-height screenshots outside of Firefox.
    // TODO: take screenshots at multiple sizes.
    // TODO: Enable size configuration: driver.manage().window().setSize(1280, , 10));
    // TODO: Store metadata.
    // TODO: Prevent blank screenshots.
    // TODO: Prevent duplicate screenshots.
    // TODO: Prevent possible file name duplication.

    driver
      .takeScreenshot()
      .then(function(base64) {
        var filepath = path.join('.', options.captureOutputPath, browser);
        var filename = (+new Date()) + '.png';
        var fullpath = path.join(filepath, filename);
        mkdirp.sync(filepath);

        return new Promise(function(resolve, reject) {
          fs.writeFile(fullpath, base64, {encoding: 'base64'}, function(error) {
            error ? reject(error) : resolve(fullpath);
          });
        });
      })
      .then(function(fullpath) {
        return true;

        // FIXME: Too slow to use.
        // Optimize the PNG.
        return new Promise(function(resolve, reject) {
          execFile(optipng, [fullpath], function(error) {
            error ? reject(error) : resolve(fullpath);
          });
        });
      })
      .then(function() {
        return res.sendStatus(204);
      });
  });

  return app;
}

module.exports = Task.extend({
  captureServer: function(options) {
    if (this._captureServer) {
      return this._captureServer;
    }

    this._drivers = getDrivers(options);
    this._captureServer = createServer(this._drivers, options);

    var captureServerURL = 'http://' + this.displayHost(options.captureHost) + ':' + options.capturePort + '/';
    var serverURL = 'http' + (options.ssl ? 's' : '') + '://' + this.displayHost(options.host) + ':' + options.port + cleanBaseURL(options.baseURL) + options.testPage;

    // FIXME: Make this a real event.
    // this.expressServer.on('ready', function() {
      o_keys(this._drivers).forEach(function(browser) {
        var driver = this._drivers[browser];

        driver.get(serverURL + '?' + querystring.stringify({
          nojshint: true,
          filter: options.filter,
          captureServerURL: captureServerURL,
          captureClientID: browser
        }));
      }.bind(this));
    // });

    return this._captureServer;
  },

  listen: function(options) {
    var server = this.captureServer(options);

    return new Promise(function(resolve, reject) {
      server.listen(options.capturePort, resolve);
      server.on('error', reject);
    });
  },

  start: function(options) {
    var url = 'http://' + this.displayHost(options.captureHost) + ':' + options.capturePort + '/';

    return this.listen(options)
      .then(this.writeBanner.bind(this, url))
      .catch(this.writeErrorBanner.bind(this, url));
  },

  displayHost: function(specifiedHost) {
    return specifiedHost || 'localhost';
  },

  writeBanner: function(url) {
    this.ui.writeLine('Capture server on ' + url);
  },

  writeErrorBanner: function(url) {
    throw new SilentError('Capture server failed on ' + url + '.  It is either in use or you do not have permission.');
  }
});