import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import log from './log.js';

const stream = Rx.Observable;

export function component({ 
	add_object_click$, camera_is_birds_eye$, dom, size$, main_floor_delta$
}) {
	const { orbit$, move_to_birds_eye$ } = intent({
		add_object_click$,
		camera_is_birds_eye$,
		dom,
		size$
	});
	
	const cameras_model$ = model({ orbit$, move_to_birds_eye$, size$, main_floor_delta$ });
	
	const cameras_state_reducer$ = view(cameras_model$);
	
	return {
		cameras_state_reducer$,
		cameras_model$
	};
}

export function view(cameras_model$) {
	return cameras_model$
		.map(cameras => state_reducer(cameras));
}

export function intent({ 
	add_object_click$, camera_is_birds_eye$, dom
}) {
	const auto_birds_eye$ = add_object_click$
		.withLatestFrom(
			camera_is_birds_eye$,
			(ev, birds) => birds
		)
		.filter(d => !d);
		
	const birds_eye_button$ = dom
		.select('#camera-to-birds-eye')
		.events('click');
		
	const move_to_birds_eye$ = stream
		.merge(
			auto_birds_eye$,
			birds_eye_button$
		);
		
	const orbit$ = dom
		.select('#orbit-camera')
		.d3dragHandler()
		.events('drag')
		.pluck('event')
		.shareReplay(1);
		
	return {
		move_to_birds_eye$,
		orbit$
		// size$
	};
}

export function model({ orbit$, move_to_birds_eye$, size$, main_floor_delta$ }) {
	
	const panning_offset$ = main_floor_delta$
		.filter(({ start: { objects } }) => objects.length === 0)
		.pluck('delta')
		.map(({ x, z }) => ({ x, y: 0, z }))
		.startWith({
			x: 0,
			y: 0,
			z: 0
		})
		.scan((a,b) => {
			return {
				x: a.x + b.x,
				y: 0,
				z: a.z + b.z
			};
		});
    
	const MAX_LATITUDE = 89.9;
	const MIN_LATITUDE = 5;
	
	// const to_birds_eye$ = actions.move_to_birds_eye$
	const to_birds_eye$ = move_to_birds_eye$
		.flatMap(ev => {
			let destination = MAX_LATITUDE;
      return d3TweenStream(500)
        .scan((last, t) => ({ t: t, dt: t - last.t }), { t: 0, dt: 0 })
        .map(({ t, dt }) => {
          return position => {
            let speed = (1-t) === 0 ? 0 : (destination - position)/(1 - t);
            let step = position + dt * speed;
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
	
	const delta_latitude$ = orbit$
		.pluck('dy')
		.map(dy => lat => {
			const new_lat = lat - dy;
			if (new_lat >= MAX_LATITUDE) return MAX_LATITUDE;
			if (new_lat <= MIN_LATITUDE) return MIN_LATITUDE;
			return new_lat;
		});
		
	const latitude$ = stream
		.merge(
			delta_latitude$,
			to_birds_eye$
		)
		.startWith(45)
		.scan((theta, fn) => fn(theta))
		.shareReplay(1);
		
	const is_max_lat$ = latitude$
		.map(lat => lat >= MAX_LATITUDE);
		
	const longitude$ = orbit$
		.pluck('dx')
		.startWith(45)
		.scan((a,b) => a+b)
		.shareReplay(1);
		
	const theta$ = latitude$
		.map(latitude_to_theta);
		
	const phi$ = longitude$
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
	
	const lookAt$ = panning_offset$;
	
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

	const lat_lng$ = combineLatestObj
		({
			latitude$, longitude$, is_max_lat$
		});
		
	const main_camera$ = combineLatestObj({
			// position_and_lookAt$,
			position$,
			// lookAt$: panning_offset$,
			lookAt$,
			// size$: actions.size$,
			size$,
			lat_lng$,
			// panning_offset$
		})
		.map(({ position, lookAt, size, lat_lng }, index) => {
			return {
				name: 'main',
				size: size,
				position: position,
				zoom: 40,
				lookAt: lookAt,
				lat_lng
				// index
				// panning_offset
			};
		})
		// .distinctUntilChanged(d => d.index)
		// .do(d => log(d.position))
		
	const editor_camera$ = stream
		.just({
			name: 'editor',
			size: {
				width: 300,
				height: 300
			},
			position: {
				x: 0, y: 0, z: 10
			},
			zoom: 50
		});
		
	return stream
		.combineLatest(
			main_camera$,
			editor_camera$
		);
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
          // this.lookAt(d.lookAt || new THREE.Vector3());
          // this.up.copy(new THREE.Vector3(0, 1, 0));
          /** Apparently we do not need to call `updateProjectionMatrix()` */
        }
        this.lookAt(d.lookAt || new THREE.Vector3());
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

// function log(d) {
// 	console.log(d);
// }