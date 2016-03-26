import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

export function component({ dom$, size$ }) {
	
	const orbit$ = dom$
    .select('#orbit_camera')
    .d3dragHandler()
    .events('drag')
    .pluck('event')
    .shareReplay();
    
	const MAX_LATITUDE = 89.99;
	const MIN_LATITUDE = 5;
	
	const to_birds_eye$ = dom$
		.select('#camera_to_birds_eye')
		.events('click')
		.flatMap(ev => {
			let destination = MAX_LATITUDE;
      return d3TweenStream(500)
        .scan((last, t) => ({ t: t, dt: t - last.t }), { t: 0, dt: 0 })
        .map(({ t, dt }) => {
          return p => {
            let speed = (1-t) === 0 ? 0 : (destination - p)/(1 - t);
            let step = p + dt * speed;
            let next = t === 1 ? destination : step;
            return next;
          };
        });
    });
	
	const latitude_to_theta = d3.scale.linear()
		.domain([90, 0, -90])
		.range([0, Math.PI/2, Math.PI]);
		
	const longitude_to_phi = d3.scale.linear()
		.domain([0, 360])
		.range([0, 2 * Math.PI]);
	
	const delta_theta$ = orbit$
		.pluck('dy')
		.map(dy => theta => theta - dy);
		
	const theta$ = stream
		.merge(
			delta_theta$, to_birds_eye$
		)
		.startWith(45)
		.scan((theta, fn) => fn(theta))
		.map(lat => {
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
				name: 'main',
				size: size,
				position: position,
				zoom: 40,
				lookAt: lookAt
			};
		});
		
	const editor_camera$ = stream
		.just({
			name: 'editor',
			size: {
				width: 300,
				height: 300
			},
			position: {
				x: 10, y: 1, z: 0
			},
			zoom: 50
		});
		
	return stream
		.combineLatest(
			main_camera$,
			editor_camera$
		)
}

export function state_reducer(model) {
  return function(selectable) {
    const cameras = d3_selection
      .select(selectable)
      .selectAll()
      .data(model);
    
    cameras
      .enter()
      .append(function(d) {
        debug('camera')('new camera');
        let cam = new THREE.OrthographicCamera();
        cam.name = d.name;
        return cam;
      })
      .merge(cameras)
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
          this.lookAt(d.lookAt || new THREE.Vector3());
          this.up.copy(new THREE.Vector3(0, 1, 0));
          /** Apparently we do not need to call `updateProjectionMatrix()` */
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
    	
    return selectable;
  };
}

export function updateCameras(view, _state, state) {
	let cameras = _state.cameras.selectAll().data(view.cameras);
			
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
			  this.lookAt(d.lookAt || new THREE.Vector3());
			  this.up.copy(new THREE.Vector3(0, 1, 0));
			  /** Apparently we do not need to call `updateProjectionMatrix()` */
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

export function updateCamera() {
  console.log('TEST')
}

export function again() {
  console.log('AGAIN')
}

function d3TweenStream(duration, name) {
  return stream.create(function(observer) {
    return d3.select({})
      .transition()
      .duration(duration)
      .ease('linear')
      .tween(name, function() {
        return function(t) {
          return observer.onNext(t);
        };
      })
      .each("end", function() {
        return observer.onCompleted();
      });
  });
}

function polarToVector({ radius, theta, phi }) {
	return {
		x: radius * Math.sin(phi) * Math.sin(theta),
		z: radius * Math.cos(phi) * Math.sin(theta),
		y: radius * Math.cos(theta)
	};
}