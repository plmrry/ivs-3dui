import debug from 'debug';
import d3 from 'd3';
import _ from 'underscore';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

export function component({ renderers, selected$, size$, editor_size$ }) {
	const main_canvas$ = renderers
		.select({ name: 'main' })
		.map(renderer => renderer.domElement);
		
	// const editor_dom$ = selected$
	// 	.map(s => {
	// 		if (typeof s === 'undefined' || s === null) return [];
	// 		return [s];
	// 	});
	
	const editor_dom$ = selected$
		.withLatestFrom(
			renderers.select({ name: 'editor' }),
			editor_size$,
			(s, r, size) => ({ selected: s, renderer: r, size })
		)
		.map(({ selected, renderer, size }) => {
			if (typeof selected === 'undefined') return [];
			const selected_cones = selected.cones || [];
			const selected_cone = selected_cones.filter(d => d.selected)[0];
			const object_renderer_card = { 
					canvases: [ { node: renderer.domElement } ],
					style: {
						position: 'relative',
						height: `${size.height}px`
					},
					buttons: [
						{
							id: 'add-cone',
							text: 'add cone',
							style: {
								position: 'absolute',
								right: 0,
								bottom: 0
							}
						}
					]
				};
			const cone_info_card_block = typeof selected_cone !== 'undefined' 
				? {
					id: 'cone-card',
					header: `Cone ${selected.key}.${selected_cone.key}`
				} 
				: undefined;
			const object_info_card_block = selected.name === 'sound_object' ? {
				id: 'object-card',
				header: `Object ${selected.key}`,
				rows: getObjectInfoRows(selected)
			} : undefined;
			const info_card = {
				card_blocks: [
					object_info_card_block,
					cone_info_card_block
				].filter(d => typeof d !== 'undefined')
			};
			const cards = [
				selected.name === 'sound_object' ? object_renderer_card : undefined,
				info_card,
				selected.name === 'foo-bar' ? object_renderer_card : undefined
			].filter(d => typeof d !== 'undefined');
			return { cards, size };
		});
		
	const dom_model$ = model({ main_canvas$, editor_dom$, size$ });
	
	const dom_state_reducer$ = view(dom_model$);
	
	return dom_state_reducer$;
}

export function model({ main_canvas$, editor_dom$, size$ }) {
  const dom_model$ = combineLatestObj
		({
			main_canvas$,
			editor_dom$,
			size$
		})
		.map(({ main_canvas, editor_dom, size }) => {
			return {
				main: {
					canvases: [
						{
							node: main_canvas
						}
					],
					size
				},
				editor_cards: editor_dom.cards,
				editor_size: editor_dom.size
			};
		});
	return dom_model$;
}

export function makeD3DomDriver(selector) {
	return function d3DomDriver(state_reducer$) {
		const dom_state$ = state_reducer$
			.scan(apply, d3.select(selector))
			.shareReplay(1);
		dom_state$
			.do(s => debug('dom')('update'))
			.subscribe();
		return {
			state$: dom_state$,
			select: function(selector) {
				let selection$ = dom_state$
					.map(dom => dom.select(selector))
					.filter(s => s.node() !== null)
					.shareReplay(1);
				return {
					observable: function() {
						return selection$;
					},
					events: makeEventsGetter(selection$),
					d3dragHandler: makeDragHandler(selection$)
				};
			}
		};
	};
}

export function view(dom_model$) {
  const dom_state_reducer$ = dom_model$
		.map(model => dom => {
			const main = dom
			  .selectAll('main')
			  .data([model.main]);
			
			const entered = main
				.enter()
				.append('main')
				.style('border', '1px solid black')
				.style('position', 'relative');
				
			main
			  .style('height', d => `${d.size.height}px`)
			  .style('width', d => `${d.size.width}px`);
				
			const main_canvas = main
				.selectAll('canvas')
				.data(d => d.canvases || []);
				
			main_canvas
				.enter()
				.append(d => d.node)
				.attr('id', 'main-canvas');
			
			const controls_data = [
				{
					id: 'scene-controls',
					class: 'container',
					style: {
						right: 0,
						top: 0,
						// width: `${model.editor_size.width}px`
					},
					// buttons: [
					// 	{
					// 		id: 'add-object',
					// 		text: 'add object'
					// 	}
					// ],
					cards: model.editor_cards
				},
				{
					id: 'camera-controls',
					style: {
						bottom: 0,
						right: 0
					},
					buttons: [
						{
							id: 'orbit-camera',
							text: 'orbit camera',
							style: {
								height: '100px'
							}
						},
						{
							id: 'camera-to-birds-eye',
							text: 'camera to birds eye'
						}
					]
				}
			];
			
			const controls = main
				.selectAll('div.controls')
				.data(d => controls_data)
				.enter()
				.append('div')
				.attr('id', d => d.id)
				.attr('class', d => d.class)
				.classed('controls', true)
				.style({
					border: '1px solid black',
					position: 'absolute'
				})
				.each(function(d) {
					d3.select(this)
						.style(d.style);
				});
				
			controls
				.filter('#scene-controls')
				.each(function(d) {
					const add = d3.select(this)
						.selectAll('.add-controls')
						.data(['add-object']);
						
					add.enter()
						.append('div')
						.classed('row add-controls', true)
						.append('div')
						.classed('col-xs-12', true)
						// .style('margin-top', '-5px')
						.append('div')
						.classed('btn-group modes pull-right', true)
						.append('button')
						.classed('btn btn-lg btn-primary', true)
						.attr('id', 'add-object')
						.append('i')
						.classed('material-icons', true)
						.style('display', 'block')
						.text('add');
				})
				
			controls
				.selectAll('button')
				.data(d => d.buttons || [])
				.enter()
				.append('button')
				.attr('id', d => d.id)
				.text(d => d.text)
				.each(function(d) {
					d3.select(this)
						.style(d.style);
				});
				
			const editor_cards = main
				.selectAll('.controls')
				.selectAll('.card')
				.data(d => {
					return d.cards || [];
				});
				
			editor_cards
				.exit()
				.remove();

			editor_cards
				.enter()
				.append('div')
				.classed('card', true)
				.each(function(d) {
					d3.select(this)
						.style(d.style);
				});
				
			const editor_canvas = editor_cards
				.selectAll('canvas')
				.data(d => d.canvases || []);
				
			editor_canvas	
				.enter()
				.append(d => d.node)
				.attr('id', 'editor-canvas');
				
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
				
			const card_blocks = editor_cards
				.selectAll('.card-block')
				.data(d => d.card_blocks || []);
				
			card_blocks
				.exit()
				.remove()
				
			const card_blocks_enter = card_blocks
				.enter()
				.append('div')
				.classed('card-block', true);
				
			card_blocks_enter
				.append('h6')
				.classed('card-title', true)
				
			card_blocks
				.select('.card-title')
				.attr('id', d => d.id)
				.text(d => d.header);
				
			const card_blocks_rows = card_blocks
				.selectAll('.row')
				.data(d => d.rows || []);
				
			card_blocks_rows
				.enter()
				.append('div')
				.classed('row parameter', true);
				
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
		
	return dom_state_reducer$;
}

function getObjectInfoRows(object) {
	return [
		{
			columns: [
				{
					width: '6',
					class: 'col-xs-6',
					span_class: 'value delete-object',
					span_style: {
						cursor: 'pointer'
					},
					text: 'Delete',
					id: 'delete-object'
				}
			]
		}
	];
}

function apply(o, fn) {
	return fn(o);
}

function makeEventsGetter(selection$) {
	return function(type) {
		return selection$.flatMap(observableFromD3Event(type));
	};
}

function makeDragHandler(selection$) {
	return function() {
		const handler = d3.behavior.drag();
		const dragHandler$ = selection$
			.map(s => {
				handler.call(s); 
				return handler;
			});
		return {
			events: function(type) {
				return dragHandler$.flatMap(observableFromD3Event(type));
			}
		};
	};
}

function observableFromD3Event(type) {
	return function(selection) {
		return stream
			.create(observer => 
				selection.on(type, function(d) {
					observer.onNext({
						datum: d,
						node: this,
						event: d3.event
					});
				})
			);
	};
}

function log(d) {
	console.log(d);
}