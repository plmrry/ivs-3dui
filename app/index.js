import Cycle from '@cycle/core';
import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import makeD3DomDriver from './d3DomDriver.js';

import log from './log.js';

Rx.config.longStackSupport = true;

debug.enable('*');

function main({ dom }) {
	
	const main_size$ = windowSize(dom)
		.subscribe(log);
	
	const dom_state_reducer$ = stream
		.just(dom => dom.append('p').text('hello'));
	
	return {
		dom: dom_state_reducer$
	};
}

Cycle.run(main, {
	dom: makeD3DomDriver('#app')
});

function windowSize(dom) {
	return dom
		.select(() => window)
		.events('resize')
		.pluck('node')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth * 0.8,
      height: element.innerHeight * 0.8
		}));
}