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

function main({ renderers, dom, scenes, cameras, raycasters }) {
	
	// raycasters
	// 	.select({ name: 'main' })
	// 	.pluck('event$')
	// 	.flatMapLatest(obs => obs)
	// 	.pluck('intersect_groups')
	// 	.flatMap(arr => stream.from(arr))
	// 	.filter(d => d.key === 'children')
	// 	.pluck('intersects', '0', 'point')
	// 	.subscribe(log);
	
	const cameras_model_proxy$ = new Rx.Subject();
	
	const camera_is_birds_eye$ = cameras_model_proxy$
		.flatMap(arr => stream.from(arr))
		.filter(d => d.name === 'main')
		.pluck('lat_lng', 'is_max_lat')
		.distinctUntilChanged()
		.do(debug('event:camera-is-top'))
		// .subscribe();
		
	const add_object_click$ = dom
		.select('#add-object')
		.events('click');
		
	const auto_birds_eye$ = add_object_click$
		.withLatestFrom(
			camera_is_birds_eye$,
			(ev, birds) => birds
		)
		.filter(d => !d);
		
	const birds_eye_button$ = dom
		.select('#camera-to-birds-eye')
		.events('click');
		
	const camera_action$ = stream
		.merge(
			auto_birds_eye$,
			birds_eye_button$
		)
		.map(() => ({
			scope: 'camera',
			event: 'move-to-birds-eye'
		}))
		.do(debug('event:move-camera'));
		
	// const await_ready_add$ = add_object_click$
	// 	.startWith(false)
	// 	.scan(d => !d)
	// 	.do(d => debug('event:await-ready-add')(d));
	// 	// .subscribe();
		
	// const ready_add$ = stream
	// 	.combineLatest(
	// 		await_ready_add$,
	// 		camera_is_birds_eye$
	// 	)
	// 	.map(arr => arr.every(d => d))
	// 	.do(debug('event:ready-add'))
	// 	.subscribe();

	const size$ = windowSize(dom);
	const editor_size$ = stream
		.of({
			width: 300,
			height: 300
		});
	const renderers_state_reducer$ = renderer
		.component({ size$ });
	const dom_state_reducer$ = dom_component
		.component({ 
			renderers, 
			selected$: stream.of(undefined),
			size$
		});
	const scenes_state_reducer$ = scene
		/** TODO: Rename to component */
		.component2({ dom, raycasters });
	const cameras_model$ = camera
		.model({ 
			dom, 
			size$, 
			editor_size$,
			camera_action$
		});
	cameras_model$.subscribe(cameras_model_proxy$);
	const cameras_state_reducer$ = camera.view(cameras_model$);
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