import d3 from 'd3';
import debug from 'debug';
import { Observable as stream } from 'rx';

import apply from './utilities/apply.js';

export default function makeD3DomDriver(selector) {
	return function d3DomDriver(state_reducer$) {
		const dom_state$ = state_reducer$
			.scan(apply, d3.select(selector))
			.do(debug('driver:dom'))
			.shareReplay(1);
		dom_state$.subscribe();
		return {
			state$: dom_state$,
			select: makeSelect(dom_state$)
		};
	};
}

function makeSelect(dom_state$) {
	return function(selector) {
		let selection$ = dom_state$
			.map(dom => dom.select(selector))
			.filter(s => s.node() !== null)
			.shareReplay(1);
		return {
			observable: function() {
				return selection$;
			},
			events: makeEventsGetter(selection$),
			d3dragHandler: makeDragHandler(selection$)
		};
	};
}

function makeEventsGetter(selection$) {
	return function(type) {
		return selection$.flatMap(observableFromD3Event(type));
	};
}

function makeDragHandler(selection$) {
	return function() {
		const handler = d3.behavior.drag();
		const dragHandler$ = selection$
			.map(s => {
				handler.call(s); 
				return handler;
			});
		return {
			events: function(type) {
				return dragHandler$.flatMap(observableFromD3Event(type));
			}
		};
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