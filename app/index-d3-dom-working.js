import Cycle from '@cycle/core';
// import {makeDOMDriver, div, input, p} from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';

d3.selection.prototype.nodes = function() {
	let nodes = [];
	this.each(function() {
		nodes.push(this);
	});
	return nodes;
};

const stream = Rx.Observable;

function main({ d3Dom }) {
	
	let add$ = d3Dom.select('.add').events('click').map(ev => +1);
	let remove$ = d3Dom.select('.remove').events('click').map(ev => -1);
	
  const count$ = stream
  	.merge(
  		add$,
  		remove$
  	)
  	.startWith(2)
  	.scan((x,y) => x+y)
  	.map(n => d3.range(n).map(d => 'remove'))
  	.map(r => {
  		return {
  			buttons: ['one', 'two', 'add'].concat(r)
  		}
  	});

  return {
    d3Dom: count$
  };
}

const drivers = {
  d3Dom: makeD3DomDriver('#app'),
  state: makeStateDriver()
};

Cycle.run(main, drivers);

function makeStateDriver() {
	// const subject = new Rx.Subject();
	
	return function(stateUpdate$) {
		
		// const state$ = stateUpdate$
		// 	.startWith({})
		// 	.scan((state, fn) => {
		// 		fn(state);
		// 		debug('state:update')(state);
		// 		return state;
		// 	})
			
		// state$.subscribe(s => debug('whaaa'))
			
		stateUpdate$
			.filter(o => typeof o !== 'function')
			.do(o => console.log(o))
			// .do(u => console.log(typeof u))
			.subscribe();
			
		// return state$;
		// return subject;
	};
}

function makeD3DomDriver(selection) {
	const container = d3.select(selection).style('border', '1px solid #666');

	return function d3DomDriver(domUpdate$) {
		
		const container$ = domUpdate$
			.startWith(container)
			.scan((container, fn) => {
				if (typeof fn !== 'function') {
					fn = makeUpdateFn(fn);
				}
				fn(container);
				debug('dom:update')(container);
				return container;
			})
			.shareReplay(1); // Otherwise this happens everytime someone else subscribes
			
		container$.subscribe();
		
		return {
			
			select: function(selector) {
				
				let selection$ = container$.map(c => c.selectAll(selector));

				return {
					
					observable: selection$.filter(s => s.node()),
						// .flatMap(s => s.node() ? stream.just(s) : stream.empty()),
					
					events: function(type) {
						
						return selection$.flatMap(observableFromD3Event(type));
						
					}
					
				};
				
			}
			
		};
		
	};
	
	function makeUpdateFn(dom) {
		return function(container) {
			console.log(dom)
			let button = container.selectAll('button').data(dom.buttons);
			button.enter().append('button')
				.attr('class', d => d)
				.text(d => d);
			button.exit().remove();
		};
	}
	
	function observableFromD3Event(type) {
		return function(selection) {
			return stream
				.create(observer => 
					selection.on(type, function(d) {
						observer.onNext({
							datum: d,
							node: this,
							event: d3.event
						});
					})
				);
		};
	}
}
