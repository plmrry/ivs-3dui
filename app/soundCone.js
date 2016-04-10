import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import log from './log.js';

const stream = Rx.Observable;

export function scoped_sound_cone(id) {
	return function cone({ 
		raycasters,
		editor_mousemove_panel$,
		editor_dragstart$
	}) {
	  debug('event:cone')('new', id);
	  
		const DEFAULT_CONE_VOLUME = 1;
		const DEFAULT_CONE_SPREAD = 0.5;
		
		const volume$ = stream.just(1);
		
		const spread$ = stream.just(0.5);
		
		// const editor_raycaster$ = raycasters
		// 	.select({ name: 'editor' })
		// 	.pluck('event$')
		// 	.flatMapLatest(obs => obs)
		//   .distinctUntilChanged();
		
		// const editor_dragstart$ = editor_raycaster$
		// 	.filter(({ event }) => event.type === 'dragstart');
			
		// const editor_mousemove$ = editor_raycaster$
		// 	.filter(({ event }) => event.type === 'mousemove');
		
		// const editor_mousemove_panel$ = editor_mousemove$
		// 	.pluck('intersect_groups')
		// 	.flatMap(arr => stream.from(arr))
		// 	.filter(d => d.key === 'children')
		// 	.pluck('intersects', '0', 'point');
		
		const interactive$ = editor_dragstart$
			.map(() => false)
			.startWith(true)
			.shareReplay(1)
			
		// const interactive$ = stream.just(true);
			
		const selected$ = interactive$;
		
		const color$ = selected$
			.map(selected => selected ? "#66c2ff" : 'ffffff');
		
		const lookAt$ = editor_mousemove_panel$
	    .withLatestFrom(
	      interactive$,
	      (point, interactive) => ({ point, interactive })
      )
      .filter(({ interactive }) => interactive)
      .pluck('point')
      .startWith({
        x: Math.random(),
  			y: Math.random(),
  			z: Math.random()
      })
      .shareReplay(1);
		
		const model$ = combineLatestObj
		  ({
		    volume$, spread$, lookAt$, interactive$, selected$
		  })
		  .do(obj => console.log('model', id, obj.lookAt))
			
		return {
			id,
			model$
		};
	};
}

function apply(o, fn) { return fn(o); }
// function log(d) { console.log(d); }