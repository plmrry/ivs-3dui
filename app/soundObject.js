import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

function scoped_cone(id) {
	return function cone(actions) {
		const DEFAULT_CONE_VOLUME = 1;
		const DEFAULT_CONE_SPREAD = 0.5;
		
		const move_interactive_update$ = actions.move_interactive_cone$
			.map(point => cone => {
				if (cone.interactive === true) cone.lookAt = point;
				return cone;
			});
			
		const model_update$ = stream
			.merge(
				move_interactive_update$
			);
			
		const model$ = model_update$
			.startWith({
				volume: DEFAULT_CONE_VOLUME,
				spread: DEFAULT_CONE_SPREAD,
				lookAt: {
					x: Math.random(),
					y: Math.random(),
					z: Math.random()
				},
				interactive: true
			})
			.scan(apply)
			.shareReplay(1);
			
		return {
			id,
			model$
		};
	};
}

export function scoped_sound_object(id, position) {
	return function soundObject(actions) {
		
		const selected$ = actions.select_object$
			.map(key => key === id)
			.startWith(true)
			.shareReplay();
			
		const position$ = stream.of(position);
		
		const volume$ = stream.of(Math.random() + 0.4);
		
		const move_interactive_cone$ = actions.interactive_cone_lookat$
			.withLatestFrom(
				selected$,
				(event, selected) => ({ event, selected })
			)
			.filter(({ selected }) => selected)
			.pluck('event', 'point');
			
		const cone_actions = {
			move_interactive_cone$
		};
		
		const new_cone$ = actions.add_cone$
			.filter(key => key === id)
			.map((ev, index) => {
				return scoped_cone(index)(cone_actions);
			});
			
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