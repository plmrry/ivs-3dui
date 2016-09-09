import Cycle from '@cycle/core';
import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';
import d3 from 'd3';
import THREE from 'three/three.js';
import createVirtualAudioGraph from 'virtual-audio-graph';
import _ from 'underscore';

import OBJLoader from './OBJLoader.js';
import makeD3DomDriver from './d3DomDriver.js';
import makeStateDriver from './stateDriver.js';

import * as DOM from './dom.js';
import * as Renderer from './renderer.js';
import * as Camera from './camera.js';
import * as Scene from './scene.js';

import log from './utilities/log.js';
import apply from './utilities/apply.js';
import Selectable from './utilities/selectable.js';

Rx.config.longStackSupport = true;
debug.enable('*,-driver:*,-reducer:*');
// debug.enable('*');

function main(sources) {
	
	const { 
		renderers, scenes, cameras, windowSize, headObject, audioContexts 
	} = sources;
	
	const main_size$ = mainSize(windowSize);
	
	const latitude_to_theta = d3.scaleLinear()
		.domain([90, 0, -90])
		.range([0, Math.PI/2, Math.PI]);
		
	const longitude_to_phi = d3.scaleLinear()
		.domain([0, 360])
		.range([0, 2 * Math.PI]);
	
	const latitude$ = stream
		.just(45)
		.shareReplay(1);
		
	const longitude$ = stream
		.just(45)
		.shareReplay(1);
	
	const theta$ = latitude$
		.map(latitude_to_theta);
		
	const phi$ = longitude$
		.map(longitude_to_phi)
		.map(phi => phi % (2 * Math.PI))
		.map(phi => (phi < 0) ? (2 * Math.PI) + phi : phi);
	
	const polar_position$ = stream
		.combineLatest(
			stream.of(100),
			theta$,
			phi$,
			(radius, theta, phi) => ({ radius, theta, phi })
		);
	
	const relative_position$ = polar_position$
		.map(polarToVector);
	
	const panning_offset$ = stream
		.just([0,0,0])
		.map(([x,y,z]) => ({ x, y, z}));
	
	const lookAt$ = panning_offset$;
	
	const position$ = stream
		.combineLatest(
			relative_position$,
			lookAt$,
			(rel, look) => ({
				x: rel.x + look.x,
				y: rel.y + look.y,
				z: rel.z + look.z
			})
		);
		
	const lat_lng$ = combineLatestObj
		({
			latitude$, longitude$
		});
	
	const main_camera$ = combineLatestObj({
			position$,
			lookAt$,
			size: main_size$,
			lat_lng$
		})
		.map(({ position, lookAt, size, lat_lng }, index) => {
			return {
				name: 'main',
				size: size,
				position: position,
				zoom: 50,
				lookAt: lookAt,
				lat_lng,
				index
			};
		});
	
	const cameras_model$ = main_camera$
		.map(c => [c]);
	
	const first_trajectory_points = [
		[+0,+0,+0], 
		[+2,+1,-2], 
		[+5,-1,-2], 
		// [+8,+2,+3]
	].map(([x,y,z]) => new THREE.Vector3(x, y, z));
	
	const first_cone = {
		key: 17,
		lookAt: {
			x: 0.57,
			y: -0.1,
			z: 0.34
		},
		spread: 0.5,
		volume: 1,
		file: 'wetShort.wav',
		playing: true
	};
		
	const first_object = {
		key: 5,
		position: {
			x: -5,
			y: 1.5,
			z: 1.8
		},
		points: first_trajectory_points,
		splineType: 'CatmullRomCurve3',
		material: {
			color: 'ffffff'
		},
		volume: 1,
		t: 0.2,
		moving: true,
		cones: [ first_cone ]
	};
	
	first_cone.parent = first_object;
	// first_cone.key = 
	
	const heads$ = headObject
		.map(head => ({
			id: 'main',
			name: 'head',
			position: {
				x: -1,
				y: 1,
				z: 2
			},
			lookAt: {
				x: 1,
				y: 3,
				z: 1
			},
			object: head
		}))
		.map(h => [h])
		.shareReplay(1);
		
	const animation$ = stream
		.create(observer => {
			d3.timer(() => observer.onNext())
		})
		.timestamp()
		.pluck('timestamp')
		.map(time => time / 1e3); 
		// .map(seconds => seconds % period / period)
		// .map(t => ({
		// 	target: 0,
		// 	value: t
		// }))
		
	const sound_objects$ = stream
		.just([
			first_object
		])
		.flatMapLatest(arr => {
			const states$ = arr.map(obj => {
				const props$ = stream.just(obj);
				const hertz = 0.1;
				const period = 1/hertz;
				
				const trajectoryOffset$ = animation$
					.map(seconds => seconds % period / period);
					
				var state$ = trajectoryOffset$
					.withLatestFrom(
						props$,
						(t, props) => { props.t = t; return props } //Object.assign({}, props, { t })
					);
					
				state$ = state$.replay(null, 1);
				state$.connect();
					
				// return props$;
				return state$;
			});
			return stream.combineLatest(states$);
		})
		// .shareReplay(1);
		
	const main_scene_model$ = combineLatestObj
		({
			sound_objects$,
			heads$: heads$.startWith(Array(0))
		})
		.map(({ sound_objects, heads }) => ({
			name: 'main',
			floors: Array(1),
			sound_objects,
			heads
		}));
		
	const cone$ = main_scene_model$
		.pluck('sound_objects')
		.flatMap(arr => stream.from(arr))
		.pluck('cones')
		.flatMap(arr => stream.from(arr));
		
	const cone_file_names$ = cone$
		.filter(({ file }) => typeof file !== 'undefined')
		.pluck('file')
		.distinctUntilChanged();
		
	const file$ = cone_file_names$
		.flatMap(file => {
			var request = new XMLHttpRequest();
			request.open("GET", `assets/${file}`, true);
      request.responseType = "arraybuffer";
      const response$ = stream.create(observer => {
      	request.onload = function() {
      		// const result = Object.assign(cone, { buffer: request.response });
      		observer.onNext({
      			name: file,
      			data: request.response
      		});
      	};
      });
      request.send();
			return response$;
		})
		.replay(null, 1);
	
	file$.connect();
	
	const audioContext$ = heads$
		.map(context_state_reducer)
		.scan(apply, new Selectable())
		.map(d => d.querySelector({ id: 'main' }))
		.pluck('context');
		// .subscribe(d => { debugger });
		
	// audioContexts
	// 	.select({ name: 'main' })
	// 	.subscribe(d => { debugger })
		
	const audioBuffer$ = file$
		.withLatestFrom(
			audioContext$,
			(file, context) => ({ file, context })
		)
		.flatMap(({ file: { name, data }, context }) => {
			return stream.create(observer => {
				context.decodeAudioData(data, function(d) {
					observer.onNext(d);
				});
			})
			.map(buffer => ({
				name,
				buffer
			}));
		});
		
	const all_objects$ = main_scene_model$
		.map(model => {
			const objects = model.sound_objects;
			const cones = objects
				.map(obj => obj.cones.map(cone => { cone.t = obj.t; return cone; }))
				.reduce((a,b) => a.concat(b), []);
			return { objects, cones };
		})
		.shareReplay(1)
		// .subscribe(log);
		
	const audio_graph_model$ = all_objects$
		.pluck('cones')
		.flatMapLatest(array => stream
			.from(array)
			.flatMap(cone => {
				return audioBuffer$
					.filter(({ name }) => name === cone.file)
					.take(1)
					.map(({ buffer }) => {
						return {
							cone,
							buffer
						};
					});
			})
			.toArray()
		)
		.withLatestFrom(
			audioContext$,
			(model, context) => ({ model, context })
		)
		.map(audio_graph_state_reducer)
		.scan(apply, new Selectable())
		.subscribe();
		
	function audio_graph_state_reducer(model) {
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		return function(selectable) {
			const join = d3
				.select(selectable)
				.selectAll()
				.data([model]);
				
			const audio_graphs = join
				.enter()
				.append(function({ context }) {
					const virtualAudioGraph = createVirtualAudioGraph({ context });
					return virtualAudioGraph;
				})
				.merge(join)
				.each(function({ model }) {
					const { currentTime } = this;
					console.log('up')
					const graph = {
						0: ['gain', 'output', {gain: 0.2}],
					  3: ['panner', 0, {
					  	panningModel: 'HRTF',
					  	coneInnerAngle: 0.01*180/Math.PI,
					  	coneOuterAngle: 1*180/Math.PI,
					  	coneOuterGain: 0.03
					  	// position: 
					  }],
					  4: ['bufferSource', 0, {
					  	buffer: model[0].buffer,
					  	loop: true,
					  	startTime: currentTime + 1
					  }]
					};
					this.update(graph);
				});
		}
		// 	const join = d3
		// 		.select(selectable)
		// 		.selectAll()
		// 		.data(model, ({ cone: { key, parent } }) => `${parent.key}-${key}`);
		// };
		// const { context, destination } = contextObj;
		// return function(selectable) {
		// 	const join = d3
		// 		.select(selectable)
		// 		.selectAll()
		// 		.data(model, d => d.key);
				
		// 	const buffer_sources = join
		// 		.enter()
		// 		.append(function(d) {
		// 			debug('buffer:create')(d);
		// 			const source = context.createBufferSource();
		// 			const panner = context.createPanner();
		// 			const volume = context.createGain();
					
		// 			source.loop = true;
		// 			source.buffer = d.buffer;
		// 			source.start(context.currentTime + 0.020);
					
		// 			panner.panningModel = 'HRTF';
		// 			panner.coneInnerAngle = 0.01*180/Math.PI;
		// 			panner.coneOuterAngle = 1*180/Math.PI;
		// 			panner.coneOuterGain = 0.03;
		// 			panner._position = {};
		// 			panner._orientation = {};
		// 			panner._lookAt = {}
					
		// 			source.connect(volume);
		// 			volume.connect(panner);
		// 			panner.connect(destination);
					
		// 			return {
		// 				cone_id: d.cone.id,
		// 				source,
		// 				panner,
		// 				volume,
		// 				key: d.key
		// 			};
		// 		})
		// 		.merge(join)
		// 		.each(function({ cone }) {
		// 			/** Set position */
		// 			const p = cone.parent.position;
		// 			// var _pos;
		// 			// cone.parent.trajectories = cone.parent.trajectories || [];
		// 			// // if (cone.parent.trajectories.length > 0) {
		// 			const traj = cone.parent.trajectories[0];
		// 			const vectors = traj.points.map(v => (new THREE.Vector3()).copy(v));
		// 			const curve = new THREE[traj.splineType](vectors);
		// 			curve.closed = true;
		// 			const trajectoryOffset = curve.getPoint(cone.t);
		// 			// console.log(trajectoryOffset, p);
		// 			var p2 = (new THREE.Vector3()).addVectors(p, trajectoryOffset);
		// 				// if (! _.isMatch(this.position, trajectoryOffset)) {
		// 				// 	debug('sound object')('set trajectory position', trajectoryOffset);
		// 				// 	this.position.copy(trajectoryOffset);
		// 				// }
		// 			// }
		// 			// console.log(p, cone.t);
		// 			if (! _.isMatch(this.panner._position, p2)) {
		// 				this.panner.setPosition(p2.x, p2.y, p2.z);
		// 				this.panner._position = p2;
		// 			}
		// 			if (! _.isMatch(this.panner._lookAt, cone.lookAt)) {
		// 				this.panner._lookAt = cone.lookAt;
		// 				const vec = new THREE.Vector3();
		// 				vec.copy(cone.lookAt);
		// 				vec.normalize();
		// 				this.panner.setOrientation(vec.x, vec.y, vec.z);
		// 			}
		// 		});
				
		// 	return selectable;
		// };
	}
		
	// const data$ = audioBuffer$
	// 	.flatMap(({ cone, context }) => {
	// 		debugger
	// 		const ctx = context.context;
	// 		const buffer = file.data;
	// 		return stream.create(observer => {
	// 			ctx.decodeAudioData(buffer, function(data) {
	// 				observer.onNext(data);
	// 			})
	// 		})
	// 		// return stream.fromPromise(ctx.decodeAudioData(buffer))
	// 		// return stream.fromCallback(ctx.decodeAudioData)(buffer)
	// 		.map(buffer => ({
	// 			name: file.name,
	// 			buffer
	// 		}));
	// 	})
	// 	.subscribe(log);
	
	// const contexts_state_reducer$ = heads$
	// 	.map(context_state_reducer);
		
	const scenes_model$ = main_scene_model$
		.map(s => [s]);
	
	const main_canvases$ = renderers
  	.select({ name: 'main' })
  	.first()
  	.pluck('renderer', 'domElement')
  	.map(d => [d]);
  	
  const main_dom_model$ = combineLatestObj
  	({
  		main_size$,
  		canvases: main_canvases$.startWith([])
  	})
  	.map(({ main_size, canvases }) => ({
  		mains: [
  			{
  				styles: {
  					height: `${main_size.height}px`,
  					width: `${main_size.width}px`
  				},
  				canvases
  			}
  		]
  	}));
  	
  const renderers_model$ = combineLatestObj
		({
			main_size$
		})
		.map(({ main_size, editor_size }) => {
			return [
				{
					name: 'main',
					size: main_size
				}
			];
		});
		
	const render_sets$ = stream
		.of([
			{
				render_id: 'main',
				scene_id: 'main',
				camera_id: 'main'
			}
		]);
		
	const render_function$ = renderFunction({
		renderers,
		scenes,
		cameras,
		render_sets$
	});
	
	// const audio_graphs_reducer$ = audioContexts
	// 	.select({ id: 'main' })
	// 	.pluck('context')
	// 	.first()
	// 	.map(c => [c])
	// 	.map(model => selectable => {
	// 		const join = d3
	// 			.select(selectable)
	// 			.selectAll()
	// 			.data(model);
				
	// 		const graphs = join
	// 			.enter()
	// 			.append(audioContext => {
	// 				const virtualAudioGraph = createVirtualAudioGraph({
	// 				  audioContext,
	// 				  output: audioContext.destination,
	// 				});
	// 				return virtualAudioGraph;
	// 			})
	// 			.merge(join);
			
	// 		return selectable;
	// 	});
		
	const dom_state_reducer$ = DOM.view(main_dom_model$);
	const renderers_state_reducer$ = Renderer.view(renderers_model$);
	const cameras_state_reducer$ = Camera.view(cameras_model$);
	const scenes_state_reducer$ = Scene.view(scenes_model$);
	
	return {
		dom: dom_state_reducer$,
		renderers: renderers_state_reducer$,
		cameras: cameras_state_reducer$,
		scenes: scenes_state_reducer$,
		render: render_function$,
		// audioContexts: contexts_state_reducer$,
		// audioGraphs: audio_graphs_reducer$
	};
}

Cycle.run(main, {
	dom: makeD3DomDriver('#app'),
	renderers: makeStateDriver('renderers'),
	cameras: makeStateDriver('cameras'),
	scenes: makeStateDriver('scenes'),
	render: (source$) => source$.subscribe(fn => fn()),
	windowSize: () => stream.fromEvent(window, 'resize'),
	headObject: makeHeadObjectDriver(),
	audioContexts: makeStateDriver('audioContexts'),
	audioGraphs: makeStateDriver('audioGraphs') 
});

function context_state_reducer(model) {
	const AudioContext = window.AudioContext || window.webkitAudioContext;
	return function(selectable) {
		const join = d3
			.select(selectable)
			.selectAll()
			.data(model);
		const contexts = join
			.enter()
			.append(function({ id }) {
				const context = new AudioContext();
				const { destination, listener } = context;
				return {
					id,
					context,
					destination,
					listener
				};
			})
			.merge(join)
			.each(function(d) {
				const { destination, listener } = this;
				/** Set orientation and position */
				const vec = new THREE.Vector3();
				vec.copy(d.lookAt);
				vec.normalize();
				listener.setOrientation(vec.x, vec.y, vec.z, 0, 1, 0);
				const p = d.position;
				listener.setPosition(p.x, p.y, p.z);
			});
			
		return selectable;
	}
}

function mainSize(windowSize$) {
	return windowSize$
		.pluck('target')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth,
      height: element.innerHeight
		}));
}

function makeHeadObjectDriver() {
	return function headObjectDriver() {
		OBJLoader(THREE);
		const loader = new THREE.OBJLoader();
		return stream.create(observer => {
			loader.load('assets/head.obj', d => { observer.onNext(d) });
		});
	};
}

function polarToVector({ radius, theta, phi }) {
	return {
		x: radius * Math.sin(phi) * Math.sin(theta),
		z: radius * Math.cos(phi) * Math.sin(theta),
		y: radius * Math.cos(theta)
	};
}

function renderFunction({ renderers, scenes, cameras, render_sets$ }) {
	return render_sets$
		.flatMap(arr => stream.from(arr))
		.flatMap(({ render_id, scene_id, camera_id }) => { 
			return combineLatestObj({
				renderer: renderers.select({ name: render_id }).pluck('renderer'),
				scene: scenes.select({ name: scene_id }).pluck('scene'),
				_camera: cameras.select({ name: camera_id }).pluck('camera')
			});
		})
		.map(({ renderer, scene, _camera }) => () => {
			renderer.render(scene, _camera)
		});
}