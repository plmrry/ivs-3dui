import Cycle from '@cycle/core';
import CycleDOM from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';
import _ from 'underscore';
import combineLatestObj from 'rx-combine-latest-obj';

debug.enable('*');
const stream = Rx.Observable;
Rx.config.longStackSupport = true;

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
d3.selection.prototype.nodes = function() {
	let nodes = [];
	this.each(function() { nodes.push(this); });
	return nodes;
};

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
	
	const size$ = stream
		.of({ width: 400, height: 700 })
		.shareReplay();
	
	const main_canvas_drag$ = custom.dom
    .select('#main-canvas')
    .d3dragHandler()
    .events('drag');
    
  const mouse$ = main_canvas_drag$
  	.map(({ node, event }) => { 
  		let mouse = d3.mouse(node);
  		return mouse;
  	});
    
  const ndcScale$ = size$
  	.map(updateNdcDomain)
  	.scan(apply, {
  		x: d3.scale.linear().range([-1, 1]),
      y: d3.scale.linear().range([1, -1])
  	});
  	
  const ndc$ = mouse$
  	.withLatestFrom(
  		ndcScale$,
  		getNdcFromMouse
  	);
	
	const floor$ = custom.scenes
	  .map(scenes => scenes.select({ name: 'main' }))
	  .filter(s => s.size() > 0)
	  .map(scene => scene.select({ name: 'floor' }))
	  .filter(s => s.size() > 0)
	  .map(floor => floor.node())
	  .map(floor => [floor]);
	  
	const main_camera_state$ = custom.states
		.pluck('cameras')
		.map(s => s.select({ name: 'main' }))
		.filter(s => s.size() > 0)
		.map(s => s.node());
		
  const raycaster$ = ndc$ // combineLatestObj({ ndc$, camera: main_camera_state$ })
  	.withLatestFrom(
  		main_camera_state$,
  		(n,c) => ({ ndc: n, camera: c })
  	)
  	.map(({ ndc, camera }) => (r) => { 
  		r.setFromCamera(ndc, camera);
  		return r;
  	})
  	.scan(apply, new THREE.Raycaster());
  	
  const intersects$ = raycaster$ //combineLatestObj({ raycaster$, floor$ })
  	.withLatestFrom(
  		floor$,
  		(r,f) => ({ raycaster: r, floor: f })
  	)
  	.map(({ raycaster, floor }) => raycaster.intersectObjects(floor))
  	.filter(arr => arr.length > 0)
  	.map(arr => arr[0])
  	.pluck('point', 'x')
  	.do(log)
  	.subscribe()

  const orbit$ = custom.dom
    .select('#orbit_camera')
    .d3dragHandler()
    .events('drag')
    .pluck('event')
    .do(log)
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
		.map(phi => (phi < 0) ? (2 * Math.PI) + phi : phi);
		
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
		
	const main_camera$ = combineLatestObj({
			position$,
			lookAt$,
			size$
		})
		.map(({ position, lookAt, size }) => {
			return {
				id: 'main',
				name: 'main',
				size: size,
				position: position,
				zoom: 40,
				lookAt: lookAt
			};
		});
		
	
	const foo$ = stream.of(1,2);
	
	const view$ = combineLatestObj({
			main_camera$,
			size$,
			foo$
		})
		.map(({ main_camera, size, foo }) => {
			return {
				scenes: [
					{
						id: 'main',
						name: 'main',
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
							},
							{
								type: 'sound_object',
								name: 'sound_object',
								id: 1,
								position: {
									x: 3,
									y: -0.5,
									z: -1
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
						name: 'main',
						canvas: '#main-canvas',
						size: size
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

	var container = d3.select('body')
		.append('div');
	
	container
		.append('canvas')
		.attr('id', 'main-canvas')
		.style({
			border: '1px solid black'
		});
		
	var controls = container.append('div');
		
	controls
		.append('button')
		.attr('id', 'orbit_camera')
		.text('orbit_camera')
		.style('height', '100px');

	var room_size = {
		width: 20,
		length: 18,
		height: 3
	};
	
	var floor = getFloor(room_size);
	
	var spotLight = new THREE.SpotLight(0xffffff, 0.95);
	spotLight.position.setY(100);
	spotLight.castShadow = true;
	spotLight.shadow.mapSize.width = 4000;
	spotLight.shadow.mapSize.height = 4000; 
	spotLight.intensity = 1;
	spotLight.exponent = 1;

	var hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
	
	const state = {
		dom: container,
		renderers: d3.select(new Selectable()),
		scenes: d3.select(new Selectable()),
		cameras: d3.select(new Selectable())
	};
	
	return function customDriver(view$) {
		const dom$ = new Rx.ReplaySubject();
		const scenes$ = new Rx.ReplaySubject();
		const state$ = new Rx.ReplaySubject();
		view$.subscribe(view => {
			debug('view')('view update');
				
			let scenes = state.scenes.selectAll().data(view.scenes);
				
			scenes
				.enter()
				.append(function(d) {
					debug('scene')('new scene');
					var new_scene = new THREE.Scene();
					new_scene.name = d.name;
					new_scene.add(floor);
					new_scene.add(spotLight);
					new_scene.add(hemisphere);
					return new_scene;
				});
				
			let sound_objects = updateSoundObjects(scenes);
			
			updateCones(sound_objects);
			
			updateCameras(view, state);
	
			updateRenderers(view, state);
				
			view.renderSets
				.forEach(({render_id, scene_id, camera_id}) => {
					let renderer = state.renderers.select({ name: render_id }).node();
					let scene = state.scenes.select({ name: scene_id }).node();
					let camera = state.cameras.select({ name: camera_id }).node();
					renderer.render(scene, camera);
				});
			
			dom$.onNext(state.dom);
			scenes$.onNext(state.scenes);
			state$.onNext(state);
		});
		
		return {
			dom: {
				select: function(selector) {
					let selection$ = dom$.map(dom => dom.select(selector));
					return {
						events: function(type) {
							return selection$.flatMap(observableFromD3Event(type));
						},
						d3dragHandler: function() {
							let handler = d3.behavior.drag();
							let dragHandler$ = selection$
								.map(s => {
									handler.call(s); 
									return handler;
								});
							return {
								events: function(type) {
									return dragHandler$.flatMap(observableFromD3Event(type));
								}
							};
						}
					};
				}
			},
			scenes: scenes$,
			states: state$
		};
	};
}

function updateCameras(view, state) {
	let cameras = state.cameras.selectAll().data(view.cameras);
			
	cameras.enter()
		.append(function(d) {
			debug('camera')('new camera');
			let cam = new THREE.OrthographicCamera();
			cam.name = d.name;
		  return cam;
		});
		
	cameras
		.each(function(d) {
			/** Update camera size if needed */
			if (! _.isMatch(this._size, d.size)) {
				debug('camera')('update size');
				var s = d.size;
				[ this.left, this.right ] = [-1,+1].map(d => d * s.width * 0.5);
				[ this.bottom, this.top ] = [-1,+1].map(d => d * s.height * 0.5);
				this.updateProjectionMatrix();
				this._size = d.size;
			}
			/** Always update lookAt and up with position! */
			if (! _.isMatch(this.position, d.position)) {
			  debug('camera')('update position');
			  this.position.copy(d.position);
			  this.lookAt(d.lookAt);
			  this.up.copy(new THREE.Vector3(0, 1, 0));
			  // this.updateProjectionMatrix();
			}
			/**
			 * NOTE: You could, in theory, raycast from the middle of the camera's
			 * view to the floor in order to get the "current lookat". But that's
			 * a little crazy, don't you think?
			 */
			/** Update camera zoom */
			if (this.zoom !== d.zoom) {
				debug('camera')('update zoom');
				this.zoom = d.zoom;
				this.updateProjectionMatrix();
			}
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

function updateRenderers(view, state) {
	let renderers = state.renderers.selectAll().data(view.renderers);
	renderers
		.enter()
		.append(function(d) {
			debug('renderer')('new renderer');
			let rend = new THREE.WebGLRenderer({
				canvas: state.dom.select(d.canvas).node(),
				antialias: true
			});
			rend.shadowMap.enabled = true;
			rend.shadowMap.type = THREE.PCFSoftShadowMap;
			rend.name = d.name;
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

function Selectable() {
	this.children = [];
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

function getNdcFromMouse(mouse, ndc) {
	return {
		x: ndc.x(mouse[0]),
		y: ndc.y(mouse[1])
	};
}

// function getNdcFromMouse({ mouse, ndc }) {
// 	return {
// 		x: ndc.x(mouse[0]),
// 		y: ndc.y(mouse[1])
// 	};
// }

// function getNdcFromMouse(event, ndc) {
//   event.ndc = {
//     x: ndc.x(event.mouse[0]),
//     y: ndc.y(event.mouse[1])
//   };
//   return event;
// };

function updateNdcDomain({ width, height }) {
  return function(d) {
    d.x.domain([0, width]);
    d.y.domain([0, height]);
    return d;
  };
}

function apply(o, fn) {
	return fn(o);
}