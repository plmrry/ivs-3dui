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
      
    let camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 1000 );
    var scene, renderer;
  	var mesh;
  
  	init();
  
  	function init() {

  		camera.position.z = 400;
  
  		scene = new THREE.Scene();
  
  		var geometry = new THREE.BoxGeometry( 200, 200, 200 );
  		var material = new THREE.MeshBasicMaterial({ wireframe: true });
  
  		mesh = new THREE.Mesh( geometry, material );
  		scene.add( mesh );
  
  		renderer = new THREE.WebGLRenderer();
  		renderer.setPixelRatio( window.devicePixelRatio );
  		renderer.setSize( window.innerWidth, window.innerHeight );
  		document.body.appendChild( renderer.domElement );
  
  		window.addEventListener( 'resize', onWindowResize, false );
  
  	}
  
  	function onWindowResize() {
  
  		camera.aspect = window.innerWidth / window.innerHeight;
  		camera.updateProjectionMatrix();
  
  		renderer.setSize( window.innerWidth, window.innerHeight );
  
  	}
			
    const subject = new Rx.Subject();
    
    view$.subscribe(view => {
      mesh.rotation.x = view.mesh.rotation.x;
      renderer.render( scene, camera );
    });
  };
}


function windowSize() {
  return stream
    .fromEvent(window, 'resize')
    .startWith({ target: window })
}