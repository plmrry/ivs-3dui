/* jshint esversion: 6 */

import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';
import d3 from 'd3';
import THREE from 'three/three.js';
import createVirtualAudioGraph from 'virtual-audio-graph';
import _ from 'underscore';

// import OBJLoader from './OBJLoader.js';
import makeD3DomDriver from './d3DomDriver.js';
// import makeStateDriver from './stateDriver.js';

// import * as DOM from './dom.js';
// import * as Renderer from './renderer.js';
// import * as Camera from './camera.js';
// import * as Scene from './scene.js';

import log from './utilities/log.js';
import apply from './utilities/apply.js';
// import Selectable from './utilities/selectable.js';

Rx.config.longStackSupport = true;

function main() {
	const windowSize = stream.fromEvent(window, 'resize');
	const main_size$ = mainSize(windowSize);
	
	
}

main();

function mainSize(windowSize$) {
	return windowSize$
		.pluck('target')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth,
      height: element.innerHeight
		}));
}