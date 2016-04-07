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

function intent({ dom, raycasters, cameras_model_proxy$ }) {
	const main_raycaster$ = raycasters
		.select({ name: 'main' })
		.pluck('event$')
		.flatMapLatest(obs => obs)
		.distinctUntilChanged()
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
	
	const event_sources = {
		dom, 
		raycasters,
		cameras_model_proxy$
	};
	
	const { 
		add_object_click$,
		camera_is_birds_eye$,
		size$,
		main_raycaster$
	} = intent(event_sources);
	
	/** 
	 *	RENDERERS
	 */ 

	const renderers_state_reducer$ = renderer
		.component({ size$ });
		
	/** 
	 *	SCENES
	 */
	 
	const new_object_proxy$ = new Rx.ReplaySubject(1);
	 
	const scene_sources = {
		dom,
		raycasters,
		main_raycaster$,
		camera_is_birds_eye$,
		new_object_proxy$,
		add_object_click$
	};
	
	const scene_actions = scene.intent(scene_sources);

	const { scenes_model$, new_object$, selected$ } = scene.model(scene_actions);
	
	new_object$.subscribe(new_object_proxy$);
	
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