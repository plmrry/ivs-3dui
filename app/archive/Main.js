import combineLatestObj from 'rx-combine-latest-obj';

export default function Main(sources) {
  const { windowSize, renderers } = sources;
  
  const main_size$ = mainSize(windowSize);
  
  return {
    dom_model$: dom.model({ main_size$, renderers })
  };
}

const dom = {}
dom.model = function(actions) {
  const { main_size$, renderers } = actions;
  
  const main_canvases$ = renderers
  	.select({ name: 'main' })
  	.first()
  	.pluck('renderer', 'domElement')
  	.map(d => [d])
  	.startWith([]);
  
  return combineLatestObj
    ({
  		main_size$,
  		canvases: main_canvases$
  	})
  	.map(({ main_size, canvases }) => ({
  		mains: [
  			{
  				styles: {
  					height: `${main_size.height}px`,
  					width: `${main_size.width}px`
  				},
  				canvases
  			}
  		]
  	}));
}


function mainSize(windowSize$) {
	return windowSize$
		.pluck('target')
		.startWith(window)
		.map(element => ({
			width: element.innerWidth,
      height: element.innerHeight
		}));
}