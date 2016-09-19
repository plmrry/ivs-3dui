// jshint undef:true
/* global console */

import {
  Scene, xs, pairwise, xstreamAdapter,
  WebGLRenderer, PCFSoftShadowMap,
  PerspectiveCamera, HemisphereLight,
  PlaneGeometry, MeshPhongMaterial,
  Color, DoubleSide, Mesh,
  GridHelper, SpotLight, Vector3, Raycaster
} from 'bundle';
import { makeDOMDriver, h1, h4, div, button, main, i, canvas } from '@cycle/dom';
import {
  BoxBufferGeometry, MeshBasicMaterial, SphereGeometry,
  Object3D
} from 'three/src/Three.js';
import * as d3 from 'd3';

const logListener = _logListener();
function _logListener() {
  return {
    next: console.log.bind(console),
    error: console.log.bind(console),
    complete: noop
  };
}

const model_proxy$ = xs.create();

const dom_driver = makeDOMDriver('#app');
const dom_proxy$ = xs.create();
const dom$ = dom_driver(dom_proxy$, xstreamAdapter, 'dom');
const window_size$ = get_window_size$();
const renderer$ = _Renderer({ window_size$, dom$ });
const scene$ = _Scene({ model$: model_proxy$ }).map(d => d.scene);
const { camera$, latitude$ } = Camera({ window_size$, dom$, scene$ });

xs
  .combine(
    renderer$,
    scene$,
    camera$
  )
  .map(([renderer, scene, camera]) => () =>
    renderer.render(scene, camera)
  )
  .addListener({
    next: fn => fn(),
    error: e => console.error(e),
    complete: () => {}
  });

function Soundscape() { }

const stop_adding_proxy$ = xs.create();

const click_add$ = dom$.select('button#add').events('click');

const toggle_adding$ = click_add$.map(() => x => !x);

const is_adding$ = xs.merge(toggle_adding$, stop_adding_proxy$)
  .fold((acc, fn) => fn(acc), false)
  .debug(d => console.log('is adding', d));

const main_canvas = dom$.select('canvas.main');
const canvas_mouseup$ = main_canvas.events('mouseup');
const canvas_mouse$ = xs.merge(
  canvas_mouseup$,
  main_canvas.events('mousedown'),
  main_canvas.events('mousemove')
);
const canvas_ndc$ = canvas_mouse$
  .map(event => {
    const ndc = event_to_ndc(event);
    return {
      event,
      ndc
    };
  });

const raycaster = new Raycaster();

const intersects$ = xs.combine(camera$, scene$)
  .map(([ camera, scene ]) => canvas_ndc$.map(mouse => [ camera, scene, mouse ]))
  .flatten()
  .map(([ camera, scene, { event, ndc }]) => {
    const intersects = all_intersects(raycaster, camera, scene, ndc);
    const floorArray = intersects.filter(d => d.object.name === 'floor');
    return {
      event,
      ndc,
      intersects,
      floorArray
    };
  });

// const floor_point$ = intersects$
//   .map(o => o.intersects)
//   .map(arr => arr.filter(d => d.object.name === 'floor'))
//   // TODO: What if floor not found?
//   .map(arr => arr[0].point)
//   .addListener(logListener);

const canvas_click$ = intersects$
  .compose(pairwise)
  .filter(([a, b]) => a.event.type === 'mousedown' && b.event.type === 'mouseup');

// const mouseup_

// canvas_mouseup

is_adding$
  .map(a => canvas_mouseup$.map(e => [a, e]))
  .flatten()
  .filter(a => a[0] === true)
  .debug(d => console.log('canvas mouseup while adding'))
  .map(e => adding => false)
  .compose(stream => stop_adding_proxy$.imitate(stream));

const adding_click$ = is_adding$
  .map(a => canvas_click$.map(c => [a,c]))
  .flatten()
  .filter(a => a[0] === true)
  .debug(d => console.log('click with adding', d));
  // .addListener(logListener);

let id = -1;

const select_one$ = dom$.select('button#select-one').events('click')
  .mapTo(1);

const select_two$ = dom$.select('button#select-two').events('click')
  .mapTo(2);

const select_none$ = dom$.select('button#select-none').events('click')
  .mapTo(null);

const select$ = xs.merge(select_one$, select_two$, select_none$);

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
  // .addListener(logListener);

// const positionReducer

const add_object$ = adding_click$
//   .filter(arr => arr[0] === true)
  .map(([adding, events]) => events[1])
  .map(o => o.floorArray)
  .filter(a => a.length)
  .map(a => a[0].point)
//   .map(event_to_ndc)
//   // .map(all_intersects(raycaster, camera, scene))
//   .map(arr => arr.filter(d => d.object.name === 'floor'))
//   // TODO: What if floor not found?
//   .map(arr => arr[0].point)
  .map(point => {
    // id++;
    id = id + 1;
    // console.log('ID', id);
    // const props$ = xs.of({ initial_position: point, id });
    return create_parent_object({
      id, initial_position: point, dom$, tick$, select$, intersects$
    });
  });

const parent_objects$ = add_object$
  .compose(combine_on_tick(tick$));

const selected$ = parent_objects$
  .map(a => a.filter(d => d.selected));

const selected_view$ = selected$
  .map(arr => arr.map(o => o.dom));

const dom_view$ = xs
  .merge(
    selected_view$.startWith([])
  )
  .map(selected =>
    main([
      canvas('.main'),
      div('.controls#scene-controls', { style: { position: 'absolute', right: '0px', top: '0px'} }, [
        butt('add', 'add'),
        butt('select-one', 'select 1'),
        butt('select-two', 'select 2'),
        butt('select-none', 'select none'),
        div('.selected', selected)
      ]),
      div('.controls.file-controls', { style: { position: 'absolute', left: '0px', top: '0px' } }, [
        button('.btn.btn-lg.btn-secondary', { style: { border: 'none', background: 'none' } }, [
          i('.material-icons', { style: { display: 'block' } }, 'volume_up')
        ])
      ]),
      div('.controls.camera-controls', { style: { position: 'absolute', right: '0px', bottom: '10%' } }, [
        button('#move-camera.btn.btn-lg.btn-secondary', { style: { border: 'none', background: 'none' } }, 'move camera'),
        button('.zoom.in.btn.btn-lg.btn-secondary', { style: { border: 'none', background: 'none' } }, 'zoom in'),
        button('.zoom.out.btn.btn-lg.btn-secondary', { style: { border: 'none', background: 'none' } }, 'zoom out')
      ])
    ])
  );

dom_proxy$.imitate(dom_view$);

const model$ = xs.combine(
    parent_objects$
  )
  .map(([parents]) => {
    return {
      parents
    };
  });

model_proxy$.imitate(model$);

function create_parent_object({
  id, initial_position, tick$, select$,
  dom$, intersects$
}) {
  const change_select$ = select$
    .map(target => target === id)
    .map(is_me => is_me ? (d => true) : (d => false));

  const selected$ = change_select$
    .fold((s, fn) => fn(s), false);

  const color$ = selected$
    .map(s => s ? '#66c2ff' : '#aaaaaa')
    .map(c => new Color(c));

  const add_traj_click$ = dom$
    .select('button.add-trajectory')
    .events('click');

  intersects$
    .map(o => o.intersects.map(i => i.object.name))
    .addListener(logListener);

  const stop_click$ = dom$.select('button.stop-moving')
    .events('click');

  const is_wobble$ = selected$
    .map(s => stop_click$.map(stop => [s, stop]))
    .flatten()
    .filter(a => a[0] === true)
    .fold(w => !w, true);

  // const
    // .map(e => v => new Vector3(0,0,0));
  // const position$ = xs.of(initial_position);
  // const position$ = positionReducer$
  //   .filter(o => o.id === id)
  //   .map(o => o.positionReducer)
  //   .fold((p, fn) => fn(p), initial_position);
  // const selected$ = select$
  //   .fold((acc, fn) => fn(acc), false);
  // position$
  //   .map(o => o.x)
  //   .debug(debug('REDUCE'))
  //   .addListener(logListener())
    // .filter(o => o.id === id)
    // .map(o => o.positionReducer)
    // .debug(debug('REDUCE'))
    // .fold((p, fn) => fn(p), initial_position);
    // .addListener(logListener());
  // const selected$ = select$
  //   .fold((acc, fn) => fn(acc), true);
  // const
  const INITIAL_PARENT_Y = 2;
  const wobble$ = tick$
    .fold(x => x + 0.4, 0)
    .map(x => Math.sin(x))
    .compose(pairwise)
    .map(arr => arr[1] - arr[0])
    .map(dx => v => new Vector3(dx, 0, 0));

  const do_wob$ = is_wobble$
    .map(wob => wobble$.map(update => [wob, update]))
    .flatten()
    // .debug(d => console.log('web', d))
    .filter(a => a[0])
    .map(a => a[1]);
    // .compose(up => is_wobble$.map(wob => [wob, up]))
    // .flatten()
    // .filter(a => a[0])
    // .map(a => a[1]);
  const velocity$ = xs
    .merge(
      do_wob$
      // wobble$
      // stop_me$
    )
    .fold((v, fn) => fn(v), new Vector3(0, 0, 0));
  // const velocity$ = tick$
  //   .fold(x => x + 0.4, 0)
  //   .map(x => Math.sin(x))
  //   .compose(pairwise)
  //   .map(arr => arr[1] - arr[0])
  //   .map(dx => v => new Vector3(dx, 0, 0))
  //   .map(dx => { return new Vector3(dx, 0, 0); });
  const addVelocity$ = velocity$
    .map(velocity => position => {
      return (new Vector3()).addVectors(velocity, position);
    });
  const position$ = xs
    .merge(
      addVelocity$
    )
    .fold((p, fn) => fn(p), initial_position.setY(INITIAL_PARENT_Y));
  const view$ = xs
    .combine(
      position$
    )
    .map(([ position ]) =>
      div('.whatever', {}, [
        h4(`p.x:${position.x}`),
        button('.add-trajectory', 'add trajectory'),
        button('.stop-moving', 'stop moving')
      ])
    );
  const size$ = xs.of(1);
  return xs.combine(
    position$,
    color$,
    selected$,
    view$
  ).map(([position, color, selected, dom]) => {
    return {
      id,
      position,
      color,
      selected,
      dom
    };
  });
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

function all_intersects(raycaster, camera, scene, ndc) {
  raycaster.setFromCamera( ndc, camera );
  var intersects = raycaster.intersectObjects( scene.children, true );
  return intersects;
}

function event_to_ndc(event) {
  return {
    x: ( event.clientX / window.innerWidth ) * 2 - 1,
    y: - ( event.clientY / window.innerHeight ) * 2 + 1
  };
}

function _Scene({ model$ }) {
  return model$.fold(diff_patch_state, get_initial_state());
  // return xs.of(get_initial_state());
  function diff_patch_state(state, new_state) {
    new_state.parents.forEach((new_parent, index) => {
      let parent;
      if (state.parents.has(index) === false) {
        parent = new_parent_object(new_parent);
        state.parents.set(index, parent);
        state.scene.add(parent);
      }
      else parent = state.parents.get(index);

      const sphere = parent.getObjectByProperty('_type', 'sphere');
      parent.position.copy(new_parent.position);
      sphere.material.color = new_parent.color;

    });
    return state;
  }
  function new_parent_object(parent) {
    const geometry = new BoxBufferGeometry( 2, 2, 2 );
    const material = new MeshBasicMaterial({
      wireframe: true,
      color: 0xff0000
    });
    // const parentObject = new Mesh( geometry, material );
    // const parentObject = new Mesh();
    const parentObject = new Object3D();
    parentObject.name = `parent-object-${parent.id}`;
    parentObject.add(new_object_sphere(parent));
    return parentObject;
  }
  function new_object_sphere(props) {
    const geometry = new SphereGeometry(1, 30, 30);
    const material = new MeshPhongMaterial({
      color: new Color(0, 0, 0),
      transparent: true,
      opacity: 0.2,
      side: DoubleSide
    });
    const sphere = new Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.name = `parent-sphere-${props.id}`;
    sphere._type = 'sphere';
    sphere._id = props.id;
    return sphere;
  }
  function get_initial_state() {
    return {
      scene: first_scene(),
      parents: new Map()
    };
  }
  function first_scene() {
    const scene = new Scene();
    addLights(scene);
    addFloor(scene);
    return scene;
  }
  function addLights(scene) {
    scene.add(getSpotlight());
    scene.add(new HemisphereLight(0, 0xffffff, 0.8));
    return scene;
  }
  function addFloor(scene) {
    const room_size = {
      width: 20,
      length: 18,
      height: 3
    };
    scene.add(getFloor(room_size));
  }
  function getFloor(room_size) {
    var FLOOR_SIZE = 100;
    var floorGeom = new PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
    var c = 0.46;
    var floorMat = new MeshPhongMaterial({
      color: new Color(c, c, c),
      side: DoubleSide,
      depthWrite: false
    });
    var e = 0.5;
    floorMat.emissive = new Color(e, e, e);
    var floor = new Mesh(floorGeom, floorMat);
    floor.name = 'floor';
    floor.rotateX(Math.PI / 2);
    floor.position.setY(-room_size.height / 2);
    var grid = new GridHelper(FLOOR_SIZE / 2, 2);
    grid.rotateX(Math.PI / 2);
    grid.material.transparent = true;
    grid.material.opacity = 0.2;
    grid.material.linewidth = 2;
    grid.material.depthWrite = false;
    grid.name = 'floor';
    floor.add(grid);
    floor.receiveShadow = true;
    return floor;
  }
  function getSpotlight() {
    var spotLight = new SpotLight(0xffffff);
    spotLight.position.setY(100);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.intensity = 0.8;
    spotLight.exponent = 1;
    spotLight.shadow.camera.near = 1;
    spotLight.shadow.camera.far = 40;
    spotLight.shadow.camera.fov = 30;
    return spotLight;
  }
}

function Camera({ window_size$, dom$, scene$ }) {
  const camera_proxy$ = xs.create();

  const raycaster = new Raycaster();

  const main$ = dom$.select('canvas.main');

  const mousemove$ = main$.events('mousemove');
  const mousedown$ = main$.events('mousedown');
  const mouseup$ = main$.events('mouseup');

  const intersects$ = xs
    .merge(mousemove$, mousedown$, mouseup$)
    .map(add_ndc)
    .compose(get_raycasts$(raycaster, camera_proxy$, scene$))
    .filter(o => o.intersects.length);

  const mousedown_on_floor$ = intersects$
    .filter(o => o.event.type === 'mousedown')
    .filter(o => o.intersects.length)
    .filter(o => o.intersects[0].object.name === 'floor');

  const panning_update$ = mousedown_on_floor$
    .map(ev => {
      const start = ev.intersects[0].point;
      return intersects$
        .filter(o => o.event.type === 'mousemove')
        .map(o => o.intersects[0].point)
        .map(drag => (new Vector3()).subVectors(start, drag))
        .endWhen(mouseup$);
    })
    .flatten()
    .map(delta => position => (new Vector3()).addVectors(position, delta));

  function get_raycasts$(raycaster, camera$, scene$) {
    return function(mouse_event$) {
      return xs.combine(camera$, scene$)
        .map(([ camera, scene ]) => {
          return mouse_event$
            .map(add_all_intersects(raycaster, camera, scene));
        })
        .flatten();
    };
  }

  function add_all_intersects(raycaster, camera, scene) {
    return function(obj) {
      raycaster.setFromCamera(obj.ndc, camera);
      obj.intersects = raycaster.intersectObjects( scene.children, true );
      return obj;
    };
  }

  const update_radius$ = dom$.select('button.zoom')
    .events('click')
    .map(e => e.target)
    .map(node => d3.select(node).classed('zoom in') ? +1 : -1)
    .map(dir => xs.create({
      start: l => d3.transition('zoom')
        .tween('camera.zoom', function() {
          return function() {
            l.next(dir);
          };
        }),
      stop: () => {}
    }))
    .flatten()
    .map(direction => radius => {
      const nu = radius + 2 * -direction;
      return nu <= 0 ? radius : nu;
    });

  const orbit_delta$ = dom$.select('#move-camera')
    .events('mousedown')
    .map(start => dom$.select(':root')
      .events('mousemove')
      .map(e => ({
        x: e.clientX,
        y: e.clientY
      }))
      .compose(pairwise)
      .map(a => ({
        x: a[1].x - a[0].x,
        y: a[1].y - a[0].y
      }))
      .endWhen(dom$.select(':root').events('mouseup'))
    )
    .flatten();

  const MAX_LATITUDE = 89.9;
  const MIN_LATITUDE = 0.1;
  const to_birds_eye_proxy$ = xs.create();
  const lat_to_birds$ = to_birds_eye_proxy$
    .map(lat => {
      const target = MAX_LATITUDE;
      const i = d3.interpolate(lat, target);
      return xs.create({
        start: l => d3.transition('cam-to-overhead')
          .duration(1000)
          .tween('camera.to-overhead', () => {
            return t => {
              l.next(i(t));
            };
          }),
        stop: () => {}
      });
    })
    .flatten()
    .map(newLat => () => newLat);
  const latitude_change$ = orbit_delta$
    .map(d => -d.y)
    .map(d => lat => {
      return (lat + d > MAX_LATITUDE) ?
        MAX_LATITUDE :
        (lat + d < MIN_LATITUDE) ?
        MIN_LATITUDE :
        lat + d;
    });
  const latitude$ = xs.merge(
    latitude_change$, lat_to_birds$
  )
    .fold((l, fn) => fn(l), 45);
  const longitude_change$ = orbit_delta$
    .map(d => d.x)
    .map(delta => longitude => longitude + delta);
  const longitude$ = xs.merge(longitude_change$)
    .fold((l, fn) => fn(l), -135);
  const latitudeToTheta = d3.scaleLinear()
    .domain([90, 0, -90])
    .range([0, Math.PI/2, Math.PI])
    .clamp(true);
  const longitudeToPhi = d3.scaleLinear()
    .domain([-180, 0, 180])
    .range([0, Math.PI, 2 * Math.PI]);
  // const latitude$ = xs.of(45);
  // const longitude$ = xs.of(-135);
  const theta$ = latitude$.map(latitudeToTheta);
  const phi$ = longitude$
    .map(longitudeToPhi)
    .map(phi => phi % (2 * Math.PI))
    .map(phi => (phi < 0) ? (2 * Math.PI) + phi : phi);
  // const radius$ = xs.of(100);
  const radius$ = xs.merge(update_radius$)
    .fold((r, fn) => fn(r), 100);
  const lookAt$ = xs.merge(panning_update$)
    .fold((l, fn) => fn(l), new Vector3());
    // .of(new Vector3());
  const polar_position$ = xs.combine(
    radius$, theta$, phi$
  ).map(([radius, theta, phi]) => ({ radius, theta, phi }));
  const relative_position$ = polar_position$
    .map(polarToVector)
    .fold((vector, position) => vector.copy(position), new Vector3());
  const position$ = xs
    .combine(
      relative_position$,
      lookAt$
    )
    .map(([ rel, look ]) => (new Vector3()).addVectors(rel, look));
  const update_lookat_or_position$ = xs
    .combine(
      position$, lookAt$
    )
    .map(([position, lookat]) => camera => {
      // console.log('lookat', lookat);
      camera.position.copy(position);
      camera.lookAt(lookat);
      return camera;
    });
  // const update_lookat$ = lookAt$
  //   .map(lookat => camera => {
  //     camera.lookAt(lookat);
  //     return camera;
  //   });
  const update_size$ = window_size$
    .map(size => camera => {
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
      return camera;
    });
  const camera$ = xs
    .merge(
      xs.of(c => c),
      update_size$,
      update_lookat_or_position$
    )
    .fold((camera, fn) => fn(camera), first_camera());
  // console.log(camera$);
  camera_proxy$.imitate(camera$.drop(1));
  function polarToVector({ radius, theta, phi }) {
    return {
      x: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi) * Math.sin(theta),
      y: radius * Math.cos(theta)
    };
  }
  function first_camera() {
    const camera = new PerspectiveCamera(
      45, window.innerWidth / window.innerHeight,
      1, 10000
    );
    return camera;
  }
  // const is_birds_eye$ = latitude$.map(lat => lat > 85);
  const click_add$ = dom$.select('button#add').events('click');
  const other_add$ = dom$.select('button.add-trajectory').events('click');
  const add$ = xs.merge(click_add$, other_add$);
  latitude$
    .map(lat => add$.map(event => lat))
    .flatten()
    .filter(lat => lat < 85)
    .compose(s => to_birds_eye_proxy$.imitate(s));

  return {
    camera$,
    latitude$
  };
}

function _Renderer({ window_size$, dom$ }) {
  const renderer$ = dom$.select('canvas.main')
    .elements()
    .filter(e => e.length)
    .map(a => a[0])
    .take(1)
    .map(first_renderer)
    .map(renderer => window_size$
      .fold((r, size) => {
        r.setSize(size.width, size.height);
        return r;
      }, renderer)
    )
    .flatten();
  return renderer$;
  function first_renderer(canvas) {
    const renderer = new WebGLRenderer({
      canvas,
      precision: "lowp",
      antialias: false
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.setClearColor(0xf0f0f0);

		renderer.gammaInput = true;
		renderer.gammaOutput = true;
    return renderer;
  }
}

function butt(id, text) {
  return button(`#${id}.btn.btn-lg.btn-secondary`, { style: { border: 'none', background: 'none' } }, text);
}

function noop() {}

function get_window_size$() {
  return xs
    .create({
      start: listener => {
        window.addEventListener('resize', () => {
          listener.next(window);
        });
      },
      stop: () => {}
    })
    .startWith(window)
    .map(element => ({
      width: element.innerWidth,
      height: element.innerHeight
    }));
}

function add_ndc(event) {
  return {
    event,
    ndc: event_to_ndc(event)
  };
}

function event_to_ndc(event) {
  return {
    x: ( event.clientX / window.innerWidth ) * 2 - 1,
    y: - ( event.clientY / window.innerHeight ) * 2 + 1
  };
}

// console.log(dom$);



// console.log(dom_source$.select('canvas.main').elements().addListener);

// dom$.imitate(source$);

// const tick_view$ = tick$
//   .map(tick => {
//
//   })
//
// function get_first_scene() {
//   const scene = new Scene();
//   addLights(scene);
//   addFloor(scene);
//   // addCanvas(g_dom)(g_main_renderer.domElement);
// }

// function addCanvas(dom) {
//   return function(canvas) {
//     dom
//       .select('main')
//       .append(() => canvas)
//       .attr('id', 'main-canvas');
//     return dom;
//   };
// }

// function addLights(scene) {
//   scene.add(getSpotlight());
//   scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
//   return scene;
// }

// console.log(THREE);

// export function ivs() {
//   console.log('foo');
// }
