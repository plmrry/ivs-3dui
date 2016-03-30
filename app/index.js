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

// intent = dom$ => actions$
// model = actions$ => model$
// view = model$ => state_reducer$

function mouse({ dom$, size$ }) {
	const ndcScale$ = size$
  	.map(({ width, height }) => ({
  		x: d3.scale.linear().domain([0, width]).range([-1, +1]),
  		y: d3.scale.linear().domain([0, height]).range([+1, -1])
  	}));
	const drag_handler$ = dom$
  	.d3dragHandler();
  const event$ = stream
  	.merge(
  		drag_handler$.events('drag'),
  		drag_handler$.events('dragstart'),
  		drag_handler$.events('dragend'),
  		dom$.events('mousemove')
  	);
  const mouse$ = event$
  	.map((obj) => { 
  		obj.mouse = d3.mouse(obj.node);
  		return obj;
  	})
  	.withLatestFrom(
  		ndcScale$,
  		(event, ndcScale) => { 
  			event.ndc = {
  				x: ndcScale.x(event.mouse[0]), 
  				y: ndcScale.y(event.mouse[1]) 
  			};
  			return event;
  		}
  	);
  return mouse$;
}

function main({ renderers, dom, scenes, cameras }) {
	
	const size$ = stream
		.of({ width: 400, height: 400 })
		.shareReplay();
		
	const main_canvas$ = dom
    .select('#main-canvas');
		
	const main_mouse$ = mouse({ dom$: main_canvas$, size$ });
	
	const main_camera_state$ = cameras
		.map(c => c.querySelector({ name: 'main' }));
		
	const main_scene$ = scenes
	  .map(scenes => scenes.querySelector({ name: 'main' }));
		
	const main_raycaster$ = main_mouse$
		.withLatestFrom(
			main_camera_state$,
			(ev, c) => ({ event: ev, camera: c })
		)
		.map(({ event, camera }) => { 
  		const raycaster = new THREE.Raycaster();
  		raycaster.setFromCamera(event.ndc, camera);
  		event.raycaster = raycaster;
  		return event;
  	});
  	
  const main_intersect_targets$ = main_scene$
  	.map(scene => {
  		const floor = scene.getObjectByProperty('name', 'floor');
  		const sound_objects = scene.children.filter(d => d.name === 'sound_object');
  		return [
  			{ key: 'floor', targets: [floor] },
  			{ key: 'sound_objects', targets: sound_objects }
  		];
  	});
  	
  const main_intersects$ = combineLatestObj
  	({
  		event: main_raycaster$,
  		targets: main_intersect_targets$,
  	})
  	.map(({ event, targets }) => {
  		event.intersects = targets
  			.map(obj => {
  				obj.intersects = event.raycaster.intersectObjects(obj.targets, true);
  				return obj;
  			});
  		return event;
  	});
		
	const renderers_state_reducer$ = renderer
		.component({ size$ });
	
	const scenes_model$ = scene
		.component({ dom, main_intersects$ });
	const scenes_state_reducer$ = scenes_model$
		.map(main_scene => [ main_scene ])
		.map(model => scene.state_reducer(model));
		
	const camera_model$ = camera
		.component({ dom$: dom.state$, size$ })
		.shareReplay();
	const cameras_state_reducer$ = camera_model$
		.map(camera.state_reducer);
		
	const renderSets$ = stream
		.of([
			{
				render_id: 'main',
				scene_id: 'main',
				camera_id: 'main'
			},
			// {
			// 	render_id: 'editor',
			// 	scene_id: 'editor',
			// 	camera_id: 'editor'
			// }
		]);
		
	const render_function$ = combineLatestObj
		({
			renderers,
			scenes,
			cameras,
			renderSets$
		})
		.map(({ renderers, scenes, cameras, renderSets }) => () => {
			renderSets.forEach(({ render_id, scene_id, camera_id }) => {
				const renderer = renderers.querySelector({ name: render_id });
				const scene = scenes.querySelector({ name: scene_id });
				const camera = cameras.querySelector({ name: camera_id });
				renderer.render(scene, camera);
			});
		});
		
	const dom_state_reducer$ = stream
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
				.append(d => d)
				.attr('id', 'main-canvas');
				
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
		dom: dom_state_reducer$,
		scenes: scenes_state_reducer$,
		cameras: cameras_state_reducer$,
		render: render_function$
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