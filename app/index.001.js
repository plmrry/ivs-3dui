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
import * as dom_component from './dom.js';

debug.enable('*');
// debug.enable('*,-raycasters');
// debug.disable('raycasters')

const stream = Rx.Observable;
Rx.config.longStackSupport = true;

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

function select(query) {
	return function(d) {
		return d.querySelector(query);
	};
}

function main({ renderers, dom, scenes, cameras, raycasters }) {
	
	const editor_intersects$ = raycasters
		.select({ name: 'editor' });
	
	const main_intersects$ = raycasters
		.select({ name: 'main' });
	
	const size$ = dom
		.select(() => window)
		.events('resize')
		.pluck('node')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth * 0.8,
      height: element.innerHeight * 0.8
		}))
		.shareReplay(1);

	const main_mouse$ = mouse({ 
		dom$: dom.select('#main-canvas')
	})
	.shareReplay(1);
	
	const editor_mouse$ = mouse({
		dom$: dom.select('#editor-canvas')
	})
	.shareReplay(1);
	
	const main_camera$ = cameras
		.map(select({ name: 'main' }))
		.shareReplay(1);
 	
 	const main_intersect_targets$ = scenes
 		.map(select({ name: 'main' }))
 		.map(scene => {
 			return [
 				{ key: 'children', targets: scene.children, recursive: true }
 			];
 		});
 		
 	const editor_intersect_targets$ = scenes
 		.map(select({ name: 'editor' }))
 		.map(scene => {
 			return [
 				{ key: 'children', targets: scene.children, recursive: true }
 			];
 		})
 		.shareReplay(1);
 		
 	const main_raycaster_model$ = main_mouse$
 		.withLatestFrom(
 			main_camera$,
 			main_intersect_targets$,
 			(mouse, camera, target_groups) => ({ mouse, camera, target_groups })
 		)
 		.map(obj => Object.assign(obj, { name: 'main' }));
 	
 	const editor_raycaster_model$ = editor_mouse$
 		.withLatestFrom(
 			cameras.map(select({ name: 'editor' })),
 			editor_intersect_targets$,
 			(mouse, camera, target_groups) => ({ mouse, camera, target_groups })
 		)
 		.map(obj => Object.assign(obj, { name: 'editor' }));
 	
 	const raycasters_model$ = stream
 		.combineLatest(
 			main_raycaster_model$,
 			editor_raycaster_model$.startWith(null)
 		)
 		.map(arr => arr.filter(d => d !== null));
 		
 	const raycasters_state_reducer$ = raycasters_model$
 		.map(model => selectable => {
 			const join = d3_selection
 				.select(selectable)
 				.selectAll()
 				.data(model, d => d.name);
 				
 			const objects = join
 				.enter()
 				.append(function(d) {
 					return { 
 						raycaster: new THREE.Raycaster(),
 						event$: new Rx.ReplaySubject(1),
 						name: d.name
 					};
 				})
 				.merge(join)
 				.each(function(d) {
 					this.raycaster.setFromCamera(d.mouse.ndc, d.camera);
 					const intersect_groups = d.target_groups
 						.map(obj => {
 							obj.intersects = this.raycaster.intersectObjects(obj.targets, obj.recursive);
 							return obj;
 						});
 					this.event$.onNext({
 						event: d.mouse.event,
 						intersect_groups
 					});
 				});
 				
 			return selectable;
 		});
		
	const renderers_state_reducer$ = renderer
		.component({ size$ });
	
	const main_scene_model$ = scene
		.component({ dom, main_intersects$, editor_intersects$ })
		.shareReplay();
		
	const selected$ = main_scene_model$
		.pluck('sound_objects')
		.map(arr => arr.filter(d => d.selected)[0])
		.do(s => debug('selected')(s));
		
	const editor_dom$ = selected$
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
		
	const main_canvas$ = renderers
		.map(renderers => renderers.querySelector({ name: 'main' }))
		.map(renderer => renderer.domElement);
		
	const dom_model$ = dom_component.model({ main_canvas$, editor_dom$, size$ });
	const dom_state_reducer$ = dom_component.view(dom_model$);
	
	return {
		renderers: renderers_state_reducer$,
		dom: dom_state_reducer$,
		scenes: scenes_state_reducer$,
		cameras: cameras_state_reducer$,
		render: render_function$,
		raycasters: raycasters_state_reducer$
	};
}

Cycle.run(main, {
	renderers: makeStateDriver('renderers'),
	cameras: makeStateDriver('cameras'),
	scenes: makeStateDriver('scenes'),
	render: (source$) => source$.subscribe(fn => fn()),
	dom: dom_component.makeD3DomDriver('#app'),
	raycasters: makeStateDriver2('raycasters')
});

function makeStateDriver2(name) {
	return function stateDriver(state_reducer$) {
		const state$ = state_reducer$
			.scan(apply, new Selectable())
			.shareReplay();
			
		state$
			.do(s => debug(name)(s.children))
			.subscribe();
		
		return {
			observable: state$,
			select: function(selector) {
			  const selection$ = state$
			    .map(selectable => selectable.querySelector(selector))
			    .filter(d => typeof d !== 'undefined');
			  return selection$;
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

function apply(o, fn) {
	return fn(o);
}

// function d3TweenStream(duration, name) {
//   return stream.create(function(observer) {
//     return d3.select({})
//       .transition()
//       .duration(duration)
//       .ease('linear')
//       .tween(name, function() {
//         return function(t) {
//           return observer.onNext(t);
//         };
//       })
//       .each("end", function() {
//         return observer.onCompleted();
//       });
//   });
// }

function log(d) {
	console.log(d);
}