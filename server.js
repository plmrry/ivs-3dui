var express = require('express');
var path = require('path');
// var browserify = require('browserify');
var babelify = require('express-babelify-middleware');

var app = module.exports = express();

var appPath = path.resolve(__dirname, 'app', 'index.js');
// app.use('/app.js', babelifyMiddleware(appPath));
app.use('/app.js', babelify(appPath));
// app.get('/app/bundle.js', babelify(['d3', 'rx', 'three']));
// app.use('/app.js', babelify('app/index.js', { external: ['d3', 'rx', 'three'] }));

var staticPath = path.resolve(__dirname, 'static');
app.use('/', express.static(staticPath));

app.use(express.static(appPath));

app.set('port', 9876);

// function babelifyMiddleware(path) {
//   return function(req, res, next) {
//     browserify({ debug: true })
//       .transform('babelify', { presets: ['es2015'] })
//       .require(path, { entry: true })
//       .bundle()
//       .on('error', function(err) { console.error('Error: ' + err.message); })
//       .on('end', function() {
//         next()
//       })
//       .pipe(res)
      
//   };
// }