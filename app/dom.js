import selection from 'd3-selection';
import 'd3-selection-multi';
import d3 from 'd3';
import combineLatestObj from 'rx-combine-latest-obj';

import log from './utilities/log.js';

Object.assign(d3, selection);

export function view(model$) {
	return model$
		.map(model => dom => {
			dom.datum(model);
			
			const main_join = dom
				.selectAll('main')
				.data(d => d.mains || []);
				
			const main_enter = main_join
				.enter()
				.append('main')
				.merge(main_join)
				.each(function(d) {
					d3.select(this)
						.styles(d.styles);
				});
				
			const main_canvas = main_enter
				.selectAll('canvas')
				.data(d => d.canvases || []);
				
			main_canvas
				.enter()
				.append(d => d)
				.attr('id', 'main-canvas');
				
			const controls_join = main_enter
				.selectAll('.controls')
				.data(controls_data);
				
			const controls_enter = controls_join
				.enter()
				.append('div')
				.attr('class', d => d.class)
				.classed('controls', true)
				.attr('id', d => d.id)
				.style('position', 'absolute')
				.each(function(d) {
					d3.select(this)
						.styles(d.styles);
				});
				
			controls_enter
				.selectAll('button')
				.data(d => d.buttons || [])
				.enter()
				.append('button')
				.styles({
					background: 'none',
					border: 'none'
				})
				.classed('btn btn-lg btn-secondary', true)
				.append('i')
				.classed('material-icons', true)
				.style('display', 'block')
				.text(d => d.text);
				
			addObjectButton(controls_enter);
			devControls(controls_enter);
				
			return dom;
		});
}

function devControls(controls_enter) {
	const buttons = [
		['add renderer', 'add-renderer'],
		['delete renderer', 'delete-renderer']
	].map(([text,id]) => ({id,text}));
	controls_enter
		.filter('#dev-controls')
		.selectAll('button')
		.data(buttons)
		.enter()
		.append('button')
		.attr('id', d => d.id)
		.text(d => d.text);
}

function addObjectButton(controls_enter) {
	controls_enter
		.filter('#scene-controls')
		.selectAll('.add-buttons')
		.data(['add-object'])
		.enter()
		.append('div')
		.classed('row add-buttons', true)
		.append('div')
		.classed('col-xs-12', true)
		.style('margin-top', '-5px')
		.append('button')
		.classed('btn btn-lg btn-primary', true)
		.attr('id', d => d)
		.append('i')
		.classed('material-icons', true)
		.style('display', 'block')
		.text('add');
}

const controls_data = [
	{
		id: 'file-controls',
		styles: {
			left: 0,
			top: 0
		},
		buttons: [
			'volume_up', "save", "open_in_browser"
		].map(text => ({ text }))
	},
	{
		id: 'scene-controls',
		class: 'container',
		styles: {
			right: 0,
			top: 0
		}
	},
	{
		id: 'zoom-controls',
		styles: {
			right: 0,
			bottom: '1%'
		},
		buttons: [
			['zoom-in','zoom_in'],
			['zoom-out','zoom_out']
		].map(([id,text]) => ({id,text}))
	},
	{
		id: 'dev-controls',
		styles: {
			left: 0,
			bottom: 0
		}
	}
];

