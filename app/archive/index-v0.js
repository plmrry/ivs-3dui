import Cycle from '@cycle/core';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';

const stream = Rx.Observable;

const container = d3.select('#app');

const _degToRad = d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI]);
init();

function init() {
	let main = container
		.append('main')
		.style({
			height: '800px',
			width: '900px',
			border: '1px solid black',
			position: 'relative'
		});
		
	main
		.append('canvas')
		.attr('id', 'main-canvas')
		.style({
			border: '1px solid blue'
		});
		
	main
		.append('div')
		.attr('id', 'editor-view')
		.append('canvas')
		.attr('id', 'editor-canvas')
		.style({
			border: '1px solid green',
			position: 'absolute',
			right: 0,
			top: 0
		});
		
	const main_renderer = new THREE.WebGLRenderer({
		canvas: container.select('#main-canvas').node(),
		antialias: true
	});
	// main_renderer.setClearColor('white')
	
	const main_camera = getFirstCamera({
		zoom: 40, radius: 100, theta: 80, phi: 45 
	});
	
	const room_size = {
	  width: 20,
	  length: 18,
	  height: 3
	};
	
	const room_object = new THREE.Object3D();
	room_object.name = 'room';
	
	const floor_object = getFloor(room_size);
	floor_object.receiveShadow = true;
	
	const main_scene = new THREE.Scene();
	
	main_scene.add(floor_object);
	main_scene.add(room_object);
	
	const spotLight = new THREE.SpotLight(0xffffff, 0.95);
	spotLight.position.setY(100);
	spotLight.castShadow = true;
	spotLight.shadowMapWidth = 4000;
	spotLight.shadowMapHeight = 4000;
	spotLight.shadowDarkness = 0.2;
	spotLight.intensity = 1;
	spotLight.exponent = 1;
	
	main_scene.add(spotLight);
	
	const hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
	
	main_scene.add(hemisphere);
	
	const size = {
		width: 500, height: 500
	};
	
	main_renderer.setSize(size.width, size.height);
	
	setCameraSize(size)(main_camera);
	
	main_renderer.render(main_scene, main_camera);
}

function setCameraSize(s) {
  return function(c) {
    var ref, ref1;
    ref = [-1, 1].map(function(d) {
      return d * s.width / 2;
    }), c.left = ref[0], c.right = ref[1];
    ref1 = [-1, 1].map(function(d) {
      return d * s.height / 2;
    }), c.bottom = ref1[0], c.top = ref1[1];
    c.updateProjectionMatrix();
    return c;
  };
};

function degToRad() {
	return _degToRad(arguments);
}

function polarToVector(o) {
  var phi, radius, theta, x, y, z;
  radius = o.radius, theta = o.theta, phi = o.phi;
  x = radius * Math.cos(theta) * Math.sin(phi);
  y = radius * Math.sin(theta) * Math.sin(phi);
  z = radius * Math.cos(phi);
  return new THREE.Vector3(y, z, x);
}

function getFirstCamera({
	zoom, radius, theta, phi
}) {
  var c;
  c = new THREE.OrthographicCamera();
  c.zoom = zoom;
  c._lookAt = new THREE.Vector3();
  c.position._polar = {
    radius: radius,
    theta: degToRad(theta),
    phi: degToRad(phi)
  };
  c.position._relative = polarToVector(c.position._polar);
  c.position.addVectors(c.position._relative, c._lookAt);
  c.lookAt(c._lookAt);
  c.up.copy(new THREE.Vector3(0, 1, 0));
  c.updateProjectionMatrix();
  return c;
};

function getFloor(room_size) {
  var FLOOR_GRID_COLOR, FLOOR_SIZE, c, e, floor, floorGeom, floorMat, grid;
  FLOOR_SIZE = 100;
  FLOOR_GRID_COLOR = new THREE.Color(0, 0, 0);
  floorGeom = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  c = 0.46;
  floorMat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(c, c, c),
    side: THREE.DoubleSide,
    depthWrite: false
  });
  e = 0.5;
  floorMat.emissive = new THREE.Color(e, e, e);
  floor = new THREE.Mesh(floorGeom, floorMat);
  floor.name = 'floor';
  floor.rotateX(Math.PI / 2);
  floor.position.setY(-room_size.height / 2);
  grid = new THREE.GridHelper(FLOOR_SIZE / 2, 2);
  grid.rotateX(Math.PI / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  grid.material.linewidth = 2;
  grid.material.depthWrite = false;
  floor.add(grid);
  return floor;
};

// Either

// renderers = {
// 	main_renderer: new THREE.WebGL..
// }

// renderers = [
// 	{
// 		name: 'main-renderer',
// 		renderer: new THREE.WebGL..
// 	}
// ]

// function main ({ driver }) {

//   return {
// 		driver: stream.empty()
//   };
// }

// const sources = {
//   driver: makeCustomDriver('#app')
// }

// Cycle.run(main, sources);

// function makeCustomDriver(selector) {
// 	const container = d3.select(selector);
	
// 	const main_renderer = new THREE.WebGLRenderer({
// 		canvas: container.select('#main-canvas').node(),
// 		antialias: true
// 	});
	
// 	first_dom(container);
	
// 	const dom$ = stream.just
	
// 	return function(sink$) {
		
// 	}
// }

// function first_dom(selection) {
// 	let main = selection
// 		.append('main')
// 		.style({
// 			height: '800px',
// 			width: '900px',
// 			border: '1px solid black',
// 			position: 'relative'
// 		});
		
// 	main
// 		.append('canvas')
// 		.attr('id', 'main-canvas')
// 		.style({
// 			border: '1px solid blue'
// 		})
		
// 	main
// 		.append('div')
// 		.attr('id', 'editor-view')
// 		.append('canvas')
// 		.attr('id', 'editor-canvas')
// 		.style({
// 			border: '1px solid green',
// 			position: 'absolute',
// 			right: 0,
// 			top: 0
// 		});
		
// 	return selection;
// }