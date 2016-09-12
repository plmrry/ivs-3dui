const rollup = require('rollup');
const nodeResolve = require('rollup-plugin-node-resolve');
// import babel from 'rollup-plugin-babel';
// import nodeResolve from 'rollup-plugin-node-resolve';
// import commonjs from 'rollup-plugin-commonjs';

let cache;

rollup.rollup({
  entry: 'app2/index.js',
  cache: cache,
  plugins: [
    nodeResolve()
  ]
}).then(bundle => {
  cache = bundle;
  bundle.write({
    format: 'iife',
    dest: 'build/ivs.js'
  });
});
