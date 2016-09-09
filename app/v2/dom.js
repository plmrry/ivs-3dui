/* jshint esversion: 6 */

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

			const editor_cards = editorCards(dom);
			editorCanvas(editor_cards);
			editorButtons(editor_cards);
			const card_blocks = cardBlocks(editor_cards);

			console.log(model.editorCards);

			const card_blocks_rows_join = card_blocks
				.selectAll('.row')
				.data(d => d.rows || []);

			const card_blocks_rows = card_blocks_rows_join
				.enter()
				.append('div')
				.classed('row parameter', true)
				.merge(card_blocks_rows_join);

			const card_blocks_rows_cols = card_blocks_rows
				.selectAll('div')
				.data(d => d.columns || []);

			card_blocks_rows_cols
				.enter()
				.append('div')
				.attr('class', d => d.class)
				.attr('id', d => d.id)
				.append('span')
				.attr('class', d => d.span_class)
				.each(function(d) {
					d3.select(this)
						.style(d.span_style);
				});

			card_blocks_rows_cols
				.select('span')
				.text(d => d.text);

			return dom;
		});
}

function cardBlocks(editor_cards) {
	const card_blocks_join = editor_cards
		.selectAll('.card-block')
		.data(d => d.card_blocks || []);
	card_blocks_join
		.exit()
		.remove();
	const card_blocks_enter = card_blocks_join
		.enter()
		.append('div')
		.classed('card-block', true);
	card_blocks_enter
		.append('h6')
		.classed('card-title', true);
	const card_blocks = card_blocks_enter
		.merge(card_blocks_join);
	card_blocks
		.select('.card-title')
		.attr('id', d => d.id)
		.text(d => d.header);
	return card_blocks;
}

function editorButtons(editor_cards) {
	const editor_buttons = editor_cards
		.selectAll('button')
		.data(d => d.buttons || []);
	editor_buttons
		.enter()
		.append('button')
		.attr('id', d => d.id)
		.text(d => d.text)
		.each(function(d) {
			d3.select(this)
				.style(d.style);
		});
}

function editorCanvas(editor_cards) {
	const editor_canvas = editor_cards
		.selectAll('canvas')
		.data(d => d.canvases || []);
	editor_canvas
		.enter()
		.append(d => d.node)
		.attr('id', 'editor-canvas');
}

function editorCards(dom) {
	const editor_cards_join = dom
		.select('#scene-controls')
		.selectAll('.card')
		.data(d => d.editorCards || []);
	editor_cards_join
		.exit()
		.remove();
	const editor_cards = editor_cards_join
		.enter()
		.append('div')
		.classed('card', true)
		.each(function(d) {
			d3.select(this)
				.style(d.style);
		})
		.merge(editor_cards_join);
	return editor_cards;
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
