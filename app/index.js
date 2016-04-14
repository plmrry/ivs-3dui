import Cycle from '@cycle/core';
import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import makeD3DomDriver from './d3DomDriver.js';
import makeStateDriver from './stateDriver.js';

import dom_component from './dom.js';
import Renderer from './renderer.js';

import log from './log.js';

Rx.config.longStackSupport = true;
debug.enable('*');

function main({ dom, renderers, windowSize }) {

	const main_size$ = windowSize
		.pluck('target')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth,
      height: element.innerHeight
		}));
		
	const dom_state_reducer$ = dom_component({ main_size$, renderers });
	const renderers_state_reducer$ = Renderer({ main_size$ });
	return {
		dom: dom_state_reducer$,
		renderers: renderers_state_reducer$
	};
}

Cycle.run(main, {
	dom: makeD3DomDriver('#app'),
	renderers: makeStateDriver('renderers'),
	windowSize: () => stream.fromEvent(window, 'resize')
});
