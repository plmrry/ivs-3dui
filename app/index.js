import Cycle from '@cycle/core';
import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';
import d3 from 'd3';
import THREE from 'three/three.js';

import OBJLoader from './OBJLoader.js';
import makeD3DomDriver from './d3DomDriver.js';
import makeStateDriver from './stateDriver.js';

import * as DOM from './dom.js';
import * as Renderer from './renderer.js';
import * as Camera from './camera.js';
import * as Scene from './scene.js';

import log from './utilities/log.js';

Rx.config.longStackSupport = true;
debug.enable('*,-driver:*');

function main({ renderers, scenes, cameras, windowSize, headObject }) {
	
	// headObject.subscribe(log);
	
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
		
	const first_object = {
		position: {
			x: -5,
			y: 1.5,
			z: 1.8
		},
		trajectory: {
			points: [
				[+0,+0,+0], 
				[+2,+1,-2], 
				[+5,-1,-2], 
				[+8,+2,+3], 
				[+3,-1,+6]
			].map(([x,y,z]) => ({x,y,z})),
			splineType: 'CatmullRomCurve3'
		}
	};
		
	// const first = {
	// 	key: 0,
	// 	material: {
	// 		color: 'ffffff'
	// 	},
	// 	name: 'sound_object',
	// 	position: {
	// 		x: -5,
	// 		y: 1.5,
	// 		z: 1.8
	// 	},
	// 	selected: true,
	// 	volume: 1,
	// 	t: 0
	// };
	
	// first.trajectories = [
	// 	{
	// 		points: [
	// 			[+0,+0,+0], 
	// 			[+2,+1,-2], 
	// 			[+5,-1,-2], 
	// 			[+8,+2,+3], 
	// 			[+3,-1,+6]
	// 		].map(([x,y,z]) => ({x,y,z})),
	// 		splineType: 'CatmullRomCurve3',
	// 		parent: first
	// 	}
	// ];
	
	// const first_objects = [
	// 	{
	// 		points: [
	// 			[+0,+0,+0], 
	// 			[+2,+1,-2], 
	// 			[+5,-1,-2], 
	// 			[+8,+2,+3], 
	// 			[+3,-1,+6]
	// 		].map(([x,y,z]) => ({x,y,z})),
	// 		splineType: 'CatmullRomCurve3'
	// 	}
	// ];
	
	// first.cones = [
	// 	{
	// 		parent: first,
	// 		id: `${first.key}-0`,
	// 		interactive: false,
	// 		key: 0,
	// 		lookAt: {
	// 			x: 0.57,
	// 			y: -0.1,
	// 			z: 0.34
	// 		},
	// 		selected: true,
	// 		spread: 0.5,
	// 		volume: 2,
	// 		name: 'cone',
	// 		file: 'wetShort.wav',
	// 		playing: true
	// 	}
	// ];
	
	const heads$ = headObject
		.map(head => ({
			name: 'head',
			position: {
				x: -1,
				y: 1,
				z: 2
			},
			lookAt: {
				x: 3,
				y: 2,
				z: 1
			},
			object: head
		}))
		.map(h => [h]);
		
	const sound_objects$ = stream
		.just([
			first_object
		]);
		
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
	
	// const heads$ = stream
	// 	.just([ { name: 'main' }]);
		
	// const main_scene_model$ = stream
	// 	.just({
	// 		name: 'main',
	// 		floors: Array(1),
	// 		sound_objects: [first_object],
	// 		heads: [ { name: 'main' } ]
	// 	});
		
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
				},
				// {
				//   name: 'orbit',
				//   size: {
				//     height: 100,
				//     width: 100
				//   }
				// }
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
		
	const dom_state_reducer$ = DOM.view(main_dom_model$);
	const renderers_state_reducer$ = Renderer.view(renderers_model$);
	const cameras_state_reducer$ = Camera.view(cameras_model$);
	const scenes_state_reducer$ = Scene.view(scenes_model$);
	
	return {
		dom: dom_state_reducer$,
		renderers: renderers_state_reducer$,
		cameras: cameras_state_reducer$,
		scenes: scenes_state_reducer$,
		render: render_function$
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

Cycle.run(main, {
	dom: makeD3DomDriver('#app'),
	renderers: makeStateDriver('renderers'),
	cameras: makeStateDriver('cameras'),
	scenes: makeStateDriver('scenes'),
	render: (source$) => source$.subscribe(fn => fn()),
	windowSize: () => stream.fromEvent(window, 'resize'),
	headObject: makeHeadObjectDriver()
});

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