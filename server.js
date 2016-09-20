'use strict';

var express = require('express');
var path = require('path');
// var babelify = require('express-babelify-middleware');
var serveIndex = require('serve-index');
var rollup = require('rollup-endpoint');
const cheerio = require('cheerio');

const nodeResolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');

var app = express();

app.set('port', 9877);

let cache;

app.use('/ivs.js', rollup.serve({
  entry: path.resolve(__dirname, 'app', 'index.js'),
  external: [
    'bundle'
  ],
  cache,
  plugins: [
    nodeResolve(),
    commonjs({
      include: 'node_modules/**',
      exclude: [ 'node_modules/three/**' ]
    }),
    glsl()
  ],
  generateOptions: {
    format: 'umd',
    moduleName: 'ivs',
    sourceMap: true,
    cache
  }
}));

app.use('/', express.static(path.resolve(__dirname, 'static')));

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

var devPath = path.resolve(__dirname, 'development');

app.use('/development', serveIndex(devPath));
app.use('/development', express.static(devPath));

module.exports = app;
