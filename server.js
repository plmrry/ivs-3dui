var express = require('express');
var path = require('path');
var babelify = require('express-babelify-middleware');
var serveIndex = require('serve-index');

var app = module.exports = express();
app.set('port', 9877);

//
// Application
//

var appPath = path.resolve(__dirname, 'app', 'index.js');

app.use('/app.js', babelify(appPath));

app.use(express.static(appPath));

//
// Development
//

var devPath = path.resolve(__dirname, 'development');

app.use('/development', serveIndex(devPath));
app.use('/development', express.static(devPath));

//
// Static Files
//

var staticPath = path.resolve(__dirname, 'static');

app.use('/', express.static(staticPath));
