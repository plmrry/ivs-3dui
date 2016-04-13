import Cycle from '@cycle/core';
import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import makeD3DomDriver from './d3DomDriver.js';
import makeStateDriver from './stateDriver.js';

import dom_component from './dom.js';

import log from './log.js';

Rx.config.longStackSupport = true;
debug.enable('*');

function main({ dom }) {
	const main_size$ = windowSize(dom);
	const dom_state_reducer$ = dom_component({ main_size$ });
	return {
		dom: dom_state_reducer$
	};
}

Cycle.run(main, {
	dom: makeD3DomDriver('#app'),
	renderers: makeStateDriver('renderers')
});

function windowSize(dom) {
	return dom
		.select(() => window)
		.events('resize')
		.pluck('node')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth,
      height: element.innerHeight
		}));
}