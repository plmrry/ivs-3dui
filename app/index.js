import Cycle from '@cycle/core';
import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import makeD3DomDriver from './d3DomDriver.js';
import makeStateDriver from './stateDriver.js';

import * as DOM from './dom.js';
import * as Renderer from './renderer.js';

import log from './utilities/log.js';

Rx.config.longStackSupport = true;
debug.enable('*');

function main({ dom, renderers, windowSize }) {
	
	const main_size$ = mainSize(windowSize);
	
	const main_canvases$ = renderers
  	.select({ name: 'main' })
  	.first()
  	.pluck('renderer', 'domElement')
  	.map(d => [d]);
  	
  const main_dom_model$ = combineLatestObj
  	({
  		main_size$,
  		canvases: main_canvases$.startWith([])
  	})
  	.map(({ main_size, canvases }) => ({
  		mains: [
  			{
  				styles: {
  					height: `${main_size.height}px`,
  					width: `${main_size.width}px`
  				},
  				canvases
  			}
  		]
  	}));
  	
  const renderers_model$ = combineLatestObj
		({
			main_size$
		})
		.map(({ main_size, editor_size }) => {
			return [
				{
					name: 'main',
					size: main_size
				},
				{
				  name: 'orbit',
				  size: {
				    height: 100,
				    width: 100
				  }
				}
			];
		});
		
	const dom_state_reducer$ = DOM.view(main_dom_model$);
	
	const renderers_state_reducer$ = Renderer.view(renderers_model$);
	
	return {
		dom: dom_state_reducer$,
		renderers: renderers_state_reducer$
	};
}

function mainSize(windowSize$) {
	return windowSize$
		.pluck('target')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth,
      height: element.innerHeight
		}));
}

Cycle.run(main, {
	dom: makeD3DomDriver('#app'),
	renderers: makeStateDriver('renderers'),
	windowSize: () => stream.fromEvent(window, 'resize')
});
