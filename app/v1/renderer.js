import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

export function component({ size$, editor_size$ }) {
		const renderers_model$ = combineLatestObj
			({
				size$, editor_size$
			})
			.map(({ size, editor_size }) => {
				return [
					{
						name: 'main',
						size: size
					},
					{
						name: 'editor',
						size: editor_size
					}
				];
			});
			
		const renderers_state_reducer$ = renderers_model$
			.map(state_reducer);
			
		return renderers_state_reducer$;
	}

export function state_reducer(model) {
  return function(selectable) {
    const join = d3_selection
				.select(selectable)
				.selectAll()
				.data(model);
				
		const renderers = join
			.enter()
			.append(function(d) {
				debug('renderer')('new renderer');
				let renderer = new THREE.WebGLRenderer({
					canvas: d.canvas_node,
					antialias: true
				});
				renderer._type = 'renderer';
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFSoftShadowMap;
				renderer.name = d.name;
				renderer._id = d.name;
				renderer.setClearColor(0xf0f0f0);
				return renderer;
			})
			.merge(join)
			.each(function(d) {
				let current = this.getSize();
				let diff = _.difference(_.values(current), _.values(d.size));
				if (diff.length > 0) {
					debug('renderer')('set size');
					this.setSize(d.size.width, d.size.height);
				}
			});
    
    return selectable;
  };
}