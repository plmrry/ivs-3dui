import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

export function component({ dom, cameras, scenes }) {
	const main_mouse$ = mouse
	  ({ 
  		dom$: dom.select('#main-canvas')
  	})
  	.shareReplay(1);
	
	const editor_mouse$ = mouse
	  ({
			dom$: dom.select('#editor-canvas')
		})
		.shareReplay(1);
	
	const main_camera$ = cameras
		// .map(select({ name: 'main' }))
		.select({ name: 'main' })
		.shareReplay(1);
	
	const main_intersect_targets$ = scenes
 		// .map(select({ name: 'main' }))
 		.select({ name: 'main' })
 		.map(scene => {
 			return [
 				{ key: 'children', targets: scene.children, recursive: true }
 			];
 		});
 		
 	const editor_intersect_targets$ = scenes
 		// .map(select({ name: 'editor' }))
 		.select({ name: 'editor' })
 		.map(scene => {
 			return [
 				{ key: 'children', targets: scene.children, recursive: true }
 			];
 		})
 		.shareReplay(1);
	
	const main_raycaster_model$ = main_mouse$
 		.withLatestFrom(
 			main_camera$,
 			main_intersect_targets$,
 			(mouse, camera, target_groups) => ({ mouse, camera, target_groups })
 		)
 		.map(obj => Object.assign(obj, { name: 'main' }));
 	
 	const editor_raycaster_model$ = editor_mouse$
 		.withLatestFrom(
 			// cameras.map(select({ name: 'editor' })),
 			cameras.select({ name: 'editor' }),
 			editor_intersect_targets$,
 			(mouse, camera, target_groups) => ({ mouse, camera, target_groups })
 		)
 		.map(obj => Object.assign(obj, { name: 'editor' }));
	
	const raycasters_model$ = stream
 		.combineLatest(
 			main_raycaster_model$,
 			editor_raycaster_model$.startWith(null)
 		)
 		.map(arr => arr.filter(d => d !== null));
	
 	const raycasters_state_reducer$ = raycasters_model$
 		.map(model => selectable => {
 			const join = d3_selection
 				.select(selectable)
 				.selectAll()
 				.data(model, d => d.name);
 				
 			const objects = join
 				.enter()
 				.append(function(d) {
 					return { 
 						raycaster: new THREE.Raycaster(),
 						event$: new Rx.ReplaySubject(1),
 						name: d.name
 					};
 				})
 				.merge(join)
 				.each(function(d) {
 					this.raycaster.setFromCamera(d.mouse.ndc, d.camera);
 					const intersect_groups = d.target_groups
 						.map(obj => {
 							obj.intersects = this.raycaster.intersectObjects(obj.targets, obj.recursive);
 							return obj;
 						});
 					this.event$.onNext({
 						event: d.mouse.event,
 						intersect_groups,
 						mouse: d.mouse
 					});
 				});
 				
 			return selectable;
 		});
 		
 	return raycasters_state_reducer$;
}

function mouse({ dom$ }) {
	const ndcScale$ = dom$
		.observable()
		.map(dom => dom.node())
  	.map(({ width, height }) => ({
  		x: d3.scale.linear().domain([0, width]).range([-1, +1]),
  		y: d3.scale.linear().domain([0, height]).range([+1, -1])
  	}));
	const drag_handler$ = dom$
  	.d3dragHandler();
  const event$ = stream
  	.merge(
  		drag_handler$.events('drag'),
  		drag_handler$.events('dragstart'),
  		drag_handler$.events('dragend'),
  		dom$.events('mousemove')
  	);
  const mouse$ = event$
  	.map((obj) => { 
  		obj.mouse = d3.mouse(obj.node);
  		return obj;
  	})
  	.withLatestFrom(
  		ndcScale$,
  		(event, ndcScale) => { 
  			event.ndc = {
  				x: ndcScale.x(event.mouse[0]), 
  				y: ndcScale.y(event.mouse[1]) 
  			};
  			return event;
  		}
  	);
  return mouse$;
}

function log(d) {
	console.log(d);
}