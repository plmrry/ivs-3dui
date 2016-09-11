// jshint undef: true
/* global setTimeout, setInterval, requestAnimationFrame */

import xs from 'xstream';
import pairwise from 'xstream/extra/pairwise';
import flattenConcurrently from 'xstream/extra/flattenConcurrently';
import {run} from '@cycle/xstream-run';
import {makeDOMDriver} from '@cycle/dom';
import THREE from 'three/three.min.js';
import * as d3 from 'd3';
import debug from 'debug';
import jsondiffpatch from 'jsondiffpatch';

debug.enable('*,-render');

const raycaster = new THREE.Raycaster();

export default function kludge({
  dom,
  scene,
  camera,
  renderer
}) {
  const stop_adding_proxy$ = xs.create();

  const toggle_adding$ = xs
    .create({
      start: l => dom
        .select('#add-object')
        .on('click', d => l.next(d)),
      stop: () => {}
    })
    .map(() => { return x => !x; });

  const is_adding$ = xs.merge(
    toggle_adding$, stop_adding_proxy$
  ).fold((acc, fn) => fn(acc), false)
    .debug(debug('is adding'));

  const canvas_mouse_up$ = fromEvent(
      dom.select('#main-canvas'),
      'mouseup'
    )
    .debug(debug('canvas:mouse:up'));

  const canvas_mouse_down$ = fromEvent(
      dom.select('#main-canvas'),
      'mousedown'
    )
    .debug(debug('canvas:mouse:down'));

  const canvas_mouse_move$ = fromEvent(
      dom.select('#main-canvas'),
      'mousemove'
    );
    // .debug(debug('canvas:mouse:move'));

  const canvas_mouse$ = xs
    .merge(
      canvas_mouse_down$,
      canvas_mouse_up$,
      canvas_mouse_move$
    );

  const canvas_click$ = canvas_mouse$
    .compose(pairwise)
    .filter(([a, b]) => a.type === 'mousedown' && b.type === 'mouseup')
    .debug(debug('main_canvas:click'));
    // .addListener(logListener());

  const adding_click$ = is_adding$
    .map(a => canvas_click$.map(c => [a,c]))
    .flatten()
    .debug(debug('click_with_adding'));
    // .addListener(noopListener());

  const stop_adding$ = adding_click$.map(() => x => false);
  stop_adding_proxy$.imitate(stop_adding$);

  const FPS = 30;
  const MPF = 1000/FPS;

  const tick$ = xs.create({
    start: l => d3.timer(() => l.next()),
    stop: () => {}
  })
    .map(() => Date.now())
    .fold((last, now) => {
      return (now - last) > MPF ? now : last;
    }, Date.now())
    .compose(pairwise)
    .filter(arr => arr[1] > arr[0]);

  const add_object$ = adding_click$
    .filter(arr => arr[0] === true)
    .map(([adding, events]) => events[1])
    .map(event_to_ndc)
    .map(all_intersects(raycaster, camera, scene))
    .map(arr => arr.filter(d => d.object.name === 'floor'))
    // TODO: What if floor not found?
    .map(arr => arr[0].point)
    .map(point => create_parent_object(point, tick$))
    .debug(debug('add:parent_object'));

  const parent_objects$ = add_object$.compose(combine_on_tick(tick$));

  function next_listener(next) {
    return {
      next,
      error: e => console.error(e),
      complete: () => {}
    };
  }

  const state$ = xs.combine(
    parent_objects$
  )
    .map(([parents]) => {
      return {
        parents
      };
    })
    .fold(diff_patch_state, get_initial_state(scene));

  xs.combine(
    state$
  )
    .map(([state]) => state)
    .map(state => state.scene)
    .map(scene => () => renderer.render(scene, camera))
    .addListener({
      next: fn => fn(),
      error: e => console.error(e),
      complete: () => {}
    });

  function errorListener() {
    return {
      next: () => {},
      error: e => console.error(e),
      complete: () => {}
    };
  }

  function get_initial_state(scene) {
    return {
      scene,
      parents: new Map()
    };
  }

  function diff_patch_state(state, new_state) {
    new_state.parents.forEach((new_parent, index) => {
      let parent;
      if (state.parents.has(index) === false) {
        debug('create new parent Object3D')(new_parent);
        parent = new_parent_object(new_parent);
        state.parents.set(index, parent);
        state.scene.add(parent);
      }
      else parent = state.parents.get(index);

      parent.position.copy(new_parent.position);

    });
    return state;
  }

  function new_parent_object(parent) {
    const geometry = new THREE.BoxBufferGeometry( 2, 2, 2 );
		const material = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0xff0000
    });
    const mesh = new THREE.Mesh( geometry, material );
    return mesh;
  }

  function get_first_state() {
    return {
      parent_objects: new Set()
    };
  }

  function create_parent_object(initial_position, tick$) {
    const INITIAL_PARENT_Y = 0;
    const FPS = 10;
    const animate$ = xs.create({
      start: l => setInterval(() => l.next(), 1000/FPS),
      stop: () => {}
    });
    const velocity$ = tick$
      .fold(x => x+0.4, 0)
      .map(x => Math.sin(x))
      .compose(pairwise)
      .map(arr => arr[1] - arr[0])
      .map(dx => { return new THREE.Vector3(dx, 0, 0); });
    const addVelocity$ = velocity$
      .map(velocity => position => position.add(velocity));
    const position$ = xs.merge(
      addVelocity$
    ).fold((p, fn) => fn(p), initial_position);
    const size$ = xs.of(1);
    return xs.combine(
      position$,
      velocity$,
      size$
      // onTick$
    ).map(([position, velocity, size, onTick]) => {
      return {
        position,
        velocity,
        size,
        onTick
      };
    });
    // };
  }

  adding_click$.addListener(noopListener());

  canvas_mouse$.map(event => {
      return {
        x: ( event.clientX / window.innerWidth ) * 2 - 1,
	      y: - ( event.clientY / window.innerHeight ) * 2 + 1
      };
    })
    .map(mouse => {
      raycaster.setFromCamera( mouse, camera );
      var intersects = raycaster.intersectObjects( scene.children );
      return intersects;
    })
    .addListener(noopListener());
}

function combine_on_tick(tick$) {
  return function combine(add_object$) {
    const parents = [];
    add_object$.addListener({
      next: parent$ => {
        const index = parents.length;
        parent$.addListener({
          next: obj => parents[index] = obj,
          error: e => console.error(e),
          complete: () => {}
        });
      },
      error: e => console.error(e),
      complete: () => {}
    });
    return tick$.map(() => parents);
  };
}

function all_intersects(raycaster, camera, scene) {
  return function(mouse) {
    raycaster.setFromCamera( mouse, camera );
    var intersects = raycaster.intersectObjects( scene.children );
    return intersects;
  };
}

function event_to_ndc(event) {
  return {
    x: ( event.clientX / window.innerWidth ) * 2 - 1,
    y: - ( event.clientY / window.innerHeight ) * 2 + 1
  };
}

function noopListener() {
  return {
    next: noop,
    error: noop,
    complete: noop
  };
}

function noop() {}

function logListener() {
  return {
    next: d => console.log(d),
    error: e => console.error(e),
    complete: () => {}
  };
}

function fromEvent(selection, event) {
  return xs.create(eventProducer(selection, event));
}

function eventProducer(selection, event) {
  return {
    start: l => selection.on(event, d => l.next(d3.event)),
    stop: () => {}
  };
}
