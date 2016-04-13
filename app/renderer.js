import debug from 'debug';
import _ from 'underscore';
import selection from 'd3-selection';
import 'd3-selection-multi';
import d3 from 'd3';
import combineLatestObj from 'rx-combine-latest-obj';
import THREE from 'three/three.min.js';

Object.assign(d3, selection);

export default function Renderer(sources) {
  const { main_size$, editor_size$ } = sources;
	return view(model(intent(sources)));
}

function intent(sources) { return sources; }

function model(actions) {
	const { main_size$, editor_size$ } = actions;
	return combineLatestObj
		({
			main_size$, editor_size$
		})
		.map(({ main_size, editor_size }) => {
			return [
				{
					name: 'main',
					size: main_size
				},
				{
					name: 'editor',
					size: editor_size
				}
			];
		});
}

function view(model$) {
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
			.append(function(d) {
				debug('renderer')('new renderer');
				let renderer = new THREE.WebGLRenderer({
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