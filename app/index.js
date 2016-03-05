import Cycle from '@cycle/core';
import CycleDOM from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';
import _ from 'underscore';
// import bson from 'bson';

debug.enable('*');

const stream = Rx.Observable;

const Selectable = function Selectable() {};

Selectable.prototype.querySelectorAll = function() {
	return (this.children || (this.children = []));
};

// Selectable.prototype.querySelector = function(query) {
//   debugger
//   return this.children.filter(d => d.name === query);
//   // let found = this.children.filter(d => d.name === query);
//   // return (found.length ? found[0] : undefined);
// };

Selectable.prototype.appendChild = function(child) {
	this.children.push(child);
	return child;
};

THREE.Object3D.prototype.appendChild = function (c) { this.add(c); return c; };
THREE.Object3D.prototype.querySelectorAll = function () { return this.children; }; // debugger; return []; };

Rx.config.longStackSupport = true;

var CAMERA_RADIUS = 100;

var INITIAL_THETA = 80;

var INITIAL_PHI = 45;

var INITIAL_ZOOM = 40;

var PARENT_SPHERE_COLOR = new THREE.Color(0, 0, 0);

var ROOM_SIZE = {
	width: 20,
	length: 18,
	height: 3
};

var CONE_BOTTOM = 0.01;

function getConeParentWithParams(params) {
	var CONE_RADIAL_SEGMENTS, cone, coneParent, geometry, material;
	coneParent = new THREE.Object3D();
	Object.assign(coneParent, params);
	coneParent.castShadow = true;
	coneParent.receiveShadow = true;
	CONE_RADIAL_SEGMENTS = 50;
	var _pars = {
		radiusBottom: CONE_BOTTOM,
		openEnded: true,
		radialSegments: CONE_RADIAL_SEGMENTS
	};
	geometry = new THREE.CylinderGeometry(
		_pars.radiusTop,
		_pars.radiusBottom,
		_pars.height,
		_pars.radialSegments,
		_pars.heightSegments,
		_pars.openEnded
	);
	geometry.parameters = {
		radiusBottom: CONE_BOTTOM,
		openEnded: true,
		radialSegments: CONE_RADIAL_SEGMENTS
	};
	material = new THREE.MeshPhongMaterial({
		transparent: true,
		opacity: 0.5,
		side: THREE.DoubleSide
	});
	cone = new THREE.Mesh(geometry, material);
	cone.name = 'cone';
	cone.castShadow = true;
	cone.renderOrder = 1;
	cone.receiveShadow = true;
	coneParent.add(cone);
	return coneParent;
}

function addConeParentWithParams(params) {
	return function(obj) {
		var coneParent, i;
		coneParent = getConeParentWithParams(params);
		updateConeParent(coneParent);
		i = obj.children.length;
		coneParent.name = "cone" + i;
		return obj.add(coneParent);
	};
}

function updateConeParent(coneParent) {
	var cone, geom, newGeom, params;
	coneParent.rotation.x = coneParent._phi;
	coneParent.rotation.z = coneParent._theta;
	cone = coneParent.getObjectByName('cone');
	geom = cone.geometry;
	params = geom.parameters;
	params.height = coneParent._volume;
	params.radiusTop = coneParent._spread;
	newGeom = geom.clone();
	var _pars = params;
	newGeom = new THREE.CylinderGeometry(
		_pars.radiusTop,
		_pars.radiusBottom,
		_pars.height,
		_pars.radialSegments,
		_pars.heightSegments,
		_pars.openEnded
	);
	cone.geometry.dispose();
	cone.geometry = newGeom;
	return cone.position.y = cone.geometry.parameters.height / 2;
}

function getFirstCamera() {
	var c = new THREE.OrthographicCamera();
	c.zoom = INITIAL_ZOOM;
	c._lookAt = new THREE.Vector3();
	c.position._polar = {
		radius: CAMERA_RADIUS,
		theta: degToRad(INITIAL_THETA),
		phi: degToRad(INITIAL_PHI)
	};
	c.position._relative = polarToVector(c.position._polar);
	c.position.addVectors(c.position._relative, c._lookAt);
	c.lookAt(c._lookAt);
	c.up.copy(new THREE.Vector3(0, 1, 0));
	c.updateProjectionMatrix();
	return c;
}

function polarToVector(o) {
	var phi, radius, theta, x, y, z;
	radius = o.radius, theta = o.theta, phi = o.phi;
	x = radius * Math.cos(theta) * Math.sin(phi);
	y = radius * Math.sin(theta) * Math.sin(phi);
	z = radius * Math.cos(phi);
	return new THREE.Vector3(y, z, x);
}

var degToRad = d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI]);

function fakeTweenInSphere(sphere) {
	var currentGeom = sphere.geometry;
	var params = currentGeom.parameters;
	params.radius = 0.8;
	console.log(params);
	var newGeom = new THREE.SphereGeometry(
		params.radius,
		params.widthSegments,
		params.heightSegments
	)
	sphere.geometry.dispose();
	sphere.geometry = newGeom;
}

function addObjectAtPoint2(p, volume) {
	console.info("Add object at", p);
	var geometry = new THREE.SphereGeometry(0.1, 30, 30);
	var material = new THREE.MeshPhongMaterial({
		color: PARENT_SPHERE_COLOR,
		transparent: true,
		opacity: 0.3,
		side: THREE.DoubleSide
	});
	var sphere = new THREE.Mesh(geometry, material);
	sphere.castShadow = true;
	sphere.receiveShadow = true;
	sphere.name = 'parentSphere';
	sphere._volume = volume || 1;
	sphere.renderOrder = 10;
	var lineGeom = new THREE.Geometry();
	var _lineBottom = -p.y + (-ROOM_SIZE.height / 2);
	lineGeom.vertices.push(new THREE.Vector3(0, _lineBottom, 0));
	lineGeom.vertices.push(new THREE.Vector3(0, 100, 0));
	lineGeom.computeLineDistances();
	var dashSize = 0.3;
	var mat = new THREE.LineDashedMaterial({
		color: 0,
		linewidth: 1,
		dashSize: dashSize,
		gapSize: dashSize,
		transparent: true,
		opacity: 0.2
	});
	var line = new THREE.Line(lineGeom, mat);
	sphere.add(line);
	sphere.position.copy(p);
	return sphere;
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

function setCameraSize2(s) {
	return function(c) {
		// var ref, ref1;
		var ref = [-1, 1].map(function(d) {
			return d * s.width / 2;
		});
		c.left = ref[0];
		c.right = ref[1];
		var ref1 = [-1, 1].map(function(d) {
			return d * s.height / 2;
		});
		c.bottom = ref1[0];
		c.top = ref1[1];
		c.updateProjectionMatrix();
		return c;
	};
}

function main({DOM}) {
	
	const view = {
		scenes: [
			{
				id: 'main',
				sound_objects: [
					{
						type: 'sound_object',
						id: 1,
						position: {
							x: 2,
							y: 0,
							z: 1
						},
						volume: 1,
						cones: [
							{
								volume: 2,
								spread: 0.5,
								theta: 0,
								phi: Math.PI * 0.5
							},
							{
								volume: 1.2,
								spread: 0.7,
								theta: Math.PI * 0.3,
								phi: -Math.PI * 0.1
							}
						]
					}
				]
			}
		],
		cameras: [
			{
				id: 'main'
			}
		],
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
	
	return {
		custom: stream.of(view, view, view)
	};
}

Cycle.run(main, {
	DOM: CycleDOM.makeDOMDriver('#app'),
	custom: makeCustomDriver('#app')
});

function makeCustomDriver() {
	var container = d3.select('body')
		.append('div')
		.attr('id', 'new')
		.style({
			position: 'relative'
		});
	
	var main_canvas = container
		.append('canvas')
		.attr('id', 'main-canvas')
		.style({
			border: '1px solid black'
		});
	
	var room_size = {
		width: 20,
		length: 18,
		height: 3
	};
	
	var new_scene = new THREE.Scene();
	
	function tweenColor2(color) {
		return function(o) {
			o.material.color = color;
		};
	}
	
	var p = new THREE.Vector3(-3, -0.5, 3);
	var sphere = addObjectAtPoint2(p, 0.7);
	sphere.name = 'another';
	fakeTweenInSphere(sphere);
	
	addConeParentWithParams({
		_volume: 2,
		_spread: 0.5,
		_theta: 0,
		_phi: Math.PI / 2
	})(sphere);
	
	addConeParentWithParams({
		_volume: 1.2,
		_spread: 0.7,
		_theta: Math.PI * 0.3,
		_phi: -Math.PI * 0.1
	})(sphere);
	
	var color = new THREE.Color("#66c2ff");
	var cone = sphere.children[1].getObjectByName('cone');
	
	tweenColor2(color)(cone);
	
	new_scene.add(sphere);
	
	var floor = getFloor(room_size);
	
	var spotLight = new THREE.SpotLight(0xffffff, 0.95);
	spotLight.position.setY(100);
	spotLight.castShadow = true;
	spotLight.shadow.mapSize.width = 4000;
	spotLight.shadow.mapSize.height = 4000; 
	// spotLight.shadowMapWidth = 4000;
	// spotLight.shadowMapHeight = 4000;
	// spotLight.shadowDarkness = 0.2;
	spotLight.intensity = 1;
	spotLight.exponent = 1;

	var hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
	
	new_scene.add(floor);
	new_scene.add(spotLight);
	new_scene.add(hemisphere);
	
	var camera = getFirstCamera();
	setCameraSize2({ width: 500, height: 500 })(camera);
	
	const state = {
		renderers: d3.select(new Selectable()),
		scenes: d3.select(new Selectable()),
		cameras: d3.select(new Selectable())
	};
	
	const first_scene = new_scene;
	const first_camera = camera;
	
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
				
		let sound_objects = scenes
			.selectAll()
			.filter(function(d, i) { 
				if (typeof d === 'undefined') return false;
				if (typeof d.type === 'undefined') return false;
				return d.type === 'sound_object';
			})
			.data(function(d) { return d.sound_objects });
			
		sound_objects
			.enter()
			.append(function(d) {
				debug('sound object')('new object');
				var geometry = new THREE.SphereGeometry(0.1, 30, 30);
				var material = new THREE.MeshPhongMaterial({
					color: PARENT_SPHERE_COLOR,
					transparent: true,
					opacity: 0.3,
					side: THREE.DoubleSide
				});
				var sphere = new THREE.Mesh(geometry, material);
				sphere.castShadow = true;
				sphere.receiveShadow = true;
				sphere.name = 'parentSphere';
				sphere._volume = 1;
				sphere.renderOrder = 10;
				return sphere;
			});
				
		sound_objects
			.each(function(d) {
				debug('sound object')('each', 'each');
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
			
		let cones = sound_objects
			.selectAll(function(d) { return this.children })
			.data(function(d) { return d.cones });
			
		cones
			.enter()
			// .append(function(d) {
			// 	debugger
			// })
				 
		let cameras = state.cameras.selectAll().data(view.cameras);
		
		cameras.enter()
			.append(function(d) {
				debug('camera')('new camera');
				return first_camera;
			});
		
		let renderers = state.renderers.selectAll().data(view.renderers);
			
		renderers
			.enter()
			.append(function(d) {
				debug('renderer')('new renderer');
				let rend = new THREE.WebGLRenderer({
					canvas: main_canvas.node(),
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
			
		view.renderSets
			.forEach(({render_id, scene_id, camera_id}) => {
				let renderer = renderers.filter(idIs(render_id)).node();
				let scene = scenes.filter(idIs(scene_id)).node();
				let camera = cameras.filter(idIs(camera_id)).node();
				renderer.render(scene, camera);
			});
			
		});
		
		return {};
	};
}

function differentKeys(one, two) {
	let length = [one, two]
		.map(arr => _.values(arr))
		.reduce(function(a,b) { let u = _; debugger })
		// .reduce((a,b) => _.difference(a,b))
		// .length
	console.log(_.values(one), _.values(two))
	console.log(length)
	return true
}

function idIs(id) {
	return function(d) {
		return d.id === id;
	};
}

// function nameIs(name) {
// 	return function(d) {
// 		return d.name === name;
// 	};
// }

// start();

// renderers['main'].render(scenes['main'], camera['main']);
// stream.combineLatest(
// 	renderer$.pluck('main'),
// 	scene$.pluck('main'),
// 	camera$.pluck('main')
// )
// renderers.filter(r => {
//)

			// renderers.selectAll().each(function(d) { console.log(d, this) });
			
			// renderers.selectAll()
			// 	.filter(function(d) { return d.name === 'main' })
			// 	.each(function(d) { console.log(d, this) });
			
			// let selection = renderers.selectAll()
			// 	.filter(function(d) { return d.name === 'main' })
				// .each(function(d) { console.log(d, this) });
				
			// let selection = renderers.select('main');
			// let selection = renderers.select(function(d) { debugger })
		
				
			// renderers.select('main').each(function(d) {
			// 	console.log(d, this);
			// });
			
			// console.log(renderers.select('main'), 'baaah')
			
			// renderers.filter(function(d) { return d.name === 'main' }).each(function(d) {
			// 	console.log(d, this);
			// })
			
			// renderers.filter(function(d) { debugger }).each(function(d) {
			// 	console.log(d, this);
			// })