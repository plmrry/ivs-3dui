import Cycle from '@cycle/core';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';
// import OBJLoader from 'three-obj-loader';
import OBJLoader from './OBJLoader.js';
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
// debug.enable('event:*,sound-objects:*');

const stream = Rx.Observable;
Rx.config.longStackSupport = true;

function main({ renderers, dom, scenes, cameras, raycasters, head }) {
		
	/** 
	 *	ACTIONS
	 */ 
	 
	const cameras_model_proxy$ = new Rx.Subject();
	
	const size$ = windowSize(dom);
	
	const editor_size$ = stream.just({
		width: 300,
		height: 300
	});
	
	const camera_is_birds_eye$ = cameras_model_proxy$
		.flatMap(arr => stream.from(arr))
		.filter(d => d.name === 'main')
		.pluck('lat_lng', 'is_max_lat')
		.distinctUntilChanged()
		.do(debug('event:camera-is-top'))
		.shareReplay(1)
		.distinctUntilChanged();
		
	const add_object_click$ = dom
		.select('#add-object')
		.events('click')
		.shareReplay(1)
		.distinctUntilChanged();
	
	const main_raycaster$ = raycasters
		.select({ name: 'main' })
		.pluck('event$')
		.flatMapLatest(obs => obs)
		.shareReplay(1)
		.distinctUntilChanged();
		
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
		
	const main_dragstart$ = main_intersects$
		.filter(({ event }) => event.type === 'dragstart');
		
	const main_drag$ = main_intersects$
		.filter(({ event }) => event.type === 'drag');
		
	const main_dragend$ = main_intersects$
		.filter(({ event: { type } }) => type === 'dragend');
		
	const main_floor_delta$ = main_drag$
		.withLatestFrom(
			main_dragstart$,
			(drag, start) => ({ drag, start })
		)
		.map(obj => {
			const { drag, start } = obj;
			const delta = (new THREE.Vector3()).subVectors(start.floor_point, drag.floor_point);
			return Object.assign(obj, { delta });
		});
	
	/** 
	 *	RENDERERS
	 */ 

	const renderers_state_reducer$ = renderer
		.component({ size$, editor_size$ });
		
	/** 
	 *	SCENES
	 */
	
	const scene_sources = {
		raycasters, main_dragstart$, main_drag$, main_dragend$,
		camera_is_birds_eye$, add_object_click$, dom, head
	};
	
	const { scenes_state_reducer$, selected$ } = scene.component(scene_sources);
	
	/** 
	 *	DOM
	 */ 
	
	const dom_state_reducer$ = dom_component
		.component({ 
			renderers, 
			selected$,
			size$,
			editor_size$
		});
		
	/** 
	 *	CAMERAS
	 */ 
	 
	const { cameras_model$, cameras_state_reducer$ } = camera
		.component({
			add_object_click$, 
			camera_is_birds_eye$, 
			main_floor_delta$,
			dom, 
			size$,
			editor_size$
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
	dom: dom_component.makeD3DomDriver('#app'),
	head: function() {
		OBJLoader(THREE);
		const loader = new THREE.OBJLoader();
		// loader.load('assets/head.obj', d => { debugger })
		// return stream.empty()
		// return stream.fromCallback(loader.load.bind(this))('assets/head.obj');
		return stream.create(observer => {
			loader.load('assets/head.obj', d => { observer.onNext(d) });
		});
	}
});

function makeStateDriver(name) {
	return function stateDriver(state_reducer$) {
		const state$ = state_reducer$
			.scan(apply, new Selectable());
			
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