// jshint undef:true

import xs from 'xstream';
import pairwise from 'xstream/extra/pairwise';
// import { drag } from 'd3-drag';
import {
  Scene, WebGLRenderer, PCFSoftShadowMap,
  PerspectiveCamera, HemisphereLight,
  PlaneGeometry, MeshPhongMaterial,
  Color, DoubleSide, Mesh,
  GridHelper, SpotLight, Vector3, Raycaster
} from 'three/src/Three.js';
import xstreamAdapter from '@cycle/xstream-adapter';
import { makeDOMDriver, h1, h4, div, button, main, i, canvas } from '@cycle/dom';
import * as d3 from 'd3';

const dom_driver = makeDOMDriver('#app');
const dom_proxy$ = xs.create();
const dom$ = dom_driver(dom_proxy$, xstreamAdapter, 'dom');

const logListener = _logListener();

function _logListener() {
  return {
    next: console.log.bind(console),
    error: console.log.bind(console),
    complete: noop
  };
}

const window_size$ = get_window_size$();

const renderer$ = _Renderer({ window_size$, dom$ });
const scene$ = _Scene();
const camera$ = Camera({ window_size$, dom$, scene$ });

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

function _Scene() {
  return xs.of(first_scene());
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
    var spotLight = new SpotLight(0xffffff, 0.95);
    spotLight.position.setY(100);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 4000;
    spotLight.shadow.mapSize.height = 4000;
    spotLight.intensity = 1;
    spotLight.exponent = 1;
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
  const MIN_LATITUDE = 1;
  const latitude_change$ = orbit_delta$
    .map(d => -d.y)
    .map(d => lat => {
      return (lat + d > MAX_LATITUDE) ?
        MAX_LATITUDE :
        (lat + d < MIN_LATITUDE) ?
        MIN_LATITUDE :
        lat + d;
    });
  const latitude$ = xs.merge(latitude_change$)
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
  return camera$;
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
    return renderer;
  }
}

// dom$.select('canvas.main')
//   .elements()
//   .filter(e => e.length)
//   .map(a => a[0])
//   .take(1)
//   .map(canvas => {
//     const renderer = new WebGLRenderer({
//       canvas
//     });
//     renderer.shadowMap.enabled = true;
//     renderer.shadowMap.type = PCFSoftShadowMap;
//     renderer.setClearColor(0xf0f0f0);
//     return renderer;
//   })
//   .addListener(logListener);

const dom_view$ = xs.of(
  main([
    canvas('.main'),
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

const tick$ = xs.periodic(100);

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
