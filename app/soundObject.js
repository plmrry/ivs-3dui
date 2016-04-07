import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

import { scoped_sound_cone } from './soundCone.js';

function intent({ dom, main_raycaster$, new_object_proxy$, add_object_click$ }) {
  const add_object_mode$ = stream
		.merge(
			add_object_click$.map(ev => true),
			new_object_proxy$.map(ev => false)
		)
		.startWith(false)
		.shareReplay(1);
  
  const new_object_key$ = new_object_proxy$
		.pluck('id');
  
  const select_object$ = main_raycaster$
		.filter(({ event }) => event.type === 'dragstart')
		.withLatestFrom(
			add_object_mode$,
			(event, mode) => ({ event, mode })
		)
		.filter(({ mode }) => mode !== true)
		.pluck('event', 'intersect_groups')
		.flatMapLatest(arr => stream.from(arr))
		.pluck('intersects', '0', 'object')
		.map(obj => {
			if (obj.name === 'sound_object') return d3.select(obj).datum().key;
			/** TODO: Better way of selecting parent when child cone is clicked? */
			if (obj.name === 'cone') return d3.select(obj.parent.parent).datum().key;
			return undefined;
		})
		.merge(new_object_key$);
		
	const add_cone$ = dom
		.select('#add-cone')
		.events('click')
		.withLatestFrom(
			select_object$,
			(ev, selected) => selected
		)
		.shareReplay(1);
		
  return {
    select_object$,
    add_cone$
  };
}

export function scoped_sound_object(id, position) {
  return function soundObject(sources) {
    
    const { raycasters } = sources;
	 
	  const { select_object$, add_cone$ } = intent(sources);
		
		const selected$ = select_object$
			.map(key => key === id)
			.startWith(true)
			.shareReplay();
			
		const position$ = stream.of(position);
		
		const volume$ = stream.of(Math.random() + 0.4);
		
		const isolated_raycaster = raycasters
  		.select({ name: 'editor' })
  		.pluck('event$')
  		.flatMapLatest(obs => obs)
		  .distinctUntilChanged()
		  .withLatestFrom(
		    selected$,
		    (event, selected) => ({ event, selected })
		  )
		  .filter(({ selected }) => selected)
		  .pluck('event');
		
		const new_cone$ = add_cone$
			.filter(key => key === id)
			.map((ev, index) => {
				return scoped_sound_cone(index)({ editor_raycaster$: isolated_raycaster });
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