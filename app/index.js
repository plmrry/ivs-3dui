/* jshint esversion: 6 */
/* jshint unused: true */
/* jshint undef: true */
/* global window, console, document */

import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';
import selection from 'd3-selection';
import 'd3-selection-multi';
import d3 from 'd3';
Object.assign(d3, selection);
import THREE from 'three/three.js';
// import createVirtualAudioGraph from 'virtual-audio-graph';
import _ from 'underscore';

// import OBJLoader from './OBJLoader.js';
// import makeD3DomDriver from './d3DomDriver.js';
// import makeStateDriver from './stateDriver.js';

// import * as DOM from './dom.js';
// import * as Renderer from './renderer.js';
// import * as Camera from './camera.js';
// import * as Scene from './scene.js';

import log from './utilities/log.js';
import apply from './utilities/apply.js';
// import Selectable from './utilities/selectable.js';

debug.enable('*');

Rx.config.longStackSupport = true;

main();

function main() {
	const windowSize$ = windowSize();

	const key$ = stream
		.fromEvent(document, 'keydown')
		.pluck('code')
		.map(code => code.replace('Key', ''));

	const actionSubject = new Rx.ReplaySubject(1);

	const action$ = stream
		.merge(
			actionSubject
		);

	const addObjectAction$ = action$
		.filter(action => action.type === 'add-object')
		.map(({ object: { key, position } }) => scene => {
			const geometry = new THREE.SphereGeometry(0.1, 30, 30);
			const material = new THREE.MeshPhongMaterial({
				color: new THREE.Color(0, 0, 0),
				transparent: true,
				opacity: 0.3,
				side: THREE.DoubleSide
			});
			const newObject = new THREE.Mesh(geometry, material);
			newObject.castShadow = true;
			newObject.receiveShadow = true;
			newObject.name = `object-${key}`;
			// newObject.renderOrder = 10;
			const parent = new THREE.Object3D();
			parent.name = `object-parent-${key}`;
			parent.position.copy(position);
			parent.add(newObject);
			scene.add(parent);
			return scene;
		});

	const requestObjectAction$ = key$
		.filter(code => code === 'O')
		.map(() => new THREE.Vector3(
			Math.random() * 10 - 5,
			1.5,
			Math.random() * 10 - 5
		))
		.map(position => model => {
			const { objects } = model;
			model.maxId = d3.max(objects.values(), d => d.key) || 0;
			const key = model.maxId + 1;
			const newObject = {
				position,
				key
			};
			actionSubject.onNext({
				type: 'add-object',
				object: newObject
			});
			// actionSubject.onNext({
			// 	type: 'move-object',
			// 	position,
			// 	name: `object-${key}`
			// });
			model.objects.set(key, newObject);
			model.selected = newObject;
			return model;
		});

	const modelUpdate$ = stream
		.merge(
			requestObjectAction$
		);

	const model$ = stream
		.just({ objects: d3.map() })
		.concat(modelUpdate$)
		.scan(apply)
		.subscribe(log);

	// const insertObject$ = addObjectAction$
	// 	.map()
		// .subscribe(log);

	const updateRendererSize$ = windowSize$
		.map(size => renderer => {
			const currentSize = renderer.getSize();
			const diff = _.difference(_.values(currentSize), _.values(size));
			if (diff.length > 0) {
				debug('reducer:renderer')('update size');
				renderer.setSize(size.width, size.height);
			}
			return renderer;
		});

	const rendererUpdate$ = stream
		.merge(
			updateRendererSize$
		);

	const mainRenderer$ = stream
		.just(getFirstRenderer())
		.concat(rendererUpdate$)
		.scan(apply);

	const setMainCanvas$ = mainRenderer$
		.first()
		.pluck('domElement')
		.map(canvas => dom => {
			dom
				.select('main')
				.append(() => canvas);
			return dom;
		});

	const addLights$ = stream
		.just(scene => {
			scene.add(getSpotlight());
			scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
			return scene;
		});

	const addFloor$ = stream
		.just(scene => {
			const room_size = {
				width: 20,
				length: 18,
				height: 3
			};
			scene.add(getFloor(room_size));
			return scene;
		});

	const sceneUpdate$ = stream
		.merge(
			addLights$,
			addFloor$,
			addObjectAction$
		);

	const mainScene$ = stream
		.just(getMainScene())
		.concat(sceneUpdate$)
		.scan(apply);

	function getMainScene() {
		const scene = new THREE.Scene();
		return scene;
	}

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
		.map(function polarToVector({ radius, theta, phi }) {
			return {
				x: radius * Math.sin(phi) * Math.sin(theta),
				z: radius * Math.cos(phi) * Math.sin(theta),
				y: radius * Math.cos(theta)
			};
		})
		.scan((vector, position) => vector.copy(position), new THREE.Vector3());
	const lookAt$ = stream
		.just(new THREE.Vector3())
		.shareReplay(1);
	const position$ = stream
		.combineLatest(
			relative_position$,
			lookAt$,
			(rel, look) => rel.add(look)
		);
	const updateLookAt$ = lookAt$
		.map(lookAt => camera => {
			if (! _.isMatch(camera._lookAt, lookAt)) {
				debug('reducer:camera')('update lookAt', lookAt);
				camera._lookAt = lookAt;
				camera.lookAt(lookAt || new THREE.Vector3());
				// camera.updateProjectionMatrix();
			}
			return camera;
		});
	const updatePosition$ = position$
		.map(position => camera => {
			if (! _.isMatch(camera.position, position)) {
				debug('reducer:camera')('update position', position);
				camera.position.copy(position);
			}
			return camera;
		});
	const updateSize$ = windowSize$
		.map(s => camera => {
			debug('reducer:camera')('update size', s);
			[ camera.left, camera.right ] = [-1,+1].map(d => d * s.width * 0.5);
			[ camera.bottom, camera.top ] = [-1,+1].map(d => d * s.height * 0.5);
			camera.updateProjectionMatrix();
			return camera;
		});
	const updateZoom$ = stream
		.just(50)
		.map(zoom => camera => {
			camera.zoom = zoom;
			camera.updateProjectionMatrix();
			return camera;
		});
	const mainCameraUpdate$ = stream
		.merge(
			updateSize$,
			updatePosition$,
			updateLookAt$,
			updateZoom$
		);
	const mainCamera$ = stream
		.just(new THREE.OrthographicCamera())
		.concat(mainCameraUpdate$)
		.scan(apply);

	combineLatestObj({
			renderer: mainRenderer$,
			scene: mainScene$,
			camera: mainCamera$
		})
		.map(({ renderer, scene, camera }) => () => {
			renderer.render(scene, camera);
		})
		.subscribe(fn => fn());

	const domUpdate$ = stream
		.merge(
			setMainCanvas$
		);

	const dom$ = stream
		.just(getFirstDom())
		.concat(domUpdate$)
		.scan(apply)
		.subscribe();
}

function windowSize() {
	return stream.fromEvent(window, 'resize')
		.pluck('target')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth,
			height: element.innerHeight
		}));
}

/**
 * SCENE
 *
 *
 *
 */

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

function getCube() {
	var geometry = new THREE.BoxGeometry( 10, 10, 10 );
	var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
	var cube = new THREE.Mesh( geometry, material );
	return cube;
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

/**
 * RENDERER
 *
 *
 *
 */

function getFirstRenderer() {
	const renderer = new THREE.WebGLRenderer({
		antialias: true
	});
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.setClearColor(0xf0f0f0);
	return renderer;
}

/**
 * DOM
 *
 *
 *
 */

function getFirstDom() {
	const dom = d3.select('#app');
	const main = dom.append('main');
	const controls_join = main
		.selectAll('.controls')
		.data(getControlsData());
	const controls_enter = controls_join
		.enter()
		.append('div')
		.attr('class', d => d.class)
		.classed('controls', true)
		.attr('id', d => d.id)
		.style('position', 'absolute')
		.each(function(d) {
			d3.select(this)
				.styles(d.styles);
		});
	addControlButtons(controls_enter);
	addObjectButton(controls_enter);
	return dom;
}

function addControlButtons(controls_enter) {
	controls_enter
		.selectAll('button')
		.data(d => d.buttons || [])
		.enter()
		.append('button')
		.styles({
			background: 'none',
			border: 'none'
		})
		.classed('btn btn-lg btn-secondary', true)
		.append('i')
		.classed('material-icons', true)
		.style('display', 'block')
		.text(d => d.text);
}

function addObjectButton(controls_enter) {
	controls_enter
		.filter('#scene-controls')
		.selectAll('.add-buttons')
		.data(['add-object'])
		.enter()
		.append('div')
		.classed('row add-buttons', true)
		.append('div')
		.classed('col-xs-12', true)
		.style('margin-top', '-5px')
		.append('button')
		.classed('btn btn-lg btn-primary', true)
		.attr('id', d => d)
		.append('i')
		.classed('material-icons', true)
		.style('display', 'block')
		.text('add');
}

function getControlsData() {
	return [
		{
			id: 'file-controls',
			styles: {
				left: 0,
				top: 0
			},
			buttons: [
				'volume_up', "save", "open_in_browser"
			].map(text => ({ text }))
		},
		{
			id: 'scene-controls',
			class: 'container',
			styles: {
				right: 0,
				top: 0
			}
		},
		{
			id: 'zoom-controls',
			styles: {
				right: 0,
				bottom: '1%'
			},
			buttons: [
				['zoom-in','zoom_in'],
				['zoom-out','zoom_out']
			].map(([id,text]) => ({id,text}))
		},
		{
			id: 'dev-controls',
			styles: {
				left: 0,
				bottom: 0
			}
		}
	];
}
