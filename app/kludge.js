// jshint undef: true
/* global setTimeout, setInterval, requestAnimationFrame */

import xs from 'xstream';
import pairwise from 'xstream/extra/pairwise';
import flattenConcurrently from 'xstream/extra/flattenConcurrently';
import {run} from '@cycle/xstream-run';
import {makeDOMDriver, h1, h4, div, button} from '@cycle/dom';
import * as THREE from 'three/src/Three.js';
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

  const mouse_intersects$ = canvas_mouse$
    .map(event => {
      const ndc = event_to_ndc(event);
      const intersects = all_intersects(raycaster, camera, scene)(ndc);
      return {
        event,
        ndc,
        intersects
      };
    });

  const floor_point$ = mouse_intersects$
    .map(o => o.intersects)
    .map(arr => arr.filter(d => d.object.name === 'floor'))
    // TODO: What if floor not found?
    .map(arr => arr[0].point);

  const mouse_object$ = mouse_intersects$
    .filter(({ intersects: [{ object: { name } }] }) => name.match(/parent-object/));
    // .debug(debug('OBJECT'))
    // .addListener(noopListener());

  const mousedown_object$ = mouse_object$
    .filter(({ event }) => event.type === 'mousedown')
    .debug(debug('MOUSEDOWN OBJECT'));
    // .addListener(noopListener());

  const mousedrag_object$ = mousedown_object$.map(obj => {
    // return mouse_intersects$
    //   .startWith(obj)
    const match = obj.intersects[0].object.name.match(/parent-object-(.+)/);
    const id = match[1];
    // console.log('match', match);
    // console.log('barbar', id);
    // id = Number(id);
    // console.log(obj.intersects[0].object.name.match(/parent-object-(.+)/));
    return floor_point$
      .compose(pairwise)
      .endWhen(mouse_intersects$.filter(({ event }) => event.type === 'mouseup' ))
      .map(arr => (new THREE.Vector3()).subVectors(arr[1], arr[0]))
      .map(delta => {
        return {
          id: Number(id),
          positionReducer: pos => pos.add(delta)
        };
      });
      // .map(pairs => {
      //   // pairs.map(o => o.intersects)
      // })
  })
  .flatten()
  .debug(debug('MOUSE DRAG OBJECT'));
  // .addListener(errorListener());

  const positionReducer$ = mousedrag_object$;

  // const floor_intersect$ = mouse_intersects$
  //   .map(arr => arr.filter(d => d.object.name === 'floor'))
  //   // TODO: What if floor not found?
  //   .map(arr => arr[0].point)
    // .debug(debug('FLOOR'))
    // .addListener(noopListener());

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

  // const FPS = 30;
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

  const select_proxy$ = xs.create();

  let id = -1;

  const add_object$ = adding_click$
    .filter(arr => arr[0] === true)
    .map(([adding, events]) => events[1])
    .map(event_to_ndc)
    .map(all_intersects(raycaster, camera, scene))
    .map(arr => arr.filter(d => d.object.name === 'floor'))
    // TODO: What if floor not found?
    .map(arr => arr[0].point)
    .map(point => {
      // id++;
      id = id + 1;
      // console.log('ID', id);
      const props$ = xs.of({ initial_position: point, id });
      return create_parent_object({
        id, initial_position: point, point, props$, tick$, select$: select_proxy$, positionReducer$
      });
    })
    .debug(debug('add:parent_object'));

  // const differ = jsondiffpatch.create({
  //   objectHash: obj => obj.id
  // });

  const diff = jsondiffpatch.diff;

  const parent_objects$ = add_object$
    .compose(combine_on_tick(tick$))
    .startWith([])
    .compose(pairwise)
    // .debug(arr => { if (arr[1][0]) debug('barb!')(arr[1][0].position.x); })
    // .filter(a => typeof diff(a[0], a[1]) !== 'undefined')
    // .debug(debug('difffffff'))
    .map(a => a[1]);

  const selected$ = parent_objects$
    .map(a => a.filter(d => d.selected));

  const secs = xs.periodic(1000);

  const selected_view$ = selected$
    .map(arr => arr.map(o =>
      div('.bar', [
        h4(`p.x:${o.position.x}`),
        button('.add-trajectory', 'add trajectory')
      ])
    ))
    .startWith([]);

  const view$ = xs.combine(secs, selected_view$)
    .map(([ secs, selected ]) => {
      return div('.foo', [
        h1('' + secs + ' seconds elapsed'),
        div('.foo', { style: { color: 'red' } },
          selected //selected.map(o => h4(`p.x:${o.position.x}`))
        )
      ]);
    });

  const selected_controls = dom.select('#scene-controls')
    .append('div')
    .classed('selected-controls', true)
    .node();

  const dom_driver = makeDOMDriver(selected_controls);

  dom_driver(view$);

  const model$ = xs.combine(
    parent_objects$
  )
    .map(([parents]) => {
      return {
        parents
      };
    });

  const state$ = model$.fold(diff_patch_state, get_initial_state(scene));

  // const selected$ = state$.map()

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
    const parentObject = new THREE.Mesh( geometry, material );
    parentObject.name = `parent-object-${parent.id}`;
    parentObject.add(new_object_sphere(parent));
    return parentObject;
  }

  function new_object_sphere(props) {
    const geometry = new THREE.SphereGeometry(1, 30, 30);
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(0, 0, 0),
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.name = `parent-sphere-${props.id}`;
    return sphere;
  }

  function get_first_state() {
    return {
      parent_objects: new Set()
    };
  }

  function create_parent_object({ id, initial_position, props$, tick$, select$, positionReducer$ }) {
    // const id$ = props$.map(p => p.id);
    // console.log('idddd', id);
    const position$ = positionReducer$
      .filter(o => o.id === id)
      .map(o => o.positionReducer)
      .fold((p, fn) => fn(p), initial_position);
      // .map(o => o.x)
    // position$
    //   .map(o => o.x)
    //   .debug(debug('REDUCE'))
    //   .addListener(logListener())
      // .filter(o => o.id === id)
      // .map(o => o.positionReducer)
      // .debug(debug('REDUCE'))
      // .fold((p, fn) => fn(p), initial_position);
      // .addListener(logListener());
    const selected$ = select$
      .fold((acc, fn) => fn(acc), true);
    const INITIAL_PARENT_Y = 0;
    const FPS = 10;
    const animate$ = xs.create({
      start: l => setInterval(() => l.next(), 1000/FPS),
      stop: () => {}
    });
    const velocity$ = tick$
      .fold(x => x + 0.4, 0)
      .map(x => Math.sin(x))
      .compose(pairwise)
      .map(arr => arr[1] - arr[0])
      .mapTo(0)
      .map(dx => { return new THREE.Vector3(dx, 0, 0); });
    const addVelocity$ = velocity$
      .map(velocity => position => {
        return (new THREE.Vector3()).addVectors(velocity, position);
      });
    const position2$ = props$.map(({ initial_position }) => {
      return xs.merge(
        addVelocity$
      ).fold((p, fn) => fn(p), initial_position);
    }).flatten();
    const size$ = xs.of(1);
    return xs.combine(
      position$,
      size$,
      selected$
    ).map(([position, size, selected]) => {
      return {
        position,
        size,
        id,
        selected
      };
    });
  }

  adding_click$.addListener(noopListener());
}

function combine_on_tick(tick$) {
  return function combine(add_object$) {
    const parents = [];
    add_object$.addListener({
      next: parent$ => {
        const index = parents.length;
        parent$.addListener({
          next: obj => {
            // console.log('FOOB', obj.position.x)
            parents[index] = obj;
          },
          error: e => console.error(e),
          complete: () => {}
        });
      },
      error: e => console.error(e),
      complete: () => {}
    });
    return tick$.map(() => Array.from(parents));
  };
}

function all_intersects(raycaster, camera, scene) {
  return function(mouse) {
    raycaster.setFromCamera( mouse, camera );
    var intersects = raycaster.intersectObjects( scene.children, true );
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
