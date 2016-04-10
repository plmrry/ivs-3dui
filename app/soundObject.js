import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import log from './log.js';

const stream = Rx.Observable;

export function scoped_sound_object(id, position) {
  return function soundObject({ selected_object$, add_cone$, dom }, createCone, cone_action$) {
  	debug('event:object')('new', id);
  	
		const selected$ = selected_object$
			.map(key => key === id)
			.startWith(true);
			
		const position$ = stream.of(position);
		
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
			}));
			
		return {
			id,
			model$
		};
	};
}

function apply(o, fn) { return fn(o); }