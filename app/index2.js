/* jshint esversion: 6 */
/* jshint unused: true */
/* jshint undef: true */
/* jshint -W087 */
/* global window, document, console */ // jshint ignore:line

import * as d3 from 'd3';
import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';
import THREE from 'three/three.js';
import createVirtualAudioGraph from 'virtual-audio-graph';
import _ from 'underscore';
import xs from 'xstream';

// console.log(createVirtualAudioGraph);
//
// console.log(xs);
// 
// _.each([2,3,4], function(d) {
//   console.log('baaahghghghg')
// })
//
// // const { foo, bar } = { foo: 12, bar: 32 };
//
// const scene = new THREE.Scene();
//
// console.log(scene);
//
// console.log(d3.version);
//
// console.log('hope make works I changed something');
//
// debug('ivs:main')('whats up motherfuckers');
//
// stream.interval(100).take(5).subscribe(d => debug('ivs:obs')(d))
