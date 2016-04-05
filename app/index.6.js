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

function mouse({ dom$ }) {
	const ndcScale$ = dom$
		.observable()
		.map(dom => dom.node())
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

function get_raycaster({ mouse$, camera$ }) {
	const raycaster$ = mouse$
		.withLatestFrom(
			camera$,
			(ev, c) => ({ event: ev, camera: c })
		)
		.map(({ event, camera }) => { 
  		const raycaster = new THREE.Raycaster();
  		raycaster.setFromCamera(event.ndc, camera);
  		event.raycaster = raycaster;
  		return event;
  	});
  return raycaster$;
}

function get_intersects({ raycaster$, targets$ }) {
	const intersects$ = raycaster$
		.withLatestFrom(
			targets$,
			(r, t) => ({ event: r, targets: t })
		)
  	.map(({ event, targets }) => {
  		event.intersects = targets
  			.map(obj => {
  				obj.intersects = event.raycaster.intersectObjects(obj.targets, true);
  				return obj;
  			});
  		return event;
  	});
  return intersects$;
}

function select(query) {
	return function(d) {
		return d.querySelector(query);
	};
}

function main({ renderers, dom, scenes, cameras }) {
	
	const size$ = stream
		.of({ width: 400, height: 400 })
		.shareReplay();
		
	const main_mouse$ = mouse({ 
		dom$: dom.select('#main-canvas')
	});
	
	const editor_mouse$ = mouse({
		dom$: dom.select('#editor-canvas')
	});
	
 	const main_raycaster$ = get_raycaster({ 
 		mouse$: main_mouse$, 
 		camera$: cameras.map(select({ name: 'main' }))
 	});
 	
 	const editor_raycaster$ = get_raycaster({
 		mouse$: editor_mouse$,
 		camera$: cameras.map(select({ name: 'editor' }))
 	});
  	
  const main_intersect_targets$ = scenes
	  .map(select({ name: 'main' }))
  	.map(scene => {
  		const floor = scene.getObjectByProperty('name', 'floor');
  		const sound_objects = scene.children.filter(d => d.name === 'sound_object');
  		return [
  			{ key: 'floor', targets: [floor] },
  			{ key: 'sound_objects', targets: sound_objects }
  		];
  	});
  	
  const editor_intersect_targets$ = scenes
 		.map(select({ name: 'editor' }))
 		.map(scene => {
 			return [
 				{ key: 'children', targets: scene.children }
 			];
 		});
  
  const main_intersects$ = get_intersects({
  	raycaster$: main_raycaster$,
  	targets$: main_intersect_targets$
  });
  
  const editor_intersects$ = get_intersects({
  	raycaster$: editor_raycaster$,
  	targets$: editor_intersect_targets$
  });
  // .pluck('intersects', '0', 'intersects')
  // .subscribe(log)
		
	const renderers_state_reducer$ = renderer
		.component({ size$ });
	
	const main_scene_model$ = scene
		.component({ dom, main_intersects$, editor_intersects$ })
		.shareReplay();
		
	const selected$ = main_scene_model$
		.pluck('sound_objects')
		.map(arr => arr.filter(d => d.selected)[0])
		.do(s => debug('selected')(s));
		
	const editor_cards$ = selected$
		.withLatestFrom(
			renderers.map(r => r.querySelector({ name: 'editor' })),
			(s, r) => ({ selected: s, renderer: r })
		)
		.map(({ selected, renderer }) => {
			if (typeof selected === 'undefined') return [];
			const cards = [
				{ 
					canvases: [ { node: renderer.domElement } ],
					style: {
						position: 'relative'
					},
					buttons: [
						{
							id: 'add-cone',
							text: 'add cone'
						}
					]
				}
			];
			return cards;
		});
		
	const editor_sound_objects_model$ = selected$
		.map(obj => {
			if (typeof obj !== 'undefined') {
				obj.position = undefined;
				return [obj];
			}
			else return [];
		});
		
	const editor_scene_model$ = editor_sound_objects_model$
		.map(sound_objects => {
			return {
				name: 'editor',
				sound_objects,
				screens: [
					{}
				]
			};
		});
		
	const scenes_state_reducer$ = stream
		.combineLatest(
			main_scene_model$,
			editor_scene_model$
		)
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
			{
				render_id: 'editor',
				scene_id: 'editor',
				camera_id: 'editor'
			}
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
		
	const dom_model$ = combineLatestObj
		({
			renderers,
			editor_cards$
		})
		.map(({ renderers, editor_cards }) => {
			return {
				main: {
					canvases: [
						{
							node: renderers.querySelector({ name: 'main' }).domElement
						}
					]
				},
				editor_cards
			};
		});

	const dom_state_reducer$ = dom_model$
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
				.append(d => d.node)
				.attr('id', 'main-canvas');
			
			const controls_data = [
				{
					id: 'scene-controls',
					style: {
						right: 0,
						top: 0
					},
					buttons: [
						{
							id: 'add-object',
							text: 'add object at random'
						}
					],
					cards: model.editor_cards
				},
				{
					id: 'camera-controls',
					style: {
						bottom: 0,
						right: 0
					},
					buttons: [
						{
							id: 'orbit-camera',
							text: 'orbit camera'
						},
						{
							id: 'camera-to-birds-eye',
							text: 'camera to birds eye'
						}
					]
				}
			];
			
			const controls = main
				.selectAll('div.controls')
				.data(d => controls_data)
				.enter()
				.append('div')
				.attr('id', d => d.id)
				.classed('controls', true)
				.style({
					width: '100px',
					height: '100px',
					border: '1px solid black',
					position: 'absolute'
				})
				.each(function(d) {
					d3.select(this)
						.style(d.style);
				});
				
			controls
				.selectAll('button')
				.data(d => d.buttons || [])
				.enter()
				.append('button')
				.attr('id', d => d.id)
				.text(d => d.text);
				
			const editor_cards = main
				.selectAll('.controls')
				.selectAll('.card')
				.data(d => {
					return d.cards || [];
				});
				
			editor_cards
				.exit()
				.remove();

			editor_cards
				.enter()
				.append('div')
				.classed('card', true)
				.style({
					width: '100px',
					height: '100px',
					border: '2px solid red'
				});
				
			const editor_canvas = editor_cards
				.selectAll('canvas')
				.data(d => d.canvases || []);
				
			editor_canvas	
				.enter()
				.append(d => d.node)
				.attr('id', 'editor-canvas');
				
			const editor_buttons = editor_cards
				.selectAll('button')
				.data(d => d.buttons || []);
				
			editor_buttons
				.enter()
				.append('button')
				.attr('id', d => d.id)
				.text(d => d.text);
				
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
			// .scan(apply, d3_selection.select(selector))
			.shareReplay();
		dom_state$
			.do(s => debug('dom')('update'))
			.subscribe();
		return {
			state$: dom_state$,
			select: function(selector) {
				let selection$ = dom_state$
					.map(dom => dom.select(selector))
					.filter(s => s.node() !== null);
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