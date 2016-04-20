import debug from 'debug';
import _ from 'underscore';
import selection from 'd3-selection';
import 'd3-selection-multi';
import d3 from 'd3';
import combineLatestObj from 'rx-combine-latest-obj';
import THREE from 'three/three.min.js';

Object.assign(d3, selection);

export function view(model$) {
	return model$.map(state_reducer);
}

function state_reducer(model) {
  return function(selectable) {
		const join = d3
			.select(selectable)
			.selectAll()
			.data(model);
			
		const renderers = join
			.enter()
			.append(function({ name }) {
				debug('renderer')('new renderer');
				let renderer = new THREE.WebGLRenderer({
					antialias: true
				});
				renderer.shadowMap.enabled = true;
				renderer.shadowMap.type = THREE.PCFSoftShadowMap;
				renderer.setClearColor(0xf0f0f0);
				return {
				  name,
				  renderer
				};
			})
			.merge(join)
			.each(function(d) {
				const currentSize = this.renderer.getSize();
				const diff = _.difference(_.values(currentSize), _.values(d.size));
				if (diff.length > 0) {
					debug('renderer')('set size');
					this.renderer.setSize(d.size.width, d.size.height);
				}
			});
    
    return selectable;
	};
}