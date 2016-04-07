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

// debug.enable('*');
// debug.enable('*,-raycasters');
debug.disable();
debug.enable('event:*');

const stream = Rx.Observable;
Rx.config.longStackSupport = true;

function main({ renderers, dom, scenes, cameras, raycasters }) {
	
	const cameras_model_proxy$ = new Rx.Subject();
	const camera_is_birds_eye$ = cameras_model_proxy$
		.flatMap(arr => stream.from(arr))
		.filter(d => d.name === 'main')
		.pluck('lat_lng', 'is_max_lat')
		.distinctUntilChanged()
		.do(debug('event:camera-is-top'))
		.shareReplay(1);
		
	const add_object_proxy$ = new Rx.Subject();
	const new_object_proxy$ = new Rx.ReplaySubject();
	
	const new_object_id$ = new_object_proxy$
		.pluck('id')
		.shareReplay(1);
		
	new_object_id$.subscribe();
		
	const add_object_click$ = dom
		.select('#add-object')
		.events('click')
		.shareReplay(1);
		
	const main_raycaster$ = raycasters
		.select({ name: 'main' })
		.pluck('event$')
		.flatMapLatest(obs => obs)
		.distinctUntilChanged()
		.shareReplay();
		
	const main_dragstart$ = main_raycaster$
		.filter(({ event }) => event.type === 'dragstart');
		
	const add_button_update$ = add_object_click$
		.map(ev => state => {
			state.ready = true;
			return state;
		});
		
	const birds_eye_update$ = camera_is_birds_eye$
		.map(value => state => {
			state.camera_is_top = value;
			return state;
		});
		
	const main_dragstart_update$ = main_dragstart$
		.map(ev => state => {
			if (state.ready === true && state.camera_is_top === true) {
				state.adding = true;
			}
			state.ready = false;
			state.event = ev;
			return state;
		});

	const cancel_add$ = new_object_proxy$
		.map(ev => state => {
			if (state.adding === true) {
				state.adding = false;
			}
			state.ready = false;
			return state;
		});
		
	const add_state$ = stream
		.merge(
			add_button_update$,
			birds_eye_update$,
			main_dragstart_update$,
			cancel_add$
		)
		.startWith({
			ready: false,
			camera_is_top: false,
			adding: false
		})
		.scan(apply)
		.shareReplay()
		
	const dragstart_key_2$ = add_state$
		// .filter(state => { debugger })
		.do(state => console.log(state))
		.filter(state => state.ready === false && state.adding === false)
		.pluck('event', 'intersect_groups')
		.filter(arr => typeof arr !== 'undefined')
		.flatMapLatest(arr => stream.from(arr))
		.pluck('intersects', '0', 'object')
		.map(obj => {
			if (obj.name === 'sound_object') return d3.select(obj).datum().key;
			/** TODO: Better way of selecting parent when child cone is clicked? */
			if (obj.name === 'cone') return d3.select(obj.parent.parent).datum().key;
			return undefined;
		})
		// .subscribe(log);
		
	const select_object$ = stream
		.merge(
			dragstart_key_2$
		  // new_object_id$
		)
		.map(key => {
			// console.log(key);
			return {
				event: 'select-object',
				key
			};
		})
		.shareReplay(1);
		
	const floor_click_point$ = main_raycaster$
		.pairwise()
		.filter(arr => arr[0].event.type === 'dragstart')
		.filter(arr => arr[1].event.type === 'dragend')
		.pluck('1')
		.pluck('intersect_groups')
		.flatMapLatest(arr => stream.from(arr))
		.pluck('intersects')
		.flatMapLatest(arr => stream.from(arr))
		.filter(({ object }) => object.name === 'floor')
		.pluck('point');
		
	const add_object$ = floor_click_point$
		.withLatestFrom(
			add_state$.pluck('adding'),
			(floor, add) => ({ floor, add })
		)
		.filter(({ floor, add }) => add)
		.pluck('floor')
		.map(position => ({
			event: 'add-object',
			position
		}))
		.do(debug('event:add-object'))
		.shareReplay(1);
		
	add_object$.subscribe(add_object_proxy$);
	
	const add_cone$ = dom
		.select('#add-cone')
		.events('click')
		.shareReplay();
		
	const editor_raycaster$ = raycasters
		.select({ name: 'editor' })
		.pluck('event$')
		.flatMapLatest(obs => obs)
		.distinctUntilChanged()
		.shareReplay()
		// .subscribe(log)
		
	const editor_mousemove_panel$ = editor_raycaster$
		.pluck('intersect_groups')
		.flatMap(arr => stream.from(arr))
		.filter(d => d.key === 'children')
		.pluck('intersects', '0', 'point')
		.shareReplay()
		// .subscribe(log)
		
	// const panel_point$ = editor_intersects$
	// 	.pluck('event$')
	// 	.flatMapLatest(obs => obs)
	// 	.pluck('intersect_groups')
	// 	.flatMap(arr => stream.from(arr))
	// 	.filter(d => d.key === 'children')
	// 	.pluck('intersects', '0', 'point');
	
	const scene_actions = {
		// add_object$,
		// select_object$,
		// add_cone$,
		// editor_mousemove_panel$
		// unselect_object$
	};
		
	const size$ = windowSize(dom);
	
	const editor_size$ = stream
		.of({
			width: 300,
			height: 300
		});
		
	const renderers_state_reducer$ = renderer
		.component({ size$ });
		
	/** 
	 *	SCENES
	 */ 

	const { scenes_model$, new_object$, selected$ } = scene.model({ scene_actions });
	
	// new_object$.subscribe(new_object_proxy$);
	
	const scenes_state_reducer$ = scene.view(scenes_model$);
	
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
		
	const camera_actions = camera.intent({
		add_object_click$,
		camera_is_birds_eye$,
		dom,
		size$
	});
	
	const cameras_model$ = camera
		.model({ 
			actions: camera_actions
		});
		
	cameras_model$.subscribe(cameras_model_proxy$);
	
	const cameras_state_reducer$ = camera
		.view(cameras_model$);
		
	/** RAYCASTERS */
	
	const raycasters_state_reducer$ = raycaster
		.component({
			dom, cameras, scenes
		});
		
	const render_sets$ = getRenderSets();
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