import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

// function intent({ editor_raycaster$ }) {
  
//   // const editor_raycaster$ = raycasters
// 		// .select({ name: 'editor' })
// 		// .pluck('event$')
// 		// .flatMapLatest(obs => obs)
// 		// .distinctUntilChanged();
		
// 	const editor_mousemove_panel$ = editor_raycaster$
// 		.pluck('intersect_groups')
// 		.flatMap(arr => stream.from(arr))
// 		.filter(d => d.key === 'children')
// 		.pluck('intersects', '0', 'point');
			
//   return {
//     editor_mousemove_panel$
//   }
// }

export function scoped_sound_cone(id) {
	return function cone({ 
		editor_mousemove_panel$ 
	}) {
	  
		const DEFAULT_CONE_VOLUME = 1;
		const DEFAULT_CONE_SPREAD = 0.5;
		
		const volume$ = stream.just(1);
		
		const spread$ = stream.just(0.5);
		
		const interactive$ = stream.just(true);
		
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
      });
		
		const model$ = combineLatestObj
		  ({
		    volume$, spread$, lookAt$, interactive$
		  });
			
		return {
			id,
			model$
		};
	};
}

function apply(o, fn) { return fn(o); }
function log(d) { console.log(d); }