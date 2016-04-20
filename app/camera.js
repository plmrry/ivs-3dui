import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import log from './utilities/log.js';

const stream = Rx.Observable;

export function view(model$) {
	return model$.map(state_reducer);
}

function state_reducer(model) {
  return function(selectable) {
    const join = d3
      .select(selectable)
      .selectAll()
      .data(model);
    
    join
      .enter()
      .append(function({ name }) {
        debug('camera')('new camera');
        const camera = new THREE.OrthographicCamera();
        return {
          name,
          camera
        };
      })
      .merge(join)
      .each(function(d) {
        const { camera } = this;
        /** Update camera size if needed */
        if (! _.isMatch(this.size, d.size)) {
        	debug('camera')('update size');
        	var s = d.size;
        	[ camera.left, camera.right ] = [-1,+1].map(d => d * s.width * 0.5);
        	[ camera.bottom, camera.top ] = [-1,+1].map(d => d * s.height * 0.5);
        	camera.updateProjectionMatrix();
        	this.size = s;
        }
        /** Update position */
        if (! _.isMatch(camera.position, d.position)) {
          debug('camera')('update position');
          camera.position.copy(d.position);
        }
        /** Update lookAt */
        if (! _.isMatch(this.lookAt, d.lookAt)) {
          this.lookAt = d.lookAt;
          camera.lookAt(d.lookAt || new THREE.Vector3());
        }
        /** Update camera zoom */
        if (camera.zoom !== d.zoom) {
        	debug('camera')('update zoom');
        	camera.zoom = d.zoom;
        	camera.updateProjectionMatrix();
        }
      });
    	
    return selectable;
  };
}
// /**
// * NOTE: You could, in theory, raycast from the middle of the camera's
// * view to the floor in order to get the "current lookat". But that's
// * a little crazy, don't you think?
// */
// /** Update lookAt always? */
// camera.lookAt(d.lookAt || new THREE.Vector3());
// this.lookAt(d.lookAt || new THREE.Vector3());
// camera.up.copy(new THREE.Vector3(0, 1, 0));
/** Apparently we do not need to call `updateProjectionMatrix()` */