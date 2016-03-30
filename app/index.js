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

debug.disable();

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

// d3.selection.prototype.nodes = function() {
// 	let nodes = [];
// 	this.each(function() { nodes.push(this); });
// 	return nodes;
// };

function main({ custom, cameras$, scenes$, dom }) {
	
	const dom_state$ = dom;
	
	const size$ = stream
		.of({ width: 400, height: 400 })
		.shareReplay();
		
  const ndcScale$ = size$
  	.map(({ width, height }) => ({
  		x: d3.scale.linear().domain([0, width]).range([-1, +1]),
  		y: d3.scale.linear().domain([0, height]).range([+1, -1])
  	}));
	
	const main_canvas$ = custom.dom
    .select('#main-canvas')
    // .shareReplay()
    
  // const main_canvas_node$ = dom_state$
  // 	.map(dom => dom.select('#main-canvas').node());
  	
  const main_canvas_node$ = main_canvas$
  	.observable()
  	.map(o => o.node())
  	.first()
  	
  // const editor_canvas_node$ = dom_state$
  	// .map(dom => dom.select('#editor-canvas'))
  	
  const editor_canvas_node$ = custom.dom
  	.select('#editor-canvas')
  	.observable()
  	.map(o => o.node())
  	.first()
  	// .do(log)
    
  const main_canvas_drag_handler$ = main_canvas$
  	.d3dragHandler();

	const main_scene$ = scenes$
	  .map(scenes => scenes.querySelector({ name: 'main' }))
	  .do(s => debug('scene')('state'));
	
	const main_camera_state$ = cameras$
		.map(c => c.querySelector({ name: 'main' }));

  const main_canvas_event$ = stream
  	.merge(
  		main_canvas_drag_handler$.events('drag'),
  		main_canvas_drag_handler$.events('dragstart'),
  		main_canvas_drag_handler$.events('dragend'),
  		main_canvas$.events('mousemove')
  	)
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
  	)
  	.withLatestFrom(
  		main_camera_state$,
  		(e,c) => ({ event: e, camera: c })
  	)
  	.map(({ event, camera }) => { 
  		let raycaster = new THREE.Raycaster();
  		raycaster.setFromCamera(event.ndc, camera);
  		event.raycaster = raycaster;
  		return event;
  	})
  	.withLatestFrom(
  		main_scene$,
  		(event, scene) => ({ event, scene })
  	)
  	.map(({ event, scene }) => {
  		/** FIXME: It's inefficient to get ojects on every event */
  		let floor = scene.getObjectByProperty('name', 'floor');
  		let objects = scene.children.filter(d => _.isMatch(d, { name: 'sound_object' }));
  		event.intersects = {
  			floor: event.raycaster.intersectObject(floor),
  			sound_objects: event.raycaster.intersectObjects(objects, true)
  		};
  		return event;
  	})
  	.shareReplay();

	const clicked$ = main_canvas_event$
		.pairwise()
		.filter(arr => arr[0].event.type === 'dragstart')
		.filter(arr => arr[1].event.type === 'dragend')
		.pluck('1');
 		
	const clicked_key$ = clicked$
		.pluck('intersects', 'sound_objects', '0', 'object')
		.map(o => {
			if (typeof o !== 'undefined') {
				/** TODO: Better way of selecting parent when child cone is clicked? */
				if (o._type === 'cone') return o.parent.parent.__data__.key;
				return o.__data__.key;
			}
			return undefined;
		})
		// .do(log)
		.distinctUntilChanged()
		.shareReplay();
 		
	const select_object$ = clicked_key$
		.filter(key => typeof key !== 'undefined')
		.map(key => objects => {
			return objects.map(obj => {
				if (obj.key === key) {
					obj.selected = true;
					obj.material.color = '66c2ff';
					return obj;
				}
				return obj;
			});
		});
 		
	const unselect_object$ = clicked_key$
		.pairwise()
		.pluck('0')
		.filter(key => typeof key !== 'undefined')
		.map(key => objects => {
			return objects.map(obj => {
				if (obj.key === key) {
					obj.selected = false;
					obj.material.color = 'ffffff';
					return obj;
				}
				return obj;
			});
		});

	const camera_model$ = camera
		// .component({ dom$: custom.dom, size$ })
		.component({ dom$: dom, size$ })
		.shareReplay();
	
	const camera_reducer$ = camera_model$.map(camera.state_reducer);
		
	const add_object$ = custom.dom
		.select('#add_object')
		.events('click')
		.map((ev, i) => ({
			count: i,
			key: i,
			class: 'sound_object',
			type: 'sound_object',
			name: 'sound_object',
			position: {
				x: Math.random() * 2 - 1,
				y: Math.random() * 2 - 1,
				z: Math.random() * 2 - 1,
			},
			volume: Math.random() + 0.4,
			material: {
				color: 'ffffff'
			},
			cones: [
				{
					volume: 2,
					spread: 0.5,
					rotation: {
						x: 0.5,
						y: 0.1,
						z: 0.1
					},
					lookAt: {
						x: 2,
						y: 1,
						z: 1
					}
				}
			],
		}))
		.map(obj => objects => {
			return objects.concat(obj);
		});
		
	const add_cone_click$ = dom_state$
		.map(dom => dom.select('#add_cone'))
		.flatMap(observableFromD3Event('click'))
		.shareReplay();
		
	const add_cone_to_selected$ = add_cone_click$
		.map(ev => {
			let DEFAULT_CONE_VOLUME = 1;
			let DEFAULT_CONE_SPREAD = 0.5;
			return {
				volume: DEFAULT_CONE_VOLUME,
				spread: DEFAULT_CONE_SPREAD,
				lookAt: {
					x: Math.random(),
					y: Math.random(),
					z: Math.random()
				}
			};
		})
		.map(cone => objects => {
			return objects.map(obj => {
				if (obj.selected === true) obj.cones.push(cone);
				return obj;
			});
		});
		
	const sound_objects_update$ = stream
		.merge(
			add_object$,
			select_object$,
			unselect_object$,
			add_cone_to_selected$
		);
		
	const sound_objects$ = sound_objects_update$	
		.startWith([])
		.scan(apply)
		.shareReplay();
		
	const main_scene_model$ = sound_objects$
		.map(sound_objects => {
			return {
				name: 'main',
				floors: [
					{
						name: 'floor'
					}
				],
				sound_objects
			};
		});

	const selected$ = sound_objects$
		.map(arr => arr.filter(d => d.selected)[0]);
		
	const editor$ = selected$
		.map(obj => {
			if (typeof obj !== 'undefined') {
				obj.position = undefined;
				return [obj];
			}
			else return [];
		});
		
	const editor_scene_model$ = editor$
		.map(sound_objects => {
			return {
				name: 'editor',
				sound_objects
			};
		});
	
	const renderer_model$ = combineLatestObj
		({
			main: main_canvas_node$.first(),
			editor: editor_canvas_node$,
			size$
		})
		.map(({main, editor, size}) => {
			return [
				{
					id: 'main',
					name: 'main',
					canvas: '#main-canvas',
					canvas_node: main,
					size: size
				},
				{
					name: 'editor',
					canvas: '#editor-canvas',
					canvas_node: editor,
					size: {
						width: 300,
						height: 300
					}
				}
			];
		})
		// .do(log)
		.shareReplay();
		
	const renderers$ = renderer_model$
		.map(renderer.state_reducer)
		.scan(apply, new Selectable());
		
	const renderSets$ = stream
		.of([
			{
				render_id: 'main',
				scene_id: 'main',
				camera_id: 'main'
			},
			{
				render_id: 'editor',
				scene_id: 'editor',
				camera_id: 'editor'
			}
		]);
		
	const renderFunction$ = combineLatestObj
		({
			renderers$,
			scenes$,
			cameras$,
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
	
	const scenes_reducer$ = stream
		.combineLatest(
			main_scene_model$,
			editor_scene_model$
		)
		.map(model => scene.state_reducer(model));
		
	const dom_reducer$ = stream
		.of({
			main: {
				
			}
		})
		.map(model => dom => {
			const main = dom.selectAll('main').data([model.main]);
			
			const entered = main
				.enter()
				.append('main')
				.style('border', '1px solid black')
				.style('height', '500px')
				.style('width', '500px')
				.style('position', 'relative');
				
			entered
				.append('canvas')
				.attr('id', 'main-canvas')
				.attr('width', '400px')
				.attr('height', '400px')
				.style('border', '1px solid blue');
				
			entered
				.append('div')
				.attr('id', 'file-controls')
				.style('left', '0')
				.style('top', '0')
				.style('position', 'absolute')
				.style('height', '100px')
				.style('width', '100px')
				.style('border', '1px solid orange');
				
			entered
				.append('div')
				.attr('id', 'scene-controls')
				.style('right', '0')
				.style('top', '0')
				.style('position', 'absolute')
				.style('height', '100px')
				.style('width', '100px')
				.style('border', '1px solid red');
				
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
				
			debug
				.append('button')
				.attr('id', 'add_cone')
				.text('add cone to selected');
				
			return dom;
		});
	
	return {
		custom: scenes_reducer$,
		cameras$: camera_reducer$,
		scenes$: scenes_reducer$,
		render: renderFunction$,
		dom: dom_reducer$
	};
}

Cycle.run(main, {
	custom: makeCustomDriver('#app'),
	cameras$: makeStateDriver('cameras'),
	scenes$: makeStateDriver('scenes'),
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
		return dom_state$;
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


function makeCustomDriver() {

	var container = d3.select('body')
		.append('div');
	
	container
		.append('canvas')
		.attr('id', 'main-canvas')
		.style({
			border: '1px solid black'
		});
		
	container
		.append('canvas')
		.attr('id', 'editor-canvas')
		.style({
			border: '1px solid red'
		})
		.attr({
			height: '300px',
			width: '300px'
		});
		
	var controls = container.append('div');
		
	controls
		.append('button')
		.attr('id', 'add_object')
		.text('add object');

	return function customDriver(view$) {
			
		const dom$ = new Rx.ReplaySubject();
		
		view$.map(view => {
			debug('view')('view update');
			
			dom$.onNext(container);

			return view;
		})
		.subscribe()
		
		return {
			dom: {
				select: function(selector) {
					let selection$ = dom$.map(dom => dom.select(selector));
					return {
						observable: function() {
							return selection$;
						},
						events: function(type) {
							return selection$.flatMap(observableFromD3Event(type));
						},
						d3dragHandler: function() {
							let handler = d3.behavior.drag();
							let dragHandler$ = selection$
								.map(s => {
									handler.call(s); 
									return handler;
								});
							return {
								events: function(type) {
									return dragHandler$.flatMap(observableFromD3Event(type));
								}
							};
						}
					};
				}
			}
		};
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