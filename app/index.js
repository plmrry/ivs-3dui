/* jshint esversion: 6 */

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

function main() {
	const windowSize = stream.fromEvent(window, 'resize');
	const main_size$ = mainSize(windowSize);
	const editorSize$ = stream.just({
  		width: 300,
  		height: 300
  	});
	const renderers = _Renderers({ main_size$, editor_size$: editorSize$ });
	const cameras = _Cameras({ main_size$ });
	const add$ = fakeAdd();
	const eventSubject = new Rx.ReplaySubject(1);
	const action$ = stream.merge( add$, eventSubject );
	const add_object$ = addObject({ action$, eventSubject });
	const tweenObjectVolume$ = tweenObjectVolume({ action$ });
	const deleteObject$ = deleteObject({ action$ });

	const objectAction$ = stream
		.merge(
			add_object$,
			tweenObjectVolume$,
			deleteObject$
		);

	const objectsModel$ = objectAction$
		.startWith({ sound_objects: [], max_id: 0, soundObjects: d3.map() })
		.scan(apply)
		.shareReplay(1);

	const sound_objects$ = objectsModel$.pluck('sound_objects');

	const selected$ = objectsModel$
	  .pluck('selected')
	  .distinctUntilChanged();

	const editorDom$ = editorDom({ selected$, renderers });

	const main_canvases$ = renderers
		.select({ name: 'main' })
  	.first()
  	.pluck('renderer', 'domElement')
  	.map(d => [d]);

	const main_dom_model$ = combineLatestObj
  	({
  		main_size$,
  		canvases: main_canvases$.startWith([]),
			editorDom$: editorDom$.startWith([])
  	})
  	.map(({ main_size, canvases, editorDom }) => ({
  		mains: [
  			{
  				styles: {
  					height: `${main_size.height}px`,
  					width: `${main_size.width}px`
  				},
  				canvases
  			}
  		],
			editorCards: editorDom
  	}));

	const dom_state_reducer$ = DOM.view(main_dom_model$);

	// const dom_state_reducer$ = _DOM({ main_size$, renderers });

	const headObject$ = getHeadObject();
	const heads$ = heads({ headObject$ });
	const main_scene_model$ = main_scene_model({ heads$, sound_objects$ });
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

	const mainScene$ = stream
		.just(getMainScene());

	function getMainScene() {
		const room_size = {
			width: 20,
			length: 18,
			height: 3
		};
		const scene = new THREE.Scene();
		scene.add(getSpotlight());
		scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
		scene.add(getFloor(room_size));
		return scene;
	}

	function getSpotlight() {
		var spotLight = new THREE.SpotLight(0xffffff, 0.95);
		spotLight.position.setY(100);
		spotLight.castShadow = true;
		spotLight.shadow.mapSize.width = 4000;
		spotLight.shadow.mapSize.height = 4000;
		spotLight.intensity = 1;
		spotLight.exponent = 1;
		return spotLight;
	}

	combineLatestObj({
		renderer: renderers.select({ name: 'main' }).pluck('renderer'),
		// scene: scenes.select({ name: 'main' }).pluck('scene'),
		scene: mainScene$,
		camera: cameras.select({ name: 'main' }).pluck('camera')
	})
	.map(({ renderer, scene, camera }) => () => {
		renderer.render(scene, camera);
	})
	.subscribe(fn => fn());

	const updateCameraSize$ = editorSize$
		.map(s => camera => {
			[ camera.left, camera.right ] = [-1,+1].map(d => d * s.width * 0.5);
			[ camera.bottom, camera.top ] = [-1,+1].map(d => d * s.height * 0.5);
			camera.updateProjectionMatrix();
			return camera;
		});
	const updateCameraPosition$ = stream
		.just(new THREE.Vector3(0,0,10))
		.map(position => camera => {
			camera.position.copy(position);
			return camera;
		});
	const updateCameraZoom$ = stream
		.just(50)
		.map(zoom => camera => {
			camera.zoom = zoom;
			camera.updateProjectionMatrix();
			return camera;
		});
	const cameraUpdate$ = stream
		.merge(
			updateCameraSize$,
			updateCameraPosition$,
			updateCameraZoom$
		);
	const editorCamera$ = cameraUpdate$
		.startWith(new THREE.OrthographicCamera())
		.scan(apply);

	// editorCamera$.subscribe(log);

	const editor_sound_objects_model$ = selected$
		.distinctUntilChanged()
		.map(obj => {
			if (typeof obj !== 'undefined') {
				const position = new THREE.Vector3();
				const trajectories = [];
				return [Object.assign({}, obj, { position, trajectories })];
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

	stream
		.just({
			size: {
				width: 300,
	  		height: 300
			},
			position: {
				x: 0, y: 0, z: 10
			},
			zoom: 50
		});

	// const audio_graph_model$ = _Audio({ main_scene_model$, heads$ });

	// render_function$.subscribe(fn => fn());

  makeD3DomDriver('#app')(dom_state_reducer$);

	return;
}

function editorCamera() {
	let camera = new THREE.OrthographicCamera();
	[ this.left, this.right ] = [-1,+1].map(d => d * s.width * 0.5);
	[ this.bottom, this.top ] = [-1,+1].map(d => d * s.height * 0.5);
	this.updateProjectionMatrix();
}

main();

function editorDom({ selected$, renderers }) {
	/** FIXME: Could be a lot cleaner */
	return selected$
		.withLatestFrom(
			renderers.select({ name: 'editor' }).pluck('renderer'),
			(s, r) => ({ selected: s, renderer: r })
		)
		.map(({ selected, renderer }) => {
			const size = renderer.getSize();
			if (typeof selected === 'undefined') return [];
			const selected_cones = selected.cones || [];
			const selected_cone = selected_cones.filter(d => d.selected)[0];
			const object_renderer_card = {
					canvases: [ { node: renderer.domElement } ],
					style: {
						position: 'relative',
						height: `${size.height}px`
					},
					buttons: [
						{
							id: 'add-cone',
							text: 'add cone',
							style: {
								position: 'absolute',
								right: 0,
								bottom: 0
							}
						}
					]
				};
			const cone_info_card_block = typeof selected_cone !== 'undefined' ?
				{
					id: 'cone-card',
					header: `Cone ${selected.key}.${selected_cone.key}`
				}
				: undefined;
			const object_info_card_block = selected.type === 'sound_object' ?
				{
					id: 'object-card',
					header: `Object ${selected.key}`,
					rows: getObjectInfoRows(selected)
				} : undefined;
			const info_card = {
				card_blocks: [
					object_info_card_block,
					cone_info_card_block
				].filter(d => typeof d !== 'undefined')
			};
			const cards = [
				selected.type === 'sound_object' ? object_renderer_card : undefined,
				info_card
			].filter(d => typeof d !== 'undefined');
			// return [{ cards, size }];
			return cards;
		});
}

function getObjectInfoRows(object) {
	return [
		{
			columns: [
				{
					width: '6',
					class: 'col-xs-6',
					span_class: 'value delete-object',
					span_style: {
						cursor: 'pointer'
					},
					text: 'Delete',
					id: 'delete-object'
				}
			]
		}
	];
}

function fakeAdd() {
  return stream
		.timer(500)
		.map(() => ({
			type: 'add-object',
			position: new THREE.Vector3(1, 1, 1)
		}));
}

function deleteObject({ action$ }) {
  return action$
		.filter(({ type }) => type === 'delete-object')
		.do(log)
		.map(({ key }) => state => {
			const predicate = d => d.key === key;
			const index = _.findIndex(state.sound_objects, predicate);
			state.sound_objects.splice(index, 1);
			return state;
		});
}

function addObject({ action$, eventSubject }) {
	return action$
		.filter(({ type }) => type === 'add-object')
		.map(({ position }) => state => {
			state.max_id = d3.max(state.sound_objects, d => d.key) || 0;
			const newObjectKey = state.max_id + 1;
			const new_object = {
				type: 'sound_object',
				key: newObjectKey,
				position,
				splineType: 'CatmullRomCurve3',
				volume: 0.1,
				t: 0.2,
				moving: true,
				cones: [],
				selected: true,
			};
			state.soundObjects.set(newObjectKey, new_object);
			state.sound_objects = state.sound_objects.concat(new_object);
			state.lastAdded = new_object;
			const tweenEvent = {
				type: 'tween-object-volume',
				key: state.lastAdded.key,
				destination: 1
			};
			eventSubject.onNext(tweenEvent);
			const selectEvent = {
				type: 'select-object',
				key: state.lastAdded.key
			};
			eventSubject.onNext(selectEvent);
			state.selected = new_object;
			return state;
		});
}

function tweenObjectVolume({ action$ }) {
	return action$
		.filter(({ type }) => type === 'tween-object-volume')
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
}

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

function main_scene_model({ heads$, sound_objects$ }) {
	return combineLatestObj
		({
			sound_objects$: sound_objects$.startWith([]),
			heads$: heads$.startWith(Array(0))
		})
		.map(({ sound_objects, heads }) => ({
			name: 'main',
			floors: Array(1),
			sound_objects,
			heads
		}));
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
				console.log('up');
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
	};
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
	};
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
			loader.load('assets/head.obj', d => observer.onNext(d));
		});
	};
}

function getHeadObject() {
	OBJLoader(THREE);
	const loader = new THREE.OBJLoader();
	return stream.create(observer => {
		loader.load('assets/head.obj', d => observer.onNext(d));
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
			renderer.render(scene, _camera);
		});
}

function _Renderers({ main_size$, editor_size$ }) {
	/** FIXME: add and remove renderers? */
	const renderers_model$ = combineLatestObj
		({
			main_size$,
			editor_size$
		})
		.map(({ main_size, editor_size }) => {
			return [
				{
					name: 'main',
					size: main_size
				},
				{
					name: 'editor',
					size: editor_size
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

function getFloor(room_size) {
	var FLOOR_SIZE = 100;
	var floorGeom = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
	var c = 0.46;
	var floorMat = new THREE.MeshPhongMaterial({
		color: new THREE.Color(c, c, c),
		side: THREE.DoubleSide,
		depthWrite: false
	});
	var e = 0.5;
	floorMat.emissive = new THREE.Color(e, e, e);
	var floor = new THREE.Mesh(floorGeom, floorMat);
	floor.name = 'floor';
	floor.rotateX(Math.PI / 2);
	floor.position.setY(-room_size.height / 2);
	var grid = new THREE.GridHelper(FLOOR_SIZE / 2, 2);
	grid.rotateX(Math.PI / 2);
	grid.material.transparent = true;
	grid.material.opacity = 0.2;
	grid.material.linewidth = 2;
	grid.material.depthWrite = false;
	floor.add(grid);
	floor.receiveShadow = true;
	return floor;
}
