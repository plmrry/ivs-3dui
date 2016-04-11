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
import * as raycaster from './raycaster.js';

import { scoped_sound_object, scoped_sound_object_2 } from './soundObject.js';
import { scoped_sound_cone } from './soundCone.js';

// debug.enable('*');
// debug.enable('*,-raycasters,-cameras,-camera');
debug.disable();
// debug.enable('event:*');

const stream = Rx.Observable;
Rx.config.longStackSupport = true;

function intent({ dom, raycasters, cameras_model_proxy$ }) {
	const main_raycaster$ = raycasters
		.select({ name: 'main' })
		.pluck('event$')
		.flatMapLatest(obs => obs)
		// .distinctUntilChanged()
		.shareReplay(1);
	
	const camera_is_birds_eye$ = cameras_model_proxy$
		.flatMap(arr => stream.from(arr))
		.filter(d => d.name === 'main')
		.pluck('lat_lng', 'is_max_lat')
		.distinctUntilChanged()
		.do(debug('event:camera-is-top'))
		.shareReplay(1);
		
	const add_object_click$ = dom
		.select('#add-object')
		.events('click')
		.shareReplay(1);
	
	const size$ = windowSize(dom);
		
	return {
		add_object_click$,
		camera_is_birds_eye$,
		size$,
		main_raycaster$
	};
}

function main({ renderers, dom, scenes, cameras, raycasters }) {
		
	/** 
	 *	ACTIONS
	 */ 
	 
	const cameras_model_proxy$ = new Rx.Subject();
	
	const { 
		add_object_click$,
		camera_is_birds_eye$,
		size$,
		// main_raycaster$
	} = intent({ dom, raycasters, cameras_model_proxy$ });
	
	const main_raycaster$ = raycasters
		.select({ name: 'main' })
		.pluck('event$')
		.flatMapLatest(obs => obs)
		// .distinctUntilChanged()
		.shareReplay(1);
	
	/** 
	 *	RENDERERS
	 */ 

	const renderers_state_reducer$ = renderer
		.component({ size$ });
		
	/** 
	 *	SCENES INTENT
	 */
	 
	// const new_object_proxy$ = new Rx.ReplaySubject(1);
	const new_object_proxy$ = new Rx.Subject();
	
	const new_object_key$ = new_object_proxy$
		.pluck('id')
		// .distinctUntilChanged();
		
	const add_object_mode$ = stream
		.merge(
			add_object_click$.map(() => true),
			new_object_proxy$.map(() => false)
		)
		.startWith(false)
		.shareReplay(1);
		
	const main_floor_point$ = main_raycaster$
		.flatMapLatest(({ event, intersect_groups }) => {
			return stream.from(intersect_groups)
				.pluck('intersects')
				.flatMapLatest(arr => stream.from(arr))
				.filter(({ object: { name } }) => name === 'floor')
				.pluck('point')
				.map(point => {
					return {
						event,
						point
					};
				});
				// .map(intersect => {
				// 	return Object.assign({}, intersect, { event: obj.event });
				// });
		})
		.shareReplay(1);
		// .do(log)
		// .subscribe(log)
		
	const main_intersects$ = main_raycaster$
		.map(({ event, intersect_groups }) => {
			const intersects = intersect_groups[0].intersects;
			const floors = intersects.filter(({ object: { name } }) => name === 'floor');
			const floor_point = typeof floors[0] === 'undefined' ? undefined : floors[0].point;
			const objects = intersects
				.filter(({ object: { name } }) => name === 'sound_object')
				.map(({ object }) => object);
			const first_object = objects[0];
			const first_object_name = first_object ? first_object.name : undefined;
			
			const first_object_key = (first_object_name === 'sound_object') ? 
				d3.select(first_object).datum().key : 
				(first_object_name === 'cone') ? 
				d3.select(first_object.parent.parent).datum().key :
				undefined;
				
			return {
				event,
				floors,
				floor_point,
				objects,
				first_object,
				first_object_key
			};
		});
		// .flatMapLatest(({ event, intersect_groups }) => {
		// 	return stream.from(intersect_groups)
		// 		.pluck('intersects')
		// 		.map(intersects => ({ intersects, event }));
		// })
		// .subscribe(log);
		
	const main_dragstart_2$ = main_intersects$
		.filter(({ event }) => event.type === 'dragstart');
		
	const main_drag_2$ = main_intersects$
		.filter(({ event }) => event.type === 'drag');
		
	const main_dragend$ = main_intersects$
		.filter(({ event: { type } }) => type === 'dragend');
		
	const main_dragstart$ = main_raycaster$
		.filter(({ event }) => event.type === 'dragstart');
		
	const main_drag$ = main_raycaster$
		.filter(({ event: { type } }) => type === 'drag');
		
	const main_dragstart_intersects$ = main_dragstart$
		.pluck('intersect_groups')
		.flatMapLatest(arr => stream.from(arr))
		.pluck('intersects')
		.shareReplay(1);
		
	// const main_floor_start$ = main_floor_point$
	// 	.filter(({ event: { type } }) => type === 'dragstart')
	// 	// .pluck('point')
		
	// const main_floor_drag$ = main_floor_point$
	// 	.filter(({ event: { type } }) => type === 'drag')
	// 	// .pluck('point');
		
	// const main_floor_end$ = main_floor_point$
	// 	.filter(({ event: { type } }) => type === 'dragend')
	// 	.pluck('point');
	
	function subVectors(arr) {
		return {
			x: arr[0].floor_point.x - arr[1].floor_point.x,
			y: arr[0].floor_point.y - arr[1].floor_point.y,
			z: arr[0].floor_point.z - arr[1].floor_point.z
		};
	}
		
	const main_floor_delta$ = main_drag_2$
		.withLatestFrom(
			main_dragstart_2$,
			(drag, start) => ({ drag, start })
		)
		.map(obj => {
			const { drag, start } = obj;
			const delta = (new THREE.Vector3()).subVectors(start.floor_point, drag.floor_point);
			return Object.assign(obj, { delta });
		})
		.shareReplay(1);
		
	const main_floor_pairwise_delta$ = main_dragstart_2$
		.flatMap(start => main_drag_2$
			.startWith(start)
			.pairwise()
			.takeUntil(main_dragend$)
		)
		.map(subVectors)
		.withLatestFrom(
			main_dragstart_2$,
			(delta, start) => ({ delta, start })
		)
		// .subscribe(log)
		
	// const object_drag$ = main_floor_delta$
	const object_drag$ = main_floor_pairwise_delta$
		.filter(({ start: { first_object_key } }) => typeof first_object_key !== 'undefined')
		.withLatestFrom(
			camera_is_birds_eye$,
			(drag, camera) => ({ drag, camera })
		);
		// .subscribe(log);
		// .subscribe(({ start }) => console.log(start.first_object_key))
		// .map(({ delta }) => {
		// 	return delta;
		// });
		// .map(({ drag, start }) => {
		// 	return (new THREE.Vector3()).subVectors(start.floor_point, drag.floor_point);
		// });

	const main_dragstart_intersect$ = main_dragstart_intersects$
		.pluck('0', 'object')
		.map(obj => {
			const name = obj.name;
			const key = (name === 'sound_object') ? 
				d3.select(obj).datum().key : 
				(name === 'cone') ? 
				d3.select(obj.parent.parent).datum().key :
				undefined;
			return {
				name, key
			};
		})
		.shareReplay(1)

	const selected_object$ = main_dragstart_intersect$
		.withLatestFrom(
			add_object_mode$,
			(event, mode) => ({ event, mode })
		)
		.filter(({ mode }) => mode !== true)
		.pluck('event')
		.pluck('key')
		.merge(new_object_key$)
		.shareReplay(1);
		
	// const main_drag$ = main_raycaster$
	// 	.filter(({ event }) => event.type === 'drag')
		
	// const drag_object$ = main_drag$
	// 	.withLatestFrom(
	// 		main_dragstart_intersect$,
	// 		(drag, start) => ({ drag, start })
	// 	)
	// 	.filter(({ start }) => start.name === 'sound_object' || start.name === 'cone')
	// 	.do(debug('event:drag'))
	// 	.subscribe()
		
	const add_object$ = main_raycaster$
		.pairwise()
		.filter(arr => arr[0].event.type === 'dragstart')
		.filter(arr => arr[1].event.type === 'dragend')
		.pluck('1')
		.pluck('intersect_groups')
		.flatMapLatest(arr => stream.from(arr))
		.pluck('intersects')
		.flatMapLatest(arr => stream.from(arr))
		.filter(({ object }) => object.name === 'floor')
		.pluck('point')
		.withLatestFrom(
			add_object_mode$,
			camera_is_birds_eye$,
			(point, mode, birds) => ({ point, mode, birds })
		)
		.filter(({ mode, birds}) => mode === true && birds === true)
		.pluck('point')
		.do(debug('event:add-object'));
		
	const add_cone$ = dom
		.select('#add-cone')
		.events('click');
	 
	// const { 
	// 	add_object$, 
	// 	selected_object$, 
	// 	add_cone$ 
	// } = scene.intent({
	// 	main_raycaster$,
	// 	camera_is_birds_eye$,
	// 	new_object_proxy$,
	// 	add_object_click$,
	// 	dom
	// });
	
	const editor_raycaster$ = raycasters
		.select({ name: 'editor' })
		.pluck('event$')
		.flatMapLatest(obs => obs)
	  .distinctUntilChanged()
	  // .shareReplay(1);
	  
	const editor_mousemove$ = editor_raycaster$
		.filter(({ event }) => event.type === 'mousemove');
		
	const editor_dragstart$ = editor_raycaster$
		.filter(({ event }) => event.type === 'dragstart')
		// .do(d => log('faaaa'))
		.shareReplay(1);
	  
	const editor_mousemove_panel$ = editor_mousemove$
		.pluck('intersect_groups')
		.flatMap(arr => stream.from(arr))
		.filter(d => d.key === 'children')
		.pluck('intersects', '0', 'point');
		
	function createCone(index) {
		return scoped_sound_cone(index)({ 
			editor_mousemove_panel$,
			editor_dragstart$,
			raycasters
		});
	}
		
	function createSoundObject(position, index) {
		const id = index;
		return scoped_sound_object(id, position)
			({ selected_object$, add_cone$, object_drag$, dom }, createCone);
	}
	
	function createSoundObject2(index, props$) {
		const id = index;
		const object_actions = { object_drag$, props$ };
		return scoped_sound_object_2(id)(object_actions);
	}
	
	const { scenes_state_reducer$, selected$, new_object$ } = scene
		.component({ add_object$ }, createSoundObject, createSoundObject2);
		
	new_object$.subscribe(new_object_proxy$);
	
	/** 
	 *	DOM
	 */ 
	
	const dom_state_reducer$ = dom_component
		.component({ 
			renderers, 
			selected$,
			size$
		});
		
	/** 
	 *	CAMERAS
	 */ 
	 
	const { cameras_model$, cameras_state_reducer$ } = camera
		.component({
			add_object_click$, camera_is_birds_eye$, main_floor_delta$,
			dom, size$
		});
		
	cameras_model$.subscribe(cameras_model_proxy$);
		
	/** 
	 * RAYCASTERS 
	 */
	
	const raycasters_state_reducer$ = raycaster
		.component({
			dom, cameras, scenes
		});
		
	/**
	 * RENDER SETS
	 */
		
	const render_sets$ = getRenderSets();
	
	/**
	 * RENDER FUNCTION
	 */
	 
	const render_function$ = renderFunction({
		renderers,
		scenes,
		cameras,
		render_sets$
	});
	
	return {
		renderers: renderers_state_reducer$,
		scenes: scenes_state_reducer$,
		cameras: cameras_state_reducer$,
		render: render_function$,
		raycasters: raycasters_state_reducer$,
		dom: dom_state_reducer$
	};
}

function renderFunction({ renderers, scenes, cameras, render_sets$ }) {
	return render_sets$
		.flatMap(arr => stream.from(arr))
		.flatMap(({ render_id, scene_id, camera_id }) => { 
			return combineLatestObj({
				renderer: renderers.select({ name: render_id }),
				scene: scenes.select({ name: scene_id }),
				camera: cameras.select({ name: camera_id })
			});
		})
		.map(({ renderer, scene, camera }) => () => renderer.render(scene, camera));
}

function getRenderSets() {
	return stream
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
}

function windowSize(dom$) {
	return dom$
		.select(() => window)
		.events('resize')
		.pluck('node')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth * 0.8,
      height: element.innerHeight * 0.8
		}))
		.shareReplay(1);
}

Cycle.run(main, {
	renderers: makeStateDriver('renderers'),
	scenes: makeStateDriver('scenes'),
	cameras: makeStateDriver('cameras'),
	raycasters: makeStateDriver('raycasters'),
	render: (source$) => source$.subscribe(fn => fn()),
	dom: dom_component.makeD3DomDriver('#app')
});

function makeStateDriver(name) {
	return function stateDriver(state_reducer$) {
		const state$ = state_reducer$
			.scan(apply, new Selectable())
			// .shareReplay(1);
			
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

function log(d) {
	console.log(d);
}