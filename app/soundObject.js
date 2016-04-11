import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import log from './log.js';

const stream = Rx.Observable;

function subtractVectors(a, b) {
	return {
		x: a.x - b.x,
		y: a.y - b.y,
		z: a.z - b.z
	};
}

function addVectors(a, b) {
	return {
		x: a.x + b.x,
		y: a.y + b.y,
		z: a.z + b.z
	};
}

export function scoped_sound_object_2(id) {
	return function soundObject({ object_drag$, props$ }) {
		const obj = {
			key: id,
			name: 'sound_object',
			position: {
				x: Math.random() * 2,
				y: 1,
				z: 1
			},
			volume: 1,
			material: {
				color: 'ffdddd'
			},
			cones: [],
			selected: true
		};
		object_drag$
			.subscribe(log);
		// return props$;
		// const position$ = 
		return stream.just(obj);
	};
}

export function scoped_sound_object(id, initial_position) {
  return function soundObject({ selected_object$, add_cone$, object_drag$, dom }, createCone, cone_action$) {
  	debug('event:object')('new', id);
  	
		const selected$ = selected_object$
			.map(key => key === id)
			.startWith(true);
			
		const drag$ = object_drag$
  		.filter(({ drag: { start: { first_object_key } } }) => first_object_key === id);
  		/** or use selected$ ??? */
  		
  	const drag_x_z$ = drag$
  		.filter(({ camera }) => camera === true)
  		.map(({ drag: { delta: { x, z } } }) => ({ x, y: 0, z }) )
  		// .map(delta => position => addVectors(position, delta));
  		.map(delta => position => subtractVectors(position, delta));
  		// .subscribe(d => log('faaabbb', d));
			
		// const position$ = stream.of(position);
		const position$ = stream
			.merge(
				drag_x_z$
			)
			.startWith(initial_position)
			.scan(apply)
			// .shareReplay(500);
		
		const volume$ = stream.of(Math.random() + 0.4);
		
		const new_cone$ = add_cone$
			.withLatestFrom(
				selected$,
				(event, selected) => selected
			)
			.filter(selected => selected)
			.map((_, index) => index)
			.map(createCone)
			.do(debug('event:add-cone'));

		// const cones$ = new_cone$
		// 	.pluck('model$')
		// 	.map(obs => obs.shareReplay(1))
		// 	.map(new_cone => cones => {
		// 		return cones.concat(new_cone);
		// 	})
		// 	.scan(apply, [])
		// 	.flatMapLatest(stream.combineLatest)
		// 	.startWith([])
		// 	// .do(arr => debug('event:cones')(arr.map()))
		
		const cones$ = stream.just([]);
			
		const color$ = selected$
			.map(selected => selected ? '66c2ff' : 'ffffff');
			
		const model$ = combineLatestObj
			({
				cones$,
				selected$,
				position$,
				volume$,
				color$
			})
			.map(({ cones, selected, position, volume, color }) => ({
				key: id,
				name: 'sound_object',
				position: {
					x: position.x,
					y: position.y,
					z: position.z
				},
				volume,
				material: {
					color
				},
				cones,
				selected
			}))
			// .shareReplay();
			
		return {
			id,
			model$
		};
	};
}

function apply(o, fn) { return fn(o); }