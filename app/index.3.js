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

function main(sources) {
	const add$ = stream
		.timer(500)
		.map(() => ({
			type: 'add-object',
			position: new THREE.Vector3(1, 1, 1)
		}));
		
	const action$ = stream
		.merge(
			add$
		);

	const headObject$ = getHeadObject();
	const windowSize = stream.fromEvent(window, 'resize');
	const main_size$ = mainSize(windowSize);
	const renderers = _Renderers({ main_size$ });
	const cameras = _Cameras({ main_size$ });
	const heads$ = heads({ headObject$ });
	
	const main_scene_model$ = main_scene_model({ heads$, action$ });
	const scenes = _Scenes({ main_scene_model$ });
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
	const dom_state_reducer$ = _DOM({ main_size$, renderers });
	const audio_graph_model$ = _Audio({ main_scene_model$, heads$ });
	return {
		dom: dom_state_reducer$,
		render: render_function$,
		// audioGraph: audio_graph_model$
	};
}

Cycle.run(main, {
	dom: makeD3DomDriver('#app'),
	audioGraph: source$ => source$.subscribe(),
	render: source$ => source$.subscribe(fn => fn())
});

function heads({ headObject$ }) {
	const heads$ = headObject$
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
	return heads$;
}

function main_scene_model({ heads$, action$ }) {
	// const first_trajectory_points = [
	// 	[+0,+0,+0], 
	// 	[+2,+1,-2], 
	// 	[+5,-1,-2], 
	// 	// [+8,+2,+3]
	// ].map(([x,y,z]) => new THREE.Vector3(x, y, z));
	
	// const first_cone = {
	// 	key: 17,
	// 	lookAt: {
	// 		x: 0.57,
	// 		y: -0.1,
	// 		z: 0.34
	// 	},
	// 	spread: 0.5,
	// 	volume: 1,
	// 	file: 'wetShort.wav',
	// 	playing: true
	// };
		
	// const first_object = {
	// 	key: 5,
	// 	position: {
	// 		x: -5,
	// 		y: 1.5,
	// 		z: 1.8
	// 	},
	// 	points: first_trajectory_points,
	// 	splineType: 'CatmullRomCurve3',
	// 	material: {
	// 		color: 'ffffff'
	// 	},
	// 	volume: 1,
	// 	t: 0.2,
	// 	moving: true,
	// 	cones: [ first_cone ]
	// };
	
	// first_cone.parent = first_object;
		
	// const animation$ = stream
	// 	.create(observer => {
	// 		d3.timer(() => observer.onNext())
	// 	})
	// 	.timestamp()
	// 	.pluck('timestamp')
	// 	.map(time => time / 1e3);
	
	const sound_objects$ = new Rx.ReplaySubject(1);
	
	const tweenVolumeSubject = new Rx.ReplaySubject(1);
	
	const tweenObjectVolume$ = tweenVolumeSubject
		.flatMap(({ destination, key }) => {
			return d3TweenStream(100)
				.scan((last, t) => ({ t: t, dt: t - last.t }), { t: 0, dt: 0 })
				.map(({ t, dt }) => state => {
					const object = state.soundObjects.get(key);
					const { volume } = object;
					const current = volume;
					let speed = (1-t) === 0 ? 0 : (destination - current)/(1 - t);
          let step = current + dt * speed;
          let next = t === 1 || step > destination ? destination : step;
          object.volume = next;
					return state;
				});
		});
	
	const addingEvents$ = action$
		.filter(({ type }) => type === 'add-object')
		.flatMap(({ position }) => {
			return stream.from([
				{ type: 'insert-object', position },
				{ type: 'select-last-added' },
				{ type: 'tween-last-added' }
			]);
		});
		
	const tweenLast$ = addingEvents$
		.filter(({ type }) => type === 'tween-last-added')
		.map(() => state => {
			const event = {
				type: 'tween-object-volume',
				key: state.lastAdded.key,
				destination: 1
			};
			tweenVolumeSubject.onNext(event);
			return state;
		});
	
	const add_object$ = addingEvents$
		.filter(({ type }) => type === 'insert-object')
		.map(({ position }) => state => {
			state.max_id = d3.max(state.sound_objects, d => d.key) || 0;
			const newObjectKey = state.max_id + 1;
			const new_object = {
				key: newObjectKey,
				position,
				splineType: 'CatmullRomCurve3',
				material: {
					color: 'ffffff'
				},
				volume: 0.1,
				t: 0.2,
				moving: true,
				cones: []
			};
			state.soundObjects.set(newObjectKey, new_object);
			state.sound_objects = state.sound_objects.concat(new_object);
			state.lastAdded = new_object;
			return state;
		});
		
	const delete_object$ = action$
		.filter(({ type }) => type === 'delete-object')
		.do(log)
		.map(({ key }) => state => {
			const predicate = d => d.key === key;
			const index = _.findIndex(state.sound_objects, predicate);
			state.sound_objects.splice(index, 1);
			return state;
		});
		
	const objectAction$ = stream
		.merge(
			add_object$,
			tweenLast$,
			tweenObjectVolume$,
			delete_object$
		);
		// .map(stateReducer => state => stream.just(stateReducer));
	
	// sound_objects$
	// 	.subscribe(d => console.log('fah'))
	
	objectAction$
		.startWith({ sound_objects: [], max_id: 0, soundObjects: d3.map() })
		.scan(apply)
		.pluck('sound_objects')
		.subscribe(sound_objects$);
		
	const main_scene_model$ = combineLatestObj
		({
			sound_objects$: sound_objects$.startWith([]),
			heads$: heads$.startWith(Array(0))
		})
		.map(({ sound_objects, heads }) => ({
			name: 'main',
			floors: Array(1),
			sound_objects,
			heads
		}))
		.shareReplay(1);
		
	return main_scene_model$;
}

function d3TweenStream(duration, name) {
  return stream.create(function(observer) {
    return d3.transition()
      .duration(duration)
      .ease(d3.easeLinear)
      .tween(name, function() {
        return function(t) {
          return observer.onNext(t);
        };
      })
      .on("end", function() {
        return observer.onCompleted();
      });
  });
}

function _Scenes({ main_scene_model$ }) {
	const scenes_model$ = main_scene_model$
		.map(s => [s]);
	const scenes_state_reducer$ = Scene.view(scenes_model$);
	const scenes$ = scenes_state_reducer$
		.scan(apply, new Selectable())
		.let(makeSelectable);
	return scenes$;
}

function _Audio({ main_scene_model$, heads$ }) {
	const cone$ = main_scene_model$
		.pluck('sound_objects')
		.filter(d => d.length > 0)
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
		.shareReplay(1);
		
	const audio_graph_model$ = all_objects$
		.pluck('cones')
		.filter(d => d.length > 0)
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
		.scan(apply, new Selectable());
		
	return audio_graph_model$;
}

function _DOM({ main_size$, renderers }) {
	
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
  	
	const dom_state_reducer$ = DOM.view(main_dom_model$);
	
	return dom_state_reducer$;
}

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
}

function makeSelectable(observable$) {
	return {
		observable: observable$,
		select: function(selector) {
		  const selection$ = observable$
		    .map(selectable => selectable.querySelector(selector))
		    .filter(d => typeof d !== 'undefined');
		  return selection$;
		}
	};
}

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

function getHeadObject() {
	OBJLoader(THREE);
	const loader = new THREE.OBJLoader();
	return stream.create(observer => {
		loader.load('assets/head.obj', d => { observer.onNext(d) });
	});
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
				renderer: renderers.select({ name: 'main' }).pluck('renderer'),
				scene: scenes.select({ name: scene_id }).pluck('scene'),
				_camera: cameras.select({ name: camera_id }).pluck('camera')
			});
		})
		.map(({ renderer, scene, _camera }) => () => {
			renderer.render(scene, _camera)
		});
}

function _Renderers({ main_size$ }) {
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
	const renderers_state_reducer$ = Renderer.view(renderers_model$);
	const renderers = renderers_state_reducer$
		.scan(apply, new Selectable())
		.let(makeSelectable);
	return renderers;
}

function _Cameras({ main_size$ }) {
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
	const cameras_state_reducer$ = Camera.view(cameras_model$);
	const cameras$ = cameras_state_reducer$
		.scan(apply, new Selectable())
		.let(makeSelectable);
	return cameras$;
}