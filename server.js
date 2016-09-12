'use strict';

var express = require('express');
var path = require('path');
var babelify = require('express-babelify-middleware');
var serveIndex = require('serve-index');
var rollup = require('rollup-endpoint');

var app = express();

app.set('port', 9877);

//
// Application
//

const external = [
  'three/three.js',
  '@cycle/core',
  'rx',
  'd3',
  'debug',
  'underscore'
];
app.use('/bundle.js', babelify(external));

var appPath = path.resolve(__dirname, 'app', 'index.js');

app.use('/app.js', babelify(appPath, { external: external }));

app.use(express.static(appPath));

//
// Development
//

var devPath = path.resolve(__dirname, 'development');

app.use('/development', serveIndex(devPath));
app.use('/development', express.static(devPath));

const spawn = require('child_process').spawn;

const nodeResolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');

function glsl () {
	return {
		transform ( code, id ) {
			if ( !/\.glsl$/.test( id ) ) return;

			return 'export default ' + JSON.stringify(
				code
					.replace( /[ \t]*\/\/.*\n/g, '' )
					.replace( /[ \t]*\/\*[\s\S]*?\*\//g, '' )
					.replace( /\n{2,}/g, '\n' )
			) + ';';
		}
	};
}

app.use('/ivs2.js', rollup.serve({
  entry: path.resolve(__dirname, 'app2', 'index.js'),
  plugins: [
    nodeResolve(),
    commonjs({
      include: 'node_modules/**',
			exclude: [ 'node_modules/three/**' ]
    }),
    glsl()
  ]
}));

// app.use('/ivs2.js', function(request, response) {
//   const make = spawn('make', ['build2/ivs.js']);
//   make.stdout.on('data', d => {
//     console.log(d.toString());
//   });
//   make.stderr.on('data', d => {
//     console.log(d.toString());
//   });
//   make.on('close', (code) => {
//     console.log(`Done building with status code ${code}`);
//     const build_path = path.resolve(__dirname, 'build2', 'ivs.js');
//     express.static(build_path).apply(express, arguments);
//   });
// });

app.use('/ivs.js', function(request, response) {
  const make = spawn('make');
  make.stdout.on('data', d => {
    console.log(d.toString());
  });
  make.stderr.on('data', d => {
    console.log(d.toString());
  });
  make.on('close', (code) => {
    console.log(`Done building with status code ${code}`);
    const build_path = path.resolve(__dirname, 'build', 'ivs.js');
    express.static(build_path).apply(express, arguments);
  });
});

//
// Static Files
//

var staticPath = path.resolve(__dirname, 'static');

app.use('/', express.static(staticPath));

module.exports = app;
