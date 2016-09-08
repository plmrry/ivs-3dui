/* jshint esversion: 6 */
/* jshint unused: true */
/* jshint undef: true */
/* jshint -W087 */
/* global window, document */ // jshint ignore:line

// import debug from 'debug';
// import Rx, { Observable as stream } from 'rx';
// import combineLatestObj from 'rx-combine-latest-obj';
import * as d3 from 'd3';
import THREE from 'three/three.min.js';
// import createVirtualAudioGraph from 'virtual-audio-graph';
// import _ from 'underscore';
import xs from 'xstream';

// import OBJLoader from './OBJLoader.js';
// import kludge from './kludge.js';

// import log from './utilities/log.js';
// import apply from './utilities/apply.js';

const g_main_renderer = getFirstRenderer();
const g_main_scene = new THREE.Scene();
// const g_main_scene_model = { objects: d3.map() };
const g_main_camera = new THREE.OrthographicCamera();
const g_dom = getFirstDom();

init(g_main_scene);

const window_size$ = getWindowSize$();

// const log_listener = {
//   next: d => console.log(d),
//   error: e => console.error(e),
//   complete: () => console.log()
// };

// window_size$.addListener(log_listener);

window_size$.addListener(l(size => {
  setRendererSize(g_main_renderer)(size);
  updateCameraSize(g_main_camera)(size);
  // mainRenderer$.onNext(g_main_renderer);
  g_main_renderer.render(g_main_scene, g_main_camera);
}));

const latitudeToTheta = d3.scaleLinear()
  .domain([90, 0, -90])
  .range([0, Math.PI/2, Math.PI])
  .clamp(true);
const longitudeToPhi = d3.scaleLinear()
  .domain([-180, 0, 180])
  .range([0, Math.PI, 2 * Math.PI]);

var f = d3.format(".3f");
function polarToVector({ radius, theta, phi }) {
  return {
    x: f(radius * Math.sin(phi) * Math.sin(theta)),
    z: f(radius * Math.cos(phi) * Math.sin(theta)),
    y: f(radius * Math.cos(theta))
  };
}

const MAX_LATITUDE = 89;

const lat_up$ = xs.create({
  start: l => g_dom.select('button.lat-up').on('click', () => l.next()),
  stop: () => {}
}).mapTo(+1.34)
  .map(x => lat => {
    // console.log('lat', lat);
    if (lat >= MAX_LATITUDE) return MAX_LATITUDE;
    return lat + x;
  });

const lat_down$ = xs.create({
  start: l => g_dom.select('button.lat-down').on('click', () => l.next()),
  stop: () => {}
}).mapTo(-1.34)
  .map(x => lat => {
    // console.log('lat', lat);
    if (lat <= 0) return 0;
    return lat + x;
  });

const latitude_proxy$ = xs.create();

const latitude$ = xs.merge(lat_up$, lat_down$, latitude_proxy$)
  .fold((x, fn) => fn(x), 45);

const latest_lat$ = xs.create({
  start: l => g_dom.select('button.camera-mode').on('click', () => l.next()),
  stop: () => {}
}).compose(cam_mode$ => latitude$.map(l => cam_mode$.mapTo(l)))
  .flatten()
  .map(lat => {
    const target = lat < MAX_LATITUDE ? MAX_LATITUDE : 5;
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

latitude_proxy$.imitate(latest_lat$);

const longitude$ = xs.of(-135);
const theta$ = latitude$.map(latitudeToTheta)
  // .debug(d => console.log('theta', d))
const phi$ = longitude$
  .map(longitudeToPhi)
  .map(phi => phi % (2 * Math.PI))
  .map(phi => (phi < 0) ? (2 * Math.PI) + phi : phi);
const polar_position$ = xs
  .combine(
    xs.of(100),
    theta$,
    phi$
  )
  .map(([radius, theta, phi]) => ({ radius, theta, phi }));
const relative_position$ = polar_position$
  .map(polarToVector)
  .fold((vector, position) => vector.copy(position), new THREE.Vector3());
const look_at$ = xs.of(new THREE.Vector3());
const position$ = xs.combine(relative_position$, look_at$)
  .map(([ rel, look ]) => rel.add(look));
const update_look_at$ = look_at$
  .map(lookAt => camera => {
    // if (! _.isMatch(camera._lookAt, lookAt)) {
    //   debug('reducer:camera')('update lookAt', lookAt);
      camera._lookAt = lookAt;
      console.log('LOOK ONE', camera._lookAt);
      camera.lookAt(lookAt || new THREE.Vector3());
    // }
    return camera;
  });
const update_zoom$ = xs.of(40)
  .map(zoom => camera => {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    return camera;
  });
const update_position$ = position$.map(position => camera => {
  camera._lookAt = camera._lookAt || new THREE.Vector3();
  // console.log('LOOK', camera._lookAt);
  // console.log('POSITION', position);
  // camera.lookAt(camera._lookAt);
  camera.position.copy(position);
  camera.lookAt(camera._lookAt);
  // camera.updateProjectionMatrix();
  return camera;
});

const main_camera$ = xs.merge(
    update_position$,
    update_zoom$,
    update_look_at$
  )
  .fold((camera, fn) => fn(camera), g_main_camera);

// main_camera$.addListener(debugListener('camera'));

main_camera$.addListener(l(() => {
  render_globals();
}));

function render_globals() {
  g_main_renderer.render(g_main_scene, g_main_camera);
}

// position$.addListener(debugListener('position'));
// polar_position$.addListener(debugListener('polar'));
// relative_position$.addListener(debugListener('relative'));
// theta$.addListener(debugListener('theta'));

function debugListener(message) {
  return l(d => {
    console.log(message, d);
  });
}

function updateCameraSize(camera) {
  return function(size) {
    const s = size;
    // debug('reducer:camera')('update size', s);
    [ camera.left, camera.right ] = [-1,+1].map(d => d * s.width * 0.5);
    [ camera.bottom, camera.top ] = [-1,+1].map(d => d * s.height * 0.5);
    camera.updateProjectionMatrix();
    return camera;
  };
}

function setRendererSize(renderer) {
  return function(size) {
    // const currentSize = renderer.getSize();
    // const diff = _.difference(_.values(currentSize), _.values(size));
    // if (diff.length > 0) {
    //   debug('reducer:renderer')('update size');
      renderer.setSize(size.width, size.height);
    // }
    return renderer;
  };
}

function l(next) {
  return {
    next,
    error: e => console.error(e),
    complete: () => {}
  };
}

function getWindowSize$() {
  return xs.create({
    start: listener => {
      d3.select(window)
        .on('resize', () => {
          listener.next(window);
        });
    },
    stop: () => {}
  }).startWith(window)
    .map(element => ({
      width: element.innerWidth,
      height: element.innerHeight
    }));
}

function init(scene) {
  addLights(scene);
  addFloor(scene);
  addCanvas(g_dom)(g_main_renderer.domElement);
}

function addCanvas(dom) {
  return function(canvas) {
    dom
      .select('main')
      .append(() => canvas)
      .attr('id', 'main-canvas');
    return dom;
  };
}

function addLights(scene) {
  scene.add(getSpotlight());
  scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
  return scene;
}

function getSpotlight() {
  var spotLight = new THREE.SpotLight(0xffffff, 0.95);
  spotLight.position.setY(100);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.width = 4000;
  spotLight.shadow.mapSize.height = 4000;
  spotLight.intensity = 1;
  spotLight.exponent = 1;
  return spotLight;
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
  var floorGeom = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  var c = 0.46;
  var floorMat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(c, c, c),
    side: THREE.DoubleSide,
    depthWrite: false
  });
  var e = 0.5;
  floorMat.emissive = new THREE.Color(e, e, e);
  var floor = new THREE.Mesh(floorGeom, floorMat);
  floor.name = 'floor';
  floor.rotateX(Math.PI / 2);
  floor.position.setY(-room_size.height / 2);
  var grid = new THREE.GridHelper(FLOOR_SIZE / 2, 2);
  grid.rotateX(Math.PI / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  grid.material.linewidth = 2;
  grid.material.depthWrite = false;
  floor.add(grid);
  floor.receiveShadow = true;
  return floor;
}

function getFirstRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xf0f0f0);
  return renderer;
}

function getFirstDom() {
  const dom = d3.select('#app');
  const main = dom.append('main');
  const controls_join = main
    .selectAll('.controls')
    .data(getControlsData());
  const controls_enter = controls_join
    .enter()
    .append('div')
    .attr('class', d => d.class)
    .classed('controls', true)
    .attr('id', d => d.id)
    .style('position', 'absolute')
    .each(setStyles(d => d.styles));
  addControlButtons(controls_enter);
  addObjectButton(controls_enter);
  main.append('div')
    .classed('controls', true)
    .style('position', 'absolute')
    .style('left', '200px')
    .style('bottom', '1%')
    .append('button')
    .text('camera mode')
    .classed('camera-mode', true);

  main.append('div')
    .classed('controls', true)
    .style('position', 'absolute')
    .style('left', '100px')
    .style('bottom', '1%')
    .append('button')
    .text('latitude up')
    .classed('lat-up', true);

  main.append('div')
    .classed('controls', true)
    .style('position', 'absolute')
    .style('left', '100px')
    .style('bottom', '20px')
    .append('button')
    .text('latitude down')
    .classed('lat-down', true);
  return dom;
}

function setStyles(accessor) {
  return function(d) {
    const s = d3.select(this);
    const styles = accessor(d);
    for (let key in styles) {
      s.style(key, styles[key]);
    }
  };
}

function addControlButtons(controls_enter) {
  controls_enter
    .selectAll('button')
    .data(d => d.buttons || [])
    .enter()
    .append('button')
    .attr('id', d => d.id)
    .style('background', 'none')
    .style('border', 'none')
    .classed('btn btn-lg btn-secondary', true)
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
    .append('button')
    .classed('btn btn-lg btn-primary', true)
    .attr('id', d => d)
    .append('i')
    .classed('material-icons', true)
    .style('display', 'block')
    .text('add');
}

function getControlsData() {
  const SCENE_CONTROLS_WIDTH = '40vw';
  return [
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
        top: 0,
        width: SCENE_CONTROLS_WIDTH
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
}

// selectableTHREEJS(THREE);
// debug.enable('*,-reducer:*');
// Rx.config.longStackSupport = true;

/** GLOBALS */
// const MIN_VOLUME = 0.1;
// console.log('hello', THREE, d3, xs);
