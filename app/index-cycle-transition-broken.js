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

function main(drivers) {
	
	// let ndc$ = drivers.d3Dom
	// 	.select(function() { return this; })
	// 	.events('mousemove')
	// 	.pluck('ndc');
		
	let camera$ = drivers.camera;
	
	let sphere$ = drivers.scene
		.getObjectByName('sphere')
		.shareReplay();
	
	// let objects$ = drivers.scene
	// 	.getObjectByName('sphere')
	// 	.map(s => [s]);
	
	let objects$ = sphere$.map(s => [s]);
		
  // let raycaster$ = stream
  // 	.combineLatest(
  // 		ndc$, 
  // 		camera$, 
  // 		objects$,
  // 		(mouse, camera, objects) => ({mouse, camera, objects})
  // 	);
	
	let point$ = drivers.raycaster
		.filter(arr => arr.length > 0)
		.map(arr => arr[0])
		.map(i => i.point)
		// .do(debug('point'));
		
	let interactiveCone$ = point$
		.withLatestFrom(
			sphere$,
			(point, sphere) => ({ point, sphere })
		)
		// .withLatestFrom(
		// 	sphere$,
		// 	drivers.scene.updated,
		// 	(p, s, sc) => ({ point: p, sphere: s, scene: sc })
		// )
		.map(function({ point, sphere }) {
			sphere.getObjectByName('interactive').lookAt(point);
			return () => {
				debug('update')('interactive');
			};
		});
		
	let sceneUpdate$ = interactiveCone$
		.startWith(function() {});
		
		// .subscribe()
		
	// point$.subscribe();
	
	let sceneUpdated$ = drivers.scene.updated;
	
	let render$ = stream
  	.combineLatest(
  		sceneUpdated$, 
  		camera$, 
  		(s,c) => (r) => r.render(s, c)
  	);
  	
  // let sceneUpdate$ = stream.of(function() {});
		
  return {
  	// scene: stream.of(() => {}),
  	scene: sceneUpdate$,
    render: render$,
    // raycaster: raycaster$
  };
}

const drivers = {
	scene: makeSceneDriver(),
	camera: makeCameraDriver(),
	render: makeRenderDriver(),
	raycaster: makeRaycasterDriver(),
  windowSize: windowSize,
  custom: makeCustomDriver('#app'),
  d3Dom: makeD3DomDriver('#app')
};

Cycle.run(main, drivers);

// function makeRaycasterDriver() {
// 	const raycaster = new THREE.Raycaster();
// 	return function(sink$) {
// 		let intersects$ = new Rx.Subject();
		
// 		sink$
// 			.map(({ mouse, camera, objects }) => {
// 				raycaster.setFromCamera(mouse, camera);
// 				let intersects = raycaster.intersectObjects(objects);
// 				return intersects
// 			})
// 			.subscribe(intersects$.asObserver());
			
// 		return intersects$
// 	};
// }

// function makeSceneDriver() {
// 	const scene = new THREE.Scene();
// 	var ambientLight = new THREE.AmbientLight( 0x606060 );
// 	scene.add( ambientLight );
	
// 	var directionalLight = new THREE.DirectionalLight( 0xffffff );
// 	directionalLight.position.set( 1, 0.75, 0.5 ).normalize();
// 	scene.add( directionalLight );
	
// 	var geometry = new THREE.SphereBufferGeometry( 300, 100, 100 );
// 	var sphere = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( {color: 0xFFFFFF, opacity: 0.6 } ) );
// 	sphere.material.transparent = true;
	
// 	sphere.name = 'sphere';
	
// 	scene.add( sphere );
	
// 	var interactiveConeGeo = new THREE.CylinderGeometry(100, 0, 600, 100, 1, true);
// 	interactiveConeGeo.translate(0, 300, 0);
// 	interactiveConeGeo.rotateX(Math.PI/2.);
// 	var interactiveConeMaterial = new THREE.MeshBasicMaterial({color: 0x80FFE5, opacity: 0.5});
	
// 	var interactiveCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
// 	interactiveCone.material.side = THREE.DoubleSide;
// 	interactiveCone.material.transparent = true;
// 	interactiveCone.name = 'interactive';

// 	sphere.add( interactiveCone );
	
// 	const sceneUpdated$ = new Rx.ReplaySubject(1);
	
// 	return function(sceneUpdate$) {
// 		sceneUpdate$
// 			.do(fn => debug('scene:update')(fn))
// 			.subscribe(fn => {
// 				fn(scene);
// 				sceneUpdated$.onNext(scene);
// 			});
		
// 		return {
// 			getObjectByName: function(name) {
// 				return sceneUpdated$.map(s => s.getObjectByName(name));
// 			},
// 			updated: sceneUpdated$
// 		};
// 	};
// }

// function makeCameraDriver() {
// 	const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );
// 	camera.position.set( 500, 800, 1300 );
// 	camera.lookAt( new THREE.Vector3() );
// 	return function() {
// 		return stream.of(camera);
// 	}
// }

// function makeRenderDriver() {
// 	const renderer = new THREE.WebGLRenderer({ antialias: true });
// 	renderer.setClearColor( 0xf0f0f0 );
// 	renderer.setPixelRatio( window.devicePixelRatio );
// 	renderer.setSize( window.innerWidth, window.innerHeight );
// 	d3.select('#app').node().appendChild( renderer.domElement );
// 	return function(source$) {
// 		source$.subscribe(fn => fn(renderer));
// 	};
// }

// function makeCustomDriver(selector) {
//   let div = d3.select(selector);
			
//   return function customDriver(view$) {
//   		const subject = new Rx.Subject();

// 			var container;
// 			var camera, scene, renderer;
// 			var mouse, raycaster, isShiftDown = false;

// 			var interactiveCone, interactiveConeMaterial, interactiveConeGeo;
// 			var sphere;

// 			var objects = [];
// 			// var 

// 			init();
// 			render();

// 			function init() {

// 				// container = d3.select('#app').node();

// 				camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );
// 				camera.position.set( 500, 800, 1300 );
// 				camera.lookAt( new THREE.Vector3() );

// 				scene = new THREE.Scene();
				
// 				var geometry = new THREE.SphereBufferGeometry( 300, 100, 100 );
// 				sphere = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( {color: 0xFFFFFF, opacity: 0.6 } ) );
// 				sphere.material.transparent = true;
// 				sphere.name = 'sphere';
// 				scene.add( sphere );

// 				interactiveConeGeo = new THREE.CylinderGeometry(100, 0, 600, 100, 1, true);
// 				interactiveConeGeo.translate(0, 300, 0);
// 				interactiveConeGeo.rotateX(Math.PI/2.);
// 				interactiveConeMaterial = new THREE.MeshBasicMaterial({color: 0x80FFE5, opacity: 0.5});
// 				interactiveCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
// 				interactiveCone.material.side = THREE.DoubleSide;
// 				interactiveCone.material.transparent = true;

// 				sphere.add( interactiveCone );

// 				//

// 				raycaster = new THREE.Raycaster();
// 				mouse = new THREE.Vector2();



// 				objects.push( sphere );

// 				// Lights

// 				var ambientLight = new THREE.AmbientLight( 0x606060 );
// 				scene.add( ambientLight );

// 				var directionalLight = new THREE.DirectionalLight( 0xffffff );
// 				directionalLight.position.set( 1, 0.75, 0.5 ).normalize();
// 				scene.add( directionalLight );

// 				document.addEventListener( 'mousemove', onDocumentMouseMove, false );
// 				document.addEventListener( 'mousedown', onDocumentMouseDown, false );
// 				document.addEventListener( 'keydown', onDocumentKeyDown, false );
// 				document.addEventListener( 'keyup', onDocumentKeyUp, false );

// 				//

// 				window.addEventListener( 'resize', onWindowResize, false );

// 			}

// 			function onWindowResize() {

// 				camera.aspect = window.innerWidth / window.innerHeight;
// 				camera.updateProjectionMatrix();

// 				renderer.setSize( window.innerWidth, window.innerHeight );

// 			}

// 			function onDocumentMouseMove( event ) {

// 				event.preventDefault();
				
// 				// d3.event = event;
				
// 				// console.log(d3.mouse(document));

// 				mouse.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

// 				raycaster.setFromCamera( mouse, camera );
				
// 				var _sphere = scene.getObjectByName('sphere');
// 				// console.log(_sphere);

// 				// var intersects = raycaster.intersectObjects( objects );
// 				var intersects = raycaster.intersectObject( _sphere, false );

// 				if ( intersects.length > 0 ) {

// 					var intersect = intersects[ 0 ];

// 					interactiveCone.lookAt(intersect.point);

// 				}

// 				render();

// 			}

// 			function onDocumentMouseDown( event ) {

// 				event.preventDefault();

// 				mouse.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

// 				raycaster.setFromCamera( mouse, camera );
				
// 				// console.log(raycaster.intersectObject(scene, true));

// 				var intersects = raycaster.intersectObjects( objects );

// 				if ( intersects.length > 0 ) {

// 					var intersect = intersects[ 0 ];

// 					// delete cone

// 					if ( isShiftDown ) {

// 						if ( intersect.object != sphere ) {

// 							// scene.remove( intersect.object );
// 							sphere.remove( intersect.object );

// 							objects.splice( objects.indexOf( intersect.object ), 1 );

// 						}

// 					// create cone

// 					} else {

// 						// var placedCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
// 						var placedCone = interactiveCone.clone();
// 						placedCone.lookAt(intersect.point);
// 						// scene.add( placedCone );
// 						sphere.add(placedCone);

// 						objects.push( placedCone );

// 					}

// 					render();

// 				}

// 			}

// 			function onDocumentKeyDown( event ) {

// 				switch( event.keyCode ) {

// 					case 16: isShiftDown = true; break;

// 				}

// 			}

// 			function onDocumentKeyUp( event ) {

// 				switch ( event.keyCode ) {

// 					case 16: isShiftDown = false; break;

// 				}

// 			}

// 			function render() {

// 				// renderer.render( scene, camera );
				
// 				subject.onNext({
// 					scene,
// 					camera
// 				})

// 			}
			
    
    
//     view$.subscribe(view => {
//       // mesh.rotation.x = view.mesh.rotation.x;
//       // renderer.render( scene, camera );
//     });
    
//     return subject;
//   };
// }


// function windowSize() {
//   return stream
//     .fromEvent(window, 'resize')
//     .startWith({ target: window })
// }

function makeD3DomDriver(selection) {
	const container = d3.select(selection);
	const mouse = new THREE.Vector2();
	const sc = () => d3.scale.linear().range([-1, 1]).clamp(true);
	const ndc_scale = {
		x: sc(),
		y: sc()
	};
	const ndc = new THREE.Vector2();

	return function d3DomDriver(view$) {
		
		let container$ = stream.of(container);
		
		return {
			select: function(selector) {
				
				let selection$ = container$.map(c => c.select(selector));

				return {
					observable: selection$.map(s => s.nodes()),
					events: function(type) {
						return selection$
							.flatMap(selection => 
								stream.create(observer => 
									selection.on(type, function(d) {
										let arr = d3.mouse(this);
										mouse.set(arr[0], arr[1]);
										ndc.set(
											ndc_scale.x.domain([0, this.clientWidth])(mouse.x),
											ndc_scale.y.domain([0, this.clientHeight])(mouse.y)
										);
										observer.onNext({
											datum: d,
											node: this,
											event: d3.event,
											mouseArray: arr,
											mouse: mouse,
											ndc: ndc
										});
									})
								)
							);
					}
				};
			}
		};
	};
}


// var mutable = {
// 	value: 12
// };

// window.mutable = mutable;

// var root = stream.of(mutable);

// var a = root
// 	.map(d => d)
// 	.do(console.log.bind(console))
// 	// .subscribe()
	
// var b = root
// 	.map(d => {
// 		d.value = "breakfast";
// 		return d;
// 	})
// 	.do(console.log.bind(console))
// 	// .subscribe()
	
// var c = root
// 	.map(d => {
// 		d.value = 34;
// 		return d;
// 	})
// 	.do(console.log.bind(console))
// 	// .subscribe();
	
// stream.combineLatest(a,b,c).do(console.log.bind(console)).subscribe()

// debug('hello')('there');

// const _debug = debug('ivs:main');


// _debug('Hello from the app');