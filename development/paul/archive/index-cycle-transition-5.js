import Cycle from '@cycle/core';
import {makeDOMDriver, div, input, p} from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';

d3.selection.prototype.nodes = function() {
	let nodes = [];
	this.each(function() {
		nodes.push(this);
	});
	return nodes;
}

const stream = Rx.Observable;

const mouse = new THREE.Vector2();
const ndc_scale = {
	x: d3.scale.linear().range([-1, 1]).clamp(true),
	y: d3.scale.linear().range([1, -1]).clamp(true)
};
const ndc = new THREE.Vector2();

function getNdc(node) {
	let arr = d3.mouse(node);
	mouse.set(arr[0], arr[1]);
	ndc.set(
		ndc_scale.x.domain([0, node.clientWidth])(mouse.x),
		ndc_scale.y.domain([0, node.clientHeight])(mouse.y)
	);
	return ndc;
}

function setNdc(obj) {
	obj.ndc = getNdc(obj.node);
	return obj
}

function main(drivers) {
	
	let dom = drivers.d3Dom;
	
	let scene$ = drivers.custom.pluck('scene');
	let camera$ = drivers.custom.pluck('camera');
	
	let mouseMove$ = drivers.d3Dom
		.select(function() { return this; })
		.events('mousemove')
		.map(setNdc)
		.pluck('ndc');
		
	let mouseDown$ = drivers.d3Dom
		.select(function() { return this; })
		.events('mousedown')
		.map(setNdc)
		.pluck('ndc');
		
	let keyDown$ = drivers.d3Dom
		.select(function() { return document; })
		.events('keydown');
		
	let keyUp$ = drivers.d3Dom
		.select(d => document)
		.events('keyup');
		
	let shiftDown$ = keyDown$
		.pluck('event', 'code')
		.filter(c => c === 'ShiftLeft');
		
	let isShiftDown$ = stream
		.merge(
			shiftDown$.map(d => true),
			keyUp$.map(d => false)
		)
		.startWith(false)
		.distinctUntilChanged()
		.do(debug('shift is down'));
		
	let windowSize$ = drivers.d3Dom
		.select(function() { return window; })
		.events('resize')
		.pluck('node')
		.startWith(window)
		.map(w => ({ width: w.innerWidth, height: w.innerHeight }))
		.map(s => ({ renderer }) => renderer.setSize( s.width, s.height ));
		
	let firstRenderer$ = dom.select('canvas#main').observable
		.do(debug('canvas'))
		.map(d => d.node())
		.map(n => 
			(state) => {
				const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: n });
				renderer.setClearColor( 0xf0f0f0 );
				renderer.setPixelRatio( window.devicePixelRatio );
				renderer.setSize( window.innerWidth, window.innerHeight );
				state.renderer = renderer;
			}
		)
		.first();
	
	let render$ = stream
  	.combineLatest(
  		scene$, 
  		camera$, 
  		(s,c) => ({ renderer }) => renderer.render(s, c)
  	)
  	// .merge(windowSize$);
  	
  let addCone$ = mouseDown$
  	.withLatestFrom(
  		isShiftDown$,
  		(mouse, shift) => ({mouse, shift})
  	)
  	.map(({ mouse, shift }) => {
  		return function({ raycaster, scene, camera }) {
				raycaster.setFromCamera( mouse, camera );
				
				let sphere = scene.getObjectByName('sphere');
				let children = sphere.children;
				var interactive = sphere.getObjectByName('interactive');
				var intersects = raycaster.intersectObjects([ sphere ]);

				if ( intersects.length > 0 ) {
					debug('shift')(shift)

					if ( shift ) {
						// Well, do we want to combine add and delete with the shift key?
						// Would not work on mobile!
						
						// var intersect = intersects[ 0 ];
						// if ( intersect.object != sphere ) {
						// sphere.remove( intersect.object );
						// objects.splice( objects.indexOf( intersect.object ), 1 );
					} else {
						var placedCone = interactive.clone();
						sphere.add(placedCone);
					}
				}
  		};
  	});
  	
  let updateInteractive$ = mouseMove$
  	.map(mouse => {
    	return function({ raycaster, scene, camera }) {
    		raycaster.setFromCamera( mouse, camera );
    		var _sphere = scene.getObjectByName('sphere');
				var intersects = raycaster.intersectObject( _sphere, false );
				var interactive = _sphere.getObjectByName('interactive');
				if ( intersects.length > 0 ) {
					var intersect = intersects[ 0 ];
					interactive.lookAt(intersect.point);
				}
    	};
    });
    
  let firstDom$ = stream.just(d => d.append('canvas').attr('id', 'main'));
	
  return {
    render: firstRenderer$.concat(render$),
    custom: stream.merge(
    	updateInteractive$, addCone$
    ),
    d3Dom: firstDom$
  };
}

const drivers = {
	// scene: makeSceneDriver(),
	render: makeRenderDriver(),
	// raycaster: makeRaycasterDriver(),
  // windowSize: windowSize,
  custom: makeCustomDriver('#app'),
  d3Dom: makeD3DomDriver('#app')
};

Cycle.run(main, drivers);

function makeRenderDriver() {
	// const renderer = new THREE.WebGLRenderer({ antialias: true });
	// renderer.setClearColor( 0xf0f0f0 );
	// renderer.setPixelRatio( window.devicePixelRatio );
	// renderer.setSize( window.innerWidth, window.innerHeight );
	// d3.select('#app').node().appendChild( renderer.domElement );
	// const state = { renderer };
	const state = {};
	return function(source$) {
		// source$.subscribe(fn => fn(renderer));
		source$.subscribe(fn => fn(state));
	};
}

function makeCustomDriver(selector) {
  let div = d3.select(selector);
			
  return function customDriver(view$) {
  		const subject = new Rx.Subject();

			var camera, scene, renderer, raycaster;

			var interactiveCone, interactiveConeMaterial, interactiveConeGeo;
			var sphere;

			var objects = [];

			init();

			function init() {

				camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );
				camera.position.set( 500, 800, 1300 );
				camera.lookAt( new THREE.Vector3() );

				scene = new THREE.Scene();
				
				var geometry = new THREE.SphereBufferGeometry( 300, 100, 100 );
				sphere = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( {color: 0xFFFFFF, opacity: 0.6 } ) );
				sphere.material.transparent = true;
				sphere.name = 'sphere';
				scene.add( sphere );

				interactiveConeGeo = new THREE.CylinderGeometry(100, 0, 600, 100, 1, true);
				interactiveConeGeo.translate(0, 300, 0);
				interactiveConeGeo.rotateX(Math.PI/2.);
				interactiveConeMaterial = new THREE.MeshBasicMaterial({color: 0x80FFE5, opacity: 0.5});
				interactiveCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
				interactiveCone.material.side = THREE.DoubleSide;
				interactiveCone.material.transparent = true;
				
				interactiveCone.name = 'interactive';

				sphere.add( interactiveCone );

				raycaster = new THREE.Raycaster();

				var ambientLight = new THREE.AmbientLight( 0x606060 );
				scene.add( ambientLight );

				var directionalLight = new THREE.DirectionalLight( 0xffffff );
				directionalLight.position.set( 1, 0.75, 0.5 ).normalize();
				scene.add( directionalLight );

				window.addEventListener( 'resize', onWindowResize, false );

			}

			function onWindowResize() {

				camera.aspect = window.innerWidth / window.innerHeight;
				camera.updateProjectionMatrix();

			}
			
	    view$
	    	.subscribe(fn => {
				
					fn({ raycaster, scene, camera });
	
					subject.onNext({
						scene,
						camera
					});
					
		    });
    
    return subject;
  };
}

// function windowSize() {
//   return stream
//     .fromEvent(window, 'resize')
//     .startWith({ target: window })
// }

function makeD3DomDriver(selection) {
	const container = d3.select(selection);

	return function d3DomDriver(domUpdate$) {
		
		const container$ = domUpdate$
			.scan((container, fn) => {
				// debug('dom')('update');
				fn(container);
				return container;
			}, container)
			.share(); // Otherwise this happens everytime someone else subscribes
		
		return {
			
			select: function(selector) {
				
				let selection$ = container$.map(c => c.select(selector));

				return {
					
					observable: selection$, //.map(s => s.nodes()),
					
					events: function(type) {
						
						return selection$.flatMap(observableFromD3Event(type));
						
					}
					
				};
				
			}
			
		};
		
	};
	
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
}
