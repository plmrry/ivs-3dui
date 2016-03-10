import Cycle from '@cycle/core';
import CycleDOM from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';
import _ from 'underscore';

debug.enable('*');
const stream = Rx.Observable;
Rx.config.longStackSupport = true;

function polarToVector(o) {
	var phi, radius, theta, x, y, z;
	radius = o.radius, theta = o.theta, phi = o.phi;
	x = radius * Math.cos(theta) * Math.sin(phi);
	y = radius * Math.sin(theta) * Math.sin(phi);
	z = radius * Math.cos(phi);
	return new THREE.Vector3(y, z, x);
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

function main({custom}) {
	const log = console.log.bind(console);
	
	const orbit$ = custom.camera_orbit_drag$
		.pluck('event')
		.filter(ev => ev.type === 'drag')
		.shareReplay();
	
	const MAX_LATITUDE = 89.99;
	const MIN_LATITUDE = 5;
	
	const latitude_to_theta = d3.scale.linear()
		.domain([90, 0, -90])
		.range([0, Math.PI/2, Math.PI]);
		
	const longitude_to_phi = d3.scale.linear()
		.domain([0, 360])
		.range([0, 2 * Math.PI]);
	
	const theta$ = orbit$
		.pluck('dy')
		.startWith(45)
		.scan((a,b) => {
			let lat = a-b; // Negative because we need to flip the y!
			if (lat >= MAX_LATITUDE) return MAX_LATITUDE;
			if (lat <= MIN_LATITUDE) return MIN_LATITUDE;
			return lat;
		})
		.map(latitude_to_theta);
		
	const phi$ = orbit$
		.pluck('dx')
		.startWith(45)
		.scan((a,b) => a+b)
		.map(longitude_to_phi)
		.map(phi => phi % (2 * Math.PI))
		.map(phi => (phi < 0) ? (2 * Math.PI) + phi : phi)
		// .do(log)
		
	const polar_position$ = stream
		.combineLatest(
			stream.of(100),
			theta$,
			phi$,
			(radius, theta, phi) => ({ radius, theta, phi })
		);

	function polarToVector({ radius, theta, phi }) {
		return {
			x: radius * Math.sin(phi) * Math.sin(theta),
			z: radius * Math.cos(phi) * Math.sin(theta),
			y: radius * Math.cos(theta)
		};
	}
		
	const relative_position$ = polar_position$
		.map(polarToVector);
		
	const lookAt$ = stream
		.of({
			x: 0, y: 0, z: 0
		});
		
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
		
	const main_camera$ = stream
		.combineLatest(
			position$,
			lookAt$,
			(p,l) => ({ position: p, lookAt: l })
		)
		.map(({ position, lookAt }) => {
			return {
				id: 'main',
				size: {
				  width: 500, height: 500
				},
				position: position,
				zoom: 40,
				lookAt: lookAt
			};
		});
		
	
	const foo$ = stream.of(1,2);
	
	const view$ = stream
		.combineLatest(
			main_camera$,
			foo$,
			(main_camera, foo) => ({ main_camera, foo })
		)
		.map(({ main_camera, foo }) => {
			return {
				scenes: [
					{
						id: 'main',
						floors: [
						  {
						    type: 'floor',
						    name: 'floor',
						  }
						],
						sound_objects: [
							{
								type: 'sound_object',
								name: 'sound_object',
								id: 1,
								position: {
									x: 2,
									y: -0.5,
									z: 1
								},
								volume: 0.8,
								cones: [
									{
										volume: 2,
										spread: 0.5,
										latitude: 45,
										theta: Math.PI * 0.5,
										phi: 0,
										selected: true
									},
									{
										volume: 1.2,
										spread: 0.7,
										latitude: 110,
										theta: Math.PI * 0.1,
										phi: 3
									}
								]
							}
						]
					}
				],
				cameras: [ main_camera ],
				renderers: [
					{
						id: 'main',
						size: {
							width: 500, height: 500
						}
					}
				],
				renderSets: [
					{
						render_id: 'main',
						scene_id: 'main',
						camera_id: 'main'
					}
				]
			};
		});
	
	return {
		custom: view$
	};
}

Cycle.run(main, {
	DOM: CycleDOM.makeDOMDriver('#app'),
	custom: makeCustomDriver('#app')
});

const raycaster = new THREE.Raycaster();

function makeCustomDriver() {
	
	THREE.Object3D.prototype.appendChild = function (c) { 
		this.add(c); 
		return c; 
	};
	THREE.Object3D.prototype.querySelector = function(query) {
		let key = Object.keys(query)[0];
		return this.getObjectByProperty(key, query[key]);
	};
	THREE.Object3D.prototype.querySelectorAll = function (query) { 
		if (typeof query === 'undefined') return this.children;
		return this.children.filter(d => _.isMatch(d, query));
	};

	var container = d3.select('body')
		.append('div');
	
	var main_canvas = container
		.append('canvas')
		.attr('id', 'main-canvas')
		.style({
			border: '1px solid black'
		});
		
	var controls = container.append('div');
		
	var move_camera_button = controls
		.append('button')
		.attr('id', 'orbit_camera')
		.text('orbit_camera')
		.style('height', '100px');
		
	var camera_orbit_drag$ = fromD3drag(move_camera_button).shareReplay();

	var room_size = {
		width: 20,
		length: 18,
		height: 3
	};
	
	var new_scene = new THREE.Scene();
	new_scene.name = 'main';
	
	var floor = getFloor(room_size);
	
	var spotLight = new THREE.SpotLight(0xffffff, 0.95);
	spotLight.position.setY(100);
	spotLight.castShadow = true;
	spotLight.shadow.mapSize.width = 4000;
	spotLight.shadow.mapSize.height = 4000; 
	spotLight.intensity = 1;
	spotLight.exponent = 1;

	var hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
	
	new_scene.add(floor);
	new_scene.add(spotLight);
	new_scene.add(hemisphere);
	
	const state = {
		dom: container,
		renderers: d3.select(new Selectable()),
		scenes: d3.select(new Selectable()),
		cameras: d3.select(new Selectable())
	};
	
	const first_scene = new_scene;
	
	const dom$ = new Rx.ReplaySubject();
	
	return function customDriver(view$) {
		view$.subscribe(view => {
			debug('view')('view update');
				
			let scenes = state.scenes.selectAll().data(view.scenes);
				
			scenes
				.enter()
				.append(function(d) {
					debug('scene')('new scene');
					return first_scene;
				});
				
			let sound_objects = updateSoundObjects(scenes);
			
			updateCones(sound_objects);
			
			updateCameras(view, state);
	
			updateRenderers(view, state);
				
			view.renderSets
				.forEach(({render_id, scene_id, camera_id}) => {
					let renderer = state.renderers.select({ id: render_id }).node();
					let scene = state.scenes.select({ id: scene_id }).node();
					let camera = state.cameras.select({ id: camera_id }).node();
					renderer.render(scene, camera);
				});
			
			dom$.onNext(state.dom);
		});
		
		return {
			select: function(selector) {
				let selection$ = dom$.map(dom => dom.select(selector));
				return {
					events: function(type) {
						return selection$.flatMap(observableFromD3Event(type));
					}
				};
			},
			camera_orbit_drag$
		};
	};
}

function updateCameras(view, state) {
	let cameras = state.cameras.selectAll().data(view.cameras);
			
	cameras.enter()
		.append(function(d) {
			debug('camera')('new camera');
		  return new THREE.OrthographicCamera();
		});
		
	cameras
		.each(function(d) {
			// Update camera size if needed
			if (! _.isMatch(this._size, d.size)) {
				debug('camera')('update size');
				var s = d.size;
				[ this.left, this.right ] = [-1,+1].map(d => d * s.width * 0.5);
				[ this.bottom, this.top ] = [-1,+1].map(d => d * s.height * 0.5);
				this.updateProjectionMatrix();
				this._size = d.size;
			}
			if (! _.isMatch(this.position, d.position)) {
			  debug('camera')('update position');
			  this.position.copy(d.position);
			  this.lookAt(d.lookAt);
			  this.up.copy(new THREE.Vector3(0, 1, 0));
			  this.updateProjectionMatrix();
			}
			// let cam = this;
			// let floor = state.scenes
			//   .select({ id: 'main' })
			//   .select({ name: 'floor' })
			//   .each(function(d) {
			//     let ray = raycaster;
			//     debugger
			//   })
			// Update camera zoom
			if (this.zoom !== d.zoom) {
				debug('camera')('update zoom');
				this.zoom = d.zoom;
				this.updateProjectionMatrix();
			}
			// Update camera lookAt
		// 	if (! _.isMatch(this._lookAt, d.lookAt)) {
		// 		debug('camera')('update lookAt');
		// 		this.lookAt(d.lookAt);
		// 		this._lookAt = d.lookAt;
		// 	}
		});
	
}

function updateSoundObjects(scenes) {

	let sound_objects = scenes
		.selectAll({ name: 'sound_object' })
		.data(function(d) { return d.sound_objects });
			
	sound_objects
		.enter()
		.append(function(d) {
			debug('sound object')('new object');
			var geometry = new THREE.SphereGeometry(0.1, 30, 30);
			var PARENT_SPHERE_COLOR = new THREE.Color(0, 0, 0);
			var material = new THREE.MeshPhongMaterial({
				color: PARENT_SPHERE_COLOR,
				transparent: true,
				opacity: 0.3,
				side: THREE.DoubleSide
			});
			var sphere = new THREE.Mesh(geometry, material);
			sphere.castShadow = true;
			sphere.receiveShadow = true;
			// sphere.name = 'parentSphere';
			sphere.name = d.name;
			sphere._volume = 1;
			sphere.renderOrder = 10;
			return sphere;
		});
			
	sound_objects
		.each(function(d) {
			if (! _.isMatch(this.position, d.position)) {
				debug('sound object')('set position', d.position);
				this.position.copy(d.position);
			}
			let params = this.geometry.parameters;
			if (! _.isMatch(params, { radius: d.volume })) {
				debug('sound object')('set radius', d.volume);
				Object.assign(params, { radius: d.volume });
				let newGeom = new THREE.SphereGeometry(
					params.radius,
					params.widthSegments,
					params.heightSegments
				);
				this.geometry.dispose();
				this.geometry = newGeom;
			}
		});
		
	return sound_objects;
}

function updateCones(sound_objects) {
	let cones = sound_objects
		.selectAll()
		.data(function(d) { return d.cones });
	cones
		.enter()
		.append(getNewCone);
	cones
		.each(updateOneCone);
}

const latitude_to_theta = d3.scale.linear()
	.domain([90, 0, -90])
	.range([0, Math.PI/2, Math.PI]);

function updateOneCone(d) {
	// Update rotation
	this.rotation.x = latitude_to_theta(d.latitude);
	this.rotation.y = d.phi;
	// If params change, update geometry
	let cone = this.children[0];
	let params = cone.geometry.parameters;
	let newParams = { height: d.volume, radiusTop: d.spread };
	if (! _.isMatch(params, newParams)) {
		debug('cone')('new geometry');
		Object.assign(params, newParams);
		let newGeom = cylinder_geometry_from_params(params);
		cone.geometry.dispose();
		cone.geometry = newGeom;
		cone.position.y = cone.geometry.parameters.height / 2;
	}
	// Update color
	let SELECTED_COLOR = new THREE.Color("#66c2ff");
	if (d.selected === true) cone.material.color = SELECTED_COLOR;
}

function cylinder_geometry_from_params(params) {
	return new THREE.CylinderGeometry(
		params.radiusTop,
		params.radiusBottom,
		params.height,
		params.radialSegments,
		params.heightSegments,
		params.openEnded
	);
}

function getNewCone() {
	let CONE_BOTTOM = 0.01;
	let CONE_RADIAL_SEGMENTS = 50;
	let params = {
		radiusBottom: CONE_BOTTOM,
		openEnded: true,
		radialSegments: CONE_RADIAL_SEGMENTS
	}
	let geometry = new THREE.CylinderGeometry(
		params.radiusTop,
		params.radiusBottom,
		params.height,
		params.radialSegments,
		params.heightSegments,
		params.openEnded
	);
	let material = new THREE.MeshPhongMaterial({
		transparent: true,
		opacity: 0.5,
		side: THREE.DoubleSide
	});
	let cone = new THREE.Mesh(geometry, material);
	cone.name = 'cone';
	cone.castShadow = true;
	cone.receiveShadow = true;
	let coneParent = new THREE.Object3D();
	coneParent.add(cone);
	return coneParent;	
}

function updateRenderers(view, state, dom) {
	let renderers = state.renderers.selectAll().data(view.renderers);
	renderers
		.enter()
		.append(function(d) {
			debug('renderer')('new renderer');
			let rend = new THREE.WebGLRenderer({
				canvas: state.dom.select('#main-canvas').node(),
				antialias: true
			});
			rend.shadowMap.enabled = true;
			rend.shadowMap.type = THREE.PCFSoftShadowMap;
			return rend;
		});
	renderers
		.each(function(d) {
			let current = this.getSize();
			let diff = _.difference(_.values(current), _.values(d.size));
			if (diff.length > 0) {
				debug('renderer')('set size');
				this.setSize(d.size.width, d.size.height);
			}
		});
}

function idIs(id) {
	return function(d) {
		return d.id === id;
	};
}

// const degToRadScale = d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI]);
// var degToRadScale;

// function degToRad() {
// 	degToRadScale = degToRadScale || d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI]);
// 	return degToRadScale.apply(this, arguments);
// }

function Selectable() {
	this.children = [];
	this.querySelector = function(query) {
		if (typeof query === 'string') {
			console.warn('query is string');
			query = { id: query };
		}
		return d3.select(this)
			.selectAll()
			.filter(d => _.isMatch(d, query))
			.node();
	};
	this.querySelectorAll = function(query) {
		if (typeof query === 'undefined') return this.children;
		return this.children.filter(d => _.isMatch(d, query));
	};
	this.appendChild = function(child) {
		this.children.push(child);
		return child;
	};
}

function fromD3drag(selection) {
	let handler = d3.behavior.drag();
  selection.call(handler);
  return fromD3dragHandler(handler);
}

function fromD3dragHandler(drag) {
	let streams = ['drag', 'dragstart', 'dragend']
		.map(ev => observableFromD3Event(ev)(drag));
	return stream.merge(streams);
}

function observableFromD3Event(type) {
	return function(selection) {
		return stream
			.create(observer => 
				selection.on(type, function(d) {
					observer.onNext({
						datum: d,
						node: this,
						event: d3.event
					});
				})
			);
	};
}

function getFirstCamera() {
	const degToRad = d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI]);
	// var CAMERA_RADIUS = 100;
	// var INITIAL_THETA = 80;
	// var INITIAL_PHI = 45;
	// var INITIAL_ZOOM = 40;
	var c = new THREE.OrthographicCamera();
	// c.zoom = INITIAL_ZOOM;
	// c._lookAt = new THREE.Vector3();
	// c.position._polar = {
	// 	radius: CAMERA_RADIUS,
	// 	theta: degToRad(INITIAL_THETA),
	// 	phi: degToRad(INITIAL_PHI)
	// };
	// c.position._relative = polarToVector(c.position._polar);
// 	c.position.addVectors(c.position._relative, new THREE.Vector3());
	// c.lookAt(c._lookAt);
	// c.lookAt({ x: 0, y: 0, z: 0 })
	// c.up.copy(new THREE.Vector3(0, 1, 0));
	// c.updateProjectionMatrix();
	return c;
}

		// main_camera_position_x$.subscribe(d => console.log(d))
		
	// const main_camera_lookat_x$ = slider$
	// 	.map(d => d.node.value);
		
	// main_camera_lookat_x$
	// 	.do(console.log.bind(console))
	// 	.subscribe()
	
	// const main_camera_latitude$ = slider$
	// 	.filter(d => {
	// 		return d.node.value <= 90 && d.node.value >= 10;
	// 	});
		
	// const main_camera_position_polar_degrees$ = stream
	// 	.of({
	// 		radius: 100,
	// 		theta_degrees: 80,
	// 		phi_degrees: 45
	// 	});
		
	// const degToRad = d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI]);
		
	// const main_camera_position_polar_radians$ = main_camera_position_polar_degrees$
	// 	.map(({radius,theta_degrees,phi_degrees}) => {
	// 		return {
	// 			radius,
	// 			theta: degToRad(theta_degrees),
	// 			phi: degToRad(phi_degrees),
	// 		}
	// 	})