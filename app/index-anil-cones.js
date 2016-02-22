import Cycle from '@cycle/core';
import {makeDOMDriver, div, input, p} from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';

const stream = Rx.Observable;

debug('ivs:main')('Hello from the app');

function main(drivers) {
  const view$ = stream.create((observer) => {
    let _x = 0;
    d3.timer(function(elapsed) {
      observer.onNext({
        mesh: {
          rotation: {
            x: (_x += 0.005)
          }
        }
      })
    })
  })
  return {
    custom: view$
  };
}

const drivers = {
  windowSize$: windowSize,
  custom: makeCustomDriver('#app')
};

Cycle.run(main, drivers);

function makeCustomDriver(selector) {
  let div = d3.select(selector);
			
  return function customDriver(view$) {

			var container;
			var camera, scene, renderer;
			var mouse, raycaster, isShiftDown = false;

			var interactiveCone, interactiveConeMaterial, interactiveConeGeo;
			var sphere;

			var objects = [];

			init();
			render();

			function init() {

				container = document.createElement( 'div' );
				document.body.appendChild( container );

				camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );
				camera.position.set( 500, 800, 1300 );
				camera.lookAt( new THREE.Vector3() );

				scene = new THREE.Scene();

				interactiveConeGeo = new THREE.CylinderGeometry(100, 0, 600, 100, 1, true);
				interactiveConeGeo.translate(0, 300, 0);
				interactiveConeGeo.rotateX(Math.PI/2.);
				interactiveConeMaterial = new THREE.MeshBasicMaterial({color: 0x80FFE5, opacity: 0.5});
				interactiveCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
				interactiveCone.material.side = THREE.DoubleSide;
				interactiveCone.material.transparent = true;
				scene.add( interactiveCone );

				//

				raycaster = new THREE.Raycaster();
				mouse = new THREE.Vector2();

				var geometry = new THREE.SphereBufferGeometry( 300, 100, 100 );

				sphere = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( {color: 0xFFFFFF, opacity: 0.6 } ) );
				sphere.material.transparent = true;
				scene.add( sphere );

				objects.push( sphere );

				// Lights

				var ambientLight = new THREE.AmbientLight( 0x606060 );
				scene.add( ambientLight );

				var directionalLight = new THREE.DirectionalLight( 0xffffff );
				directionalLight.position.set( 1, 0.75, 0.5 ).normalize();
				scene.add( directionalLight );

				renderer = new THREE.WebGLRenderer( { antialias: true } );
				renderer.setClearColor( 0xf0f0f0 );
				renderer.setPixelRatio( window.devicePixelRatio );
				renderer.setSize( window.innerWidth, window.innerHeight );
				container.appendChild( renderer.domElement );
				
				// d3.select(document).on('mousemove', onDocumentMouseMove);

				document.addEventListener( 'mousemove', onDocumentMouseMove, false );
				document.addEventListener( 'mousedown', onDocumentMouseDown, false );
				document.addEventListener( 'keydown', onDocumentKeyDown, false );
				document.addEventListener( 'keyup', onDocumentKeyUp, false );

				//

				window.addEventListener( 'resize', onWindowResize, false );

			}

			function onWindowResize() {

				camera.aspect = window.innerWidth / window.innerHeight;
				camera.updateProjectionMatrix();

				renderer.setSize( window.innerWidth, window.innerHeight );

			}

			function onDocumentMouseMove( event ) {

				event.preventDefault();
				
				// d3.event = event;
				
				// console.log(d3.mouse(document));

				mouse.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

				raycaster.setFromCamera( mouse, camera );

				var intersects = raycaster.intersectObjects( objects );

				if ( intersects.length > 0 ) {

					var intersect = intersects[ 0 ];

					interactiveCone.lookAt(intersect.point);

				}

				render();

			}

			function onDocumentMouseDown( event ) {

				event.preventDefault();

				mouse.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

				raycaster.setFromCamera( mouse, camera );

				var intersects = raycaster.intersectObjects( objects );

				if ( intersects.length > 0 ) {

					var intersect = intersects[ 0 ];

					// delete cone

					if ( isShiftDown ) {

						if ( intersect.object != sphere ) {

							scene.remove( intersect.object );

							objects.splice( objects.indexOf( intersect.object ), 1 );

						}

					// create cone

					} else {

						var placedCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
						placedCone.lookAt(intersect.point);
						scene.add( placedCone );

						objects.push( placedCone );

					}

					render();

				}

			}

			function onDocumentKeyDown( event ) {

				switch( event.keyCode ) {

					case 16: isShiftDown = true; break;

				}

			}

			function onDocumentKeyUp( event ) {

				switch ( event.keyCode ) {

					case 16: isShiftDown = false; break;

				}

			}

			function render() {

				renderer.render( scene, camera );

			}
			
    const subject = new Rx.Subject();
    
    view$.subscribe(view => {
      // mesh.rotation.x = view.mesh.rotation.x;
      // renderer.render( scene, camera );
    });
  };
}


function windowSize() {
  return stream
    .fromEvent(window, 'resize')
    .startWith({ target: window })
}