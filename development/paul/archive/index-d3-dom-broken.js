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
	
	// let firstButton$ = stream.just(d => d.append('button').text('add').classed('add', true));
	
	let firstButton$ = stream.just({
		buttons: ['one', 'two', 'add']
	});
	
	let add$ = d3Dom.select('.add').events('click')
		.map(d => 1);
		
	// let removeButton$ = stream
	// 	.merge(add$)
	// 	.startWith(0)
	// 	.scan((acc, i) => acc + i)
	// 	.map(n => d3.range(n).map(d => 'remove'))
	// 	.do(d => console.log(d))
	// 	.shareReplay()
		// .subscribe()
		
	// let removeButton$ = stream.just(['remove'])
	let removeButton$ = add$.startWith(['remove']);
		
	let allButtons$ = firstButton$
		.withLatestFrom(
			removeButton$,
			(f, r) => {
				f.buttons = f.buttons.concat(r);
				return f;
			}
		)
		.do(d => console.log(d))
		// .subscribe()
		
	// let remove$ = d3Dom.select('')
	
	// let windowSize$ = d3Dom
	// 	.select(d => window)
	// 	.events('resize')
	// 	.pluck('node')
	// 	.startWith(window)
	// 	.map(w => ({ width: w.innerWidth, height: w.innerHeight }))
	// 	// .do(debug('resize'))
	// 	// .map(s => ({ renderer }) => renderer.setSize( s.width, s.height ))
	// 	.map(size => {
	// 		return {
	// 			renderers: [
	// 				{
	// 					id: 'main',
	// 					size: [ size.width, size.height ]
	// 				}
	// 			]
	// 		};
	// 	});
		
	// // windowSize$.subscribe()
	
	
		// .scan(i => i+1, 0)
		// .do(debug('add')).subscribe()
	// d3Dom.select('.add').observable
	// 	.do(debug('add'))
	// 	.do(s => console.log(s.node()))
	// 	.subscribe()
	
	return {
		d3Dom: stream.merge( allButtons$ ),
		// state: windowSize$
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
				
				let selection$ = container$.map(c => c.select(selector));

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
