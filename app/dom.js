import selection from 'd3-selection';
import 'd3-selection-multi';
import d3 from 'd3';
Object.assign(d3, selection);

export default function component(sources) {
	return view(model(intent(sources)));
}

function intent(sources) {
	return sources;
}

function model(actions) {
	const { main_size$ } = actions;
	
	return main_size$
		.map(main_size => ({
			mains: [
				{
					styles: {
						height: `${main_size.height}px`,
						width: `${main_size.width}px`
					}
				}
			]
		}));
}

function view(model$) {
	return model$
		.map(model => dom => {
			dom.datum(model);
			
			const main_join = dom
				.selectAll('main')
				.data(d => d.mains || []);
				
			const main_enter = main_join
				.enter()
				.append('main');
				
			const main = main_enter
				.merge(main_join)
				.each(function(d) {
					d3.select(this)
						.styles(d.styles);
				});
				
			const main_canvas = main
				.selectAll('canvas')
				.data(d => d.canvases || []);
				
			// main_canvas
			// 	.enter()
			// 	.append(d => d.node)
			// 	.attr('id', 'main-canvas');
				
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
				
			fileButtons(controls_enter);
			addObjectButton(controls_enter);
			zoomButtons(controls_enter);
				
			return dom;
		});
}

function zoomButtons(controls_enter) {
	const camera_buttons = [
		{
			id: 'zoom-in',
			text: 'zoom_in'
		},
		{
			id: 'zoom-out',
			text: 'zoom_out'
		}
	];
	controls_enter
		.filter('#zoom-controls')
		.selectAll('button')
		.data(camera_buttons)
		.enter()
		.append('button')
		.styles({
			background: 'none',
			border: 'none'
		})
		.classed('btn btn-lg btn-secondary', true)
		.attr('id', d => d.id)
		.append('i')
		.classed('material-icons', true)
		.style('display', 'block')
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
		.append('div')
		.classed('btn-group modes pull-right', true)
		.append('button')
		.classed('btn btn-lg btn-primary', true)
		.attr('id', d => d)
		.append('i')
		.classed('material-icons', true)
		.style('display', 'block')
		.text('add');
}

function fileButtons(controls_enter) {
	const file_buttons = [
		"volume_up", "save", "open_in_browser"
	];
	controls_enter
		.filter('#file-controls')
		.selectAll('button')
		.data(file_buttons)
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
		.text(d => d);
}

const controls_data = [
	{
		id: 'file-controls',
		styles: {
			left: 0,
			top: 0
		},
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
		}
	}
];

