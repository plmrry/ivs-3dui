import Cycle from '@cycle/core';
import {makeDOMDriver, div, input, p} from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import Three from 'three/three.js';

const stream = Rx.Observable;

console.log(Three);

debug('ivs:main')('Hello from the app');

function main(drivers) {
  const windowSize$ = drivers
    .windowSize$
    .map(e => ({ width: e.target.innerWidth, height: e.target.innerHeight }));
  
  const camera$ = stream.of({ 
    id: 'main-camera',
    position: new Three.Vector3(0, 0, 400)
  });
    
  const model$ = stream.combineLatest(
    windowSize$
  )
    
  let view$ = stream
    .from([1,2,3])
    .do(d => console.log(d))
    .map((model) => {
      return {
        dom: {
          canvas: [
            { id: 'main-canvas' }
          ]
        }
      };
    });
    
  return {
    DOM: drivers.DOM.select('input').events('click')
      .map(ev => ev.target.checked)
      .startWith(false)
      .map(toggled =>
        div([
          input({type: 'checkbox'}), 'Toggle me',
          p(toggled ? 'ON' : 'off')
        ])
      ),
    custom: view$
  };
}

const drivers = {
  windowSize$: windowSize,
  DOM: makeDOMDriver('#app'),
  custom: makeCustomDriver('#app')
};

Cycle.run(main, drivers);

function makeCustomDriver(selector) {
  let div = d3.select(selector);
  return function customDriver(source$) {
    source$.subscribe(model => {
      let canvas = div.selectAll('canvas').data(model.dom.canvas);
      canvas.enter().append('canvas');
      canvas.exit().remove();
    })
    // return source$.scan((selection, view) => view(selection), div);
  };
}

function windowSize() {
  return stream
    .fromEvent(window, 'resize')
    .startWith({ target: window })
}