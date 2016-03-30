import Cycle from '@cycle/core';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';
import _ from 'underscore';
import combineLatestObj from 'rx-combine-latest-obj';
import d3_selection from 'd3-selection';

import * as camera from './camera.js';
import * as scene from './scene.js';
import * as renderer from './renderer.js';

debug.enable('*');

const stream = Rx.Observable;
Rx.config.longStackSupport = true;

THREE.Object3D.prototype.appendChild = function (c) { 
	this.add(c); 
	return c; 
};
THREE.Object3D.prototype.insertBefore = THREE.Object3D.prototype.appendChild;
THREE.Object3D.prototype.querySelector = function(query) {
	let key = Object.keys(query)[0];
	return this.getObjectByProperty(key, query[key]);
};
THREE.Object3D.prototype.querySelectorAll = function (query) { 
	if (typeof query === 'undefined') return this.children;
	return this.children.filter(d => _.isMatch(d, query));
};

function main({ renderers }) {
	
	const size$ = stream
		.of({ width: 400, height: 400 })
		.shareReplay();
		
	const renderers_state_reducer$ = renderer.component({ size$ });
		
	const dom_reducer$ = stream
		.of({ main: { } }, { main: { } }, { main: { } }, { main: { } })
		.withLatestFrom(
			renderers,
			(model, renderers) => { 
				model.main.canvases = [
					renderers.querySelector({ name: 'main' }).domElement
				];
				return model;
			}
		)
		.map(model => dom => {
			const main = dom.selectAll('main').data([model.main]);
			
			const entered = main
				.enter()
				.append('main')
				.style('border', '1px solid black')
				.style('height', '600px')
				.style('width', '600px')
				.style('position', 'relative');
				
			const main_canvas = main
				.selectAll('canvas')
				.data(d => d.canvases || []);
				
			main_canvas
				.enter()
				.append(d => d);
				
			entered
				.append('div')
				.attr('id', 'file-controls')
				.style('left', '0')
				.style('top', '0')
				.style('position', 'absolute')
				.style('height', '100px')
				.style('width', '100px')
				.style('border', '1px solid orange');
				
			const scene_controls = entered
				.append('div')
				.attr('id', 'scene-controls')
				.style('right', '0')
				.style('top', '0')
				.style('position', 'absolute')
				.style('height', '100px')
				.style('width', '100px')
				.style('border', '1px solid red');
				
			scene_controls
				.append('button')
				.attr('id', 'add-object')
				.text('add object');
				
			scene_controls
				.append('canvas')
				.attr('id', 'editor-canvas')
				.style('border', '1px solid green');
				
			scene_controls
				.append('button')
				.attr('id', 'add_cone')
				.text('add cone to selected');
				
			const camera_controls = entered
				.append('div')
				.attr('id', 'camera-controls')
				.style('right', '0')
				.style('bottom', '0')
				.style('position', 'absolute')
				.style('height', '100px')
				.style('width', '100px')
				.style('border', '1px solid green');
				
			camera_controls
				.append('button')
				.attr('id', 'orbit_camera')
				.text('orbit_camera')
				.style('height', '100px');
				
			camera_controls
				.append('button')
				.attr('id', 'camera-to-birds-eye')
				.text('camera to birds eye');
				
			const debug = entered
				.append('div')
				.attr('id', 'debug')
				.style('left', '0')
				.style('bottom', '0')
				.style('position', 'absolute')
				.style('height', '100px')
				.style('width', '100px')
				.style('border', '1px solid red');
				
			return dom;
		});
	
	return {
		renderers: renderers_state_reducer$,
		dom: dom_reducer$
	};
}

Cycle.run(main, {
	renderers: makeStateDriver('renderers'),
	cameras: makeStateDriver('cameras'),
	scenes: makeStateDriver('scenes'),
	render: (source$) => source$.subscribe(fn => fn()),
	dom: makeD3DomDriver('#app')
});

function makeD3DomDriver(selector) {
	return function d3DomDriver(state_reducer$) {
		const dom_state$ = state_reducer$
			.scan(apply, d3.select(selector))
			.shareReplay();
		dom_state$
			.do(s => debug('dom')('update'))
			.subscribe();
		return {
			state$: dom_state$,
			select: function(selector) {
				let selection$ = dom_state$.map(dom => dom.select(selector));
				return {
					observable: function() {
						return selection$;
					},
					events: makeEventsGetter(selection$),
					d3dragHandler: makeDragHandler(selection$)
				};
			}
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

function makeStateDriver(name) {
	return function stateDriver(state_reducer$) {
		const state$ = state_reducer$
			.scan(apply, new Selectable())
			.shareReplay();
			
		state$
			.do(s => debug(name)(s.children))
			.subscribe();
		
		return state$;
	};
}

function Selectable(array) {
	this.children = array || [];
	this.querySelector = function(query) {
		return this.children.filter(d => _.isMatch(d, query))[0];
	};
	this.querySelectorAll = function(query) {
		if (typeof query === 'undefined') return this.children;
		return this.children.filter(d => _.isMatch(d, query));
	};
	this.appendChild = function(child) {
		this.children.push(child);
		return child;
	};
	this.insertBefore = this.appendChild;
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

function apply(o, fn) {
	return fn(o);
}

function d3TweenStream(duration, name) {
  return stream.create(function(observer) {
    return d3.select({})
      .transition()
      .duration(duration)
      .ease('linear')
      .tween(name, function() {
        return function(t) {
          return observer.onNext(t);
        };
      })
      .each("end", function() {
        return observer.onCompleted();
      });
  });
}

function log(d) {
	console.log(d);
}