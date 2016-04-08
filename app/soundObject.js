import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

export function scoped_sound_object(id, position) {
  return function soundObject(
  	{ selected_object$, add_cone$ },
  	createCone
  ) {
		const selected$ = selected_object$
			.map(key => key === id)
			.startWith(true)
			.shareReplay();
			
		const position$ = stream.of(position);
		
		const volume$ = stream.of(Math.random() + 0.4);
		
		const new_cone$ = add_cone$
			.withLatestFrom(
				selected$,
				(event, selected) => selected
			)
			.filter(selected => selected)
			.map(createCone);
			
		const cones$ = new_cone$
			.map(new_cone => cones => {
				return cones.concat(new_cone);
			})
			.startWith([])
			.scan(apply)
			.map(arr => arr.map(d => d.model$))
			.flatMapLatest(stream.combineLatest)
			.startWith([]);
			
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