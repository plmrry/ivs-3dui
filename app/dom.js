import debug from 'debug';
import d3 from 'd3';
import _ from 'underscore';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

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
						width: '400px'
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
					width: '300px',
					height: '100px',
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
				.style({
					width: '100px',
					height: '100px',
					border: '2px solid red'
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
				.text(d => d.text);
				
			return dom;
		});
		
	return dom_state_reducer$;
}

export function component({ renderers, selected$, size$ }) {
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
			(s, r) => ({ selected: s, renderer: r })
		)
		.map(({ selected, renderer }) => {
			if (typeof selected === 'undefined') return [];
			const cards = [
				{ 
					canvases: [ { node: renderer.domElement } ],
					style: {
						position: 'relative'
					},
					buttons: [
						{
							id: 'add-cone',
							text: 'add cone'
						},
						{
							id: 'delete-object',
							text: 'delete object'
						}
					]
				}
			];
			return cards;
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
				editor_cards: editor_dom
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