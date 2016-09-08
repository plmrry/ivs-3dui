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

window.AudioContext = window.AudioContext || window.webkitAudioContext;

// import { scoped_sound_object, scoped_sound_object_2 } from './soundObject.js';
// import { scoped_sound_cone } from './soundCone.js';

// debug.enable('*');
// debug.enable('scenes')
// debug.enable('*,-raycasters,-cameras,-camera');
debug.disable();
// debug.enable('event:*,sound-objects:*');

const stream = Rx.Observable;
Rx.config.longStackSupport = true;

function main({ 
	renderers, dom, scenes, cameras, raycasters, head, loadFile,
	audioContexts, decodeAudio, bufferSources
}) {
	bufferSources
		.select({ name: 'main' })
		.subscribe(log);
	
	/**
	 * DECODE AUDIO
	 */
	
	const audioBuffer$ = loadFile
		.withLatestFrom(
			audioContexts.select({ name: 'main' }),
			(file, context) => ({ file, context })
		);
		
	// decodeAudio
	// 	.subscribe(log);
		
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
	
	const { 
		scenes_state_reducer$, selected$, heads$, main_scene_model$
	} = scene.component(scene_sources);
	
	/**
	 * FILE
	 */
	 
	// const all_objects_2$ = scenes
	// 	.select({ name: 'main' })
	// 	.map(scene => { 
	// 		const objects = scene.children.filter(d => d.name === 'sound_object');
	// 		const cones = objects
	// 			.map(obj => obj.children)
	// 			.reduce((a,b) => a.concat(b), [])
	// 			.map(cone_parent => {
	// 				const datum = d3.select(cone_parent).datum();
	// 				const { matrixWorld } = cone_parent;
	// 				return Object.assign({}, datum, { matrixWorld })
	// 			});
	// 		return { objects, cones };
	// 	});
	 
	const all_objects$ = main_scene_model$
		.map(model => {
			const objects = model.sound_objects;
			const cones = objects
				.map(obj => obj.cones.map(cone => { cone.t = obj.t; return cone; }))
				.reduce((a,b) => a.concat(b), []);
			return { objects, cones };
		})
		.shareReplay(1);
	 
	const cone_with_file$ = main_scene_model$
		.pluck('sound_objects')
		.flatMap(arr => stream.from(arr))
		.pluck('cones')
		.flatMap(arr => stream.from(arr))
		.filter(({ file }) => typeof file !== 'undefined');
		
	const cone_file_names$ = cone_with_file$
		.pluck('file')
		.distinctUntilChanged();
		
	/**
	 * BUFFER SOURCES
	 */
	 
	const buffer_source_model$ = all_objects$
		.pluck('cones')
		.flatMapLatest(arr => stream
			.from(arr)
			.flatMap(cone => {
				return decodeAudio
					.filter((d) => d.name === cone.file)
					.take(1)
					.map(({ buffer }) => {
						return {
							cone,
							buffer,
							key: cone.id
						};
					});
			})
			.toArray()
		)
		.withLatestFrom(
			audioContexts.select({ name: 'main' }),
			(model, contextObj) => ({ model, contextObj })
		);
		
	const buffer_sources_state_reducer$ = buffer_source_model$
		.map(buffer_sources_state_reducer);
		
	function buffer_sources_state_reducer({ model, contextObj }) {
		// console.log(model[0].cone.t)
		const { context, destination } = contextObj;
		return function(selectable) {
			const join = d3_selection
				.select(selectable)
				.selectAll()
				.data(model, d => d.key);
				
			const buffer_sources = join
				.enter()
				.append(function(d) {
					debug('buffer:create')(d);
					const source = context.createBufferSource();
					const panner = context.createPanner();
					const volume = context.createGain();
					
					source.loop = true;
					source.buffer = d.buffer;
					source.start(context.currentTime + 0.020);
					
					panner.panningModel = 'HRTF';
					panner.coneInnerAngle = 0.01*180/Math.PI;
					panner.coneOuterAngle = 1*180/Math.PI;
					panner.coneOuterGain = 0.03;
					panner._position = {};
					panner._orientation = {};
					panner._lookAt = {}
					
					source.connect(volume);
					volume.connect(panner);
					panner.connect(destination);
					
					return {
						cone_id: d.cone.id,
						source,
						panner,
						volume,
						key: d.key
					};
				})
				.merge(join)
				.each(function({ cone }) {
					/** Set position */
					const p = cone.parent.position;
					// var _pos;
					// cone.parent.trajectories = cone.parent.trajectories || [];
					// // if (cone.parent.trajectories.length > 0) {
					const traj = cone.parent.trajectories[0];
					const vectors = traj.points.map(v => (new THREE.Vector3()).copy(v));
					const curve = new THREE[traj.splineType](vectors);
					curve.closed = true;
					const trajectoryOffset = curve.getPoint(cone.t);
					// console.log(trajectoryOffset, p);
					var p2 = (new THREE.Vector3()).addVectors(p, trajectoryOffset);
						// if (! _.isMatch(this.position, trajectoryOffset)) {
						// 	debug('sound object')('set trajectory position', trajectoryOffset);
						// 	this.position.copy(trajectoryOffset);
						// }
					// }
					// console.log(p, cone.t);
					if (! _.isMatch(this.panner._position, p2)) {
						this.panner.setPosition(p2.x, p2.y, p2.z);
						this.panner._position = p2;
					}
					if (! _.isMatch(this.panner._lookAt, cone.lookAt)) {
						this.panner._lookAt = cone.lookAt;
						const vec = new THREE.Vector3();
						vec.copy(cone.lookAt);
						vec.normalize();
						this.panner.setOrientation(vec.x, vec.y, vec.z);
					}
				});
				
			return selectable;
		};
	}
	
	/**
	 * AUDIO CONTEXTS
	 */
	 
	function audio_context_component({ head$ }) {
		const contexts_model$ = head$
			.map(({ position, lookAt }) => ({
				name: 'main',
				lookAt,
				position
			}))
			.map(c => [c]);
			
		const contexts_state_reducer$ = contexts_model$
			.map(context_state_reducer);
			
		return { contexts_state_reducer$ };
	}
	 
	// const head$ = scenes
	// 	.select({ name: 'main' })
	// 	.map(scene => scene.getObjectByProperty('name', 'head'))
	// 	.filter(head => typeof head !== 'undefined')
	// 	.distinctUntilChanged();
	const head$ = heads$
		.pluck('0')
		.filter(head => typeof head !== 'undefined');
		
	function context_state_reducer(model) {
		return function(selectable) {
			const join = d3_selection
				.select(selectable)
				.selectAll()
				.data(model);
				
			const contexts = join
				.enter()
				.append(function(d) {
					const context = new window.AudioContext();
					const destination = context.createGain();
					destination.connect(context.destination);
					return {
						name: d.name,
						context,
						destination
					};
				})
				.merge(join)
				.each(function(d) {
					/** set orientation and position */
					const vec = new THREE.Vector3();
					vec.copy(d.lookAt);
					vec.normalize();
					this.context.listener.setOrientation(vec.x, vec.y, vec.z, 0, 1, 0);
					const p = d.position;
					this.context.listener.setPosition(p.x, p.y, p.z);
				});
				
			return selectable;
		};
	}
	
	const { contexts_state_reducer$ } = audio_context_component({ head$ });
	
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
		bufferSources: buffer_sources_state_reducer$,
		decodeAudio: audioBuffer$,
		loadFile: cone_file_names$,
		audioContexts: contexts_state_reducer$,
		renderers: renderers_state_reducer$,
		scenes: scenes_state_reducer$,
		cameras: cameras_state_reducer$,
		render: render_function$,
		raycasters: raycasters_state_reducer$,
		dom: dom_state_reducer$
	};
}

Cycle.run(main, {
	audioContexts: makeStateDriver('audioContexts'),
	bufferSources: makeStateDriver('bufferSources'),
	renderers: makeStateDriver('renderers'),
	scenes: makeStateDriver('scenes'),
	cameras: makeStateDriver('cameras'),
	raycasters: makeStateDriver('raycasters'),
	render: (source$) => source$.subscribe(fn => fn()),
	dom: dom_component.makeD3DomDriver('#app'),
	loadFile: makeFileLoaderDriver(),
	decodeAudio: makeDecodeDriver(),
	head: function() {
		OBJLoader(THREE);
		const loader = new THREE.OBJLoader();
		return stream.create(observer => {
			loader.load('assets/head.obj', d => { observer.onNext(d) });
		});
	}
});

function makeDecodeDriver() {
	return function(sink$) {
		const data$ = sink$
			.flatMap(({ context, file }) => {
				const ctx = context.context;
				const buffer = file.data;
				return stream.create(observer => {
					ctx.decodeAudioData(buffer, function(data) {
						observer.onNext(data);
					})
				})
				// return stream.fromPromise(ctx.decodeAudioData(buffer))
				// return stream.fromCallback(ctx.decodeAudioData)(buffer)
				.map(buffer => ({
					name: file.name,
					buffer
				}));
			});
			
		// data$.subscribe();
		
		return data$;
	};
}

function makeFileLoaderDriver() {
	return function(fileName$) {
		const file$ = fileName$
			.flatMap(name => {
				var request = new XMLHttpRequest();
				request.open("GET", `assets/${name}`, true);
        request.responseType = "arraybuffer";
        const response$ = stream.create(observer => {
        	request.onload = function() {
        		observer.onNext({
        			name,
        			data: request.response
        		});
        	};
        });
        request.send();
				return response$;
			});
		
		// file$.subscribe();
		
		return file$;
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

function makeStateDriver(name) {
	return function stateDriver(state_reducer$) {
		const state$ = state_reducer$
			.scan(apply, new Selectable())
			.do(s => debug(name)(s.children));
			
		// state$
		// 	.do(s => debug(name)(s.children));
		
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