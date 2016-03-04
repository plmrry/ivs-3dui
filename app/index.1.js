import Cycle from '@cycle/core';
import CycleDOM from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';

const stream = Rx.Observable;

  Rx.config.longStackSupport = true;

  var CAMERA_RADIUS = 100;

  var INITIAL_THETA = 80;

  var INITIAL_PHI = 45;

  var INITIAL_ZOOM = 40;

  var PARENT_SPHERE_COLOR = new THREE.Color(0, 0, 0);

  var ROOM_SIZE = {
    width: 20,
    length: 18,
    height: 3
  };

  var CONE_BOTTOM = 0.01;

  function getConeParentWithParams(params) {
    var CONE_RADIAL_SEGMENTS, cone, coneParent, geometry, material;
    coneParent = new THREE.Object3D();
    Object.assign(coneParent, params);
    coneParent.castShadow = true;
    coneParent.receiveShadow = true;
    CONE_RADIAL_SEGMENTS = 50;
    geometry = new THREE.CylinderGeometry();
    geometry.parameters = {
      radiusBottom: CONE_BOTTOM,
      openEnded: true,
      radialSegments: CONE_RADIAL_SEGMENTS
    };
    geometry = geometry.clone();
    material = new THREE.MeshPhongMaterial({
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    cone = new THREE.Mesh(geometry, material);
    cone.name = 'cone';
    cone.castShadow = true;
    cone.renderOrder = 1;
    cone.receiveShadow = true;
    coneParent.add(cone);
    return coneParent;
  }

  function addConeParentWithParams(params) {
    return function(obj) {
      var coneParent, i;
      coneParent = getConeParentWithParams(params);
      updateConeParent(coneParent);
      i = obj.children.length;
      coneParent.name = "cone" + i;
      return obj.add(coneParent);
    };
  }

  function updateConeParent(coneParent) {
    var cone, geom, newGeom, params;
    coneParent.rotation.x = coneParent._phi;
    coneParent.rotation.z = coneParent._theta;
    cone = coneParent.getObjectByName('cone');
    geom = cone.geometry;
    params = geom.parameters;
    params.height = coneParent._volume;
    params.radiusTop = coneParent._spread;
    newGeom = geom.clone();
    cone.geometry.dispose();
    cone.geometry = newGeom;
    return cone.position.y = cone.geometry.parameters.height / 2;
  }

  function getFirstCamera() {
    var c = new THREE.OrthographicCamera();
    c.zoom = INITIAL_ZOOM;
    c._lookAt = new THREE.Vector3();
    c.position._polar = {
      radius: CAMERA_RADIUS,
      theta: degToRad(INITIAL_THETA),
      phi: degToRad(INITIAL_PHI)
    };
    c.position._relative = polarToVector(c.position._polar);
    c.position.addVectors(c.position._relative, c._lookAt);
    c.lookAt(c._lookAt);
    c.up.copy(new THREE.Vector3(0, 1, 0));
    c.updateProjectionMatrix();
    return c;
  }

  function polarToVector(o) {
    var phi, radius, theta, x, y, z;
    radius = o.radius, theta = o.theta, phi = o.phi;
    x = radius * Math.cos(theta) * Math.sin(phi);
    y = radius * Math.sin(theta) * Math.sin(phi);
    z = radius * Math.cos(phi);
    return new THREE.Vector3(y, z, x);
  }

  var degToRad = d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI]);
  
  function fakeTweenInSphere(sphere) {
    var currentGeom = sphere.geometry;
    var params = currentGeom.parameters;
    params.radius = 0.8;
    var newGeom = currentGeom.clone();
    sphere.geometry.dispose();
    sphere.geometry = newGeom;
  }
  
  function addObjectAtPoint2(p, volume) {
    console.info("Add object at", p);
    var geometry = new THREE.SphereGeometry(0.1, 30, 30);
    var material = new THREE.MeshPhongMaterial({
      color: PARENT_SPHERE_COLOR,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    var sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.name = 'parentSphere';
    sphere._volume = volume || 1;
    sphere.renderOrder = 10;
    var lineGeom = new THREE.Geometry();
    var _lineBottom = -p.y + (-ROOM_SIZE.height / 2);
    lineGeom.vertices.push(new THREE.Vector3(0, _lineBottom, 0));
    lineGeom.vertices.push(new THREE.Vector3(0, 100, 0));
    lineGeom.computeLineDistances();
    var dashSize = 0.3;
    var mat = new THREE.LineDashedMaterial({
      color: 0,
      linewidth: 1,
      dashSize: dashSize,
      gapSize: dashSize,
      transparent: true,
      opacity: 0.2
    });
    var line = new THREE.Line(lineGeom, mat);
    sphere.add(line);
    sphere.position.copy(p);
    return sphere;
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

  function setCameraSize2(s) {
    return function(c) {
      // var ref, ref1;
      var ref = [-1, 1].map(function(d) {
        return d * s.width / 2;
      });
      c.left = ref[0];
      c.right = ref[1];
      var ref1 = [-1, 1].map(function(d) {
        return d * s.height / 2;
      });
      c.bottom = ref1[0];
      c.top = ref1[1];
      c.updateProjectionMatrix();
      return c;
    };
  }

function start() {
  var container = d3.select('body')
    .append('div')
    .attr('id', 'new')
    .style({
      position: 'relative'
    });
  
  var main_canvas = container
    .append('canvas')
    .attr('id', 'main-canvas')
    .style({
      border: '1px solid black'
    });
    
  var editor_container = container
    .append('div')
    .classed('container', true)
    .attr('id', 'editor')
    .style({
      position: 'absolute', right: '0px', top: '1%',
      border: '1px solid green'
    });
    
  var editor_canvas = editor_container
    .append('canvas')
    .attr('id', 'editor-canvas')
    .style({
      border: '1px solid blue'
    });
    
  var main_renderer = new THREE.WebGLRenderer({
    canvas: main_canvas.node(),
    antialias: true
  });
  main_renderer.setSize(500, 500);
  main_renderer.shadowMap.enabled = true;
  main_renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  var room_size = {
    width: 20,
    length: 18,
    height: 3
  };
  
  var new_scene = new THREE.Scene();
  
  function tweenColor2(color) {
    return function(o) {
      o.material.color = color;
    };
  }
  
  var p = new THREE.Vector3(-3, -0.5, 3);
  var sphere = addObjectAtPoint2(p, 0.7);
  sphere.name = 'another';
  fakeTweenInSphere(sphere);
  
  addConeParentWithParams({
    _volume: 2,
    _spread: 0.5,
    _theta: 0,
    _phi: Math.PI / 2
  })(sphere);
  
  addConeParentWithParams({
    _volume: 1.2,
    _spread: 0.7,
    _theta: Math.PI * 0.3,
    _phi: -Math.PI * 0.1
  })(sphere);
  
  var color = new THREE.Color("#66c2ff");
  var cone = sphere.children[1].getObjectByName('cone');
  
  tweenColor2(color)(cone);
  
  new_scene.add(sphere);
  
  var floor = getFloor(room_size);
  
  var spotLight = new THREE.SpotLight(0xffffff, 0.95);
  spotLight.position.setY(100);
  spotLight.castShadow = true;
  spotLight.shadowMapWidth = 4000;
  spotLight.shadowMapHeight = 4000;
  spotLight.shadowDarkness = 0.2;
  spotLight.intensity = 1;
  spotLight.exponent = 1;

  var hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
  
  new_scene.add(floor);
  new_scene.add(spotLight);
  new_scene.add(hemisphere);
  
  var camera = getFirstCamera();
  setCameraSize2({ width: 500, height: 500 })(camera);
  
  main_renderer.render(new_scene, camera);
  
  //
  // FIXME: SUPER HACKY way of building a secondary view. Really awful.
  //
  
  var _canv = editor_canvas;
  var _rend = new THREE.WebGLRenderer({
    canvas: _canv.node(),
    antialias: true
  });
  _rend.setClearColor('white');
  var _scene = new THREE.Scene();
  _rend.setSize(_canv.node().clientWidth, _canv.node().clientHeight);
  var cloned = sphere.clone();
  var _spotLight = new THREE.SpotLight(0xffffff, 0.95);
  _spotLight.position.setY(100);
  _spotLight.castShadow = true;
  _spotLight.shadowMapWidth = 4000;
  _spotLight.shadowMapHeight = 4000;
  _spotLight.shadowDarkness = 0.001;
  var _hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
  _scene.add(_hemisphere);
  _scene.add(_spotLight);
  var _camera = new THREE.OrthographicCamera();
  var c = _camera;
  _camera.zoom = INITIAL_ZOOM * 1.5;
  _camera._lookAt = new THREE.Vector3();
  _camera.position._polar = {
    radius: CAMERA_RADIUS,
    theta: degToRad(INITIAL_THETA),
    phi: degToRad(INITIAL_PHI)
  };
  _camera.position._relative = polarToVector(_camera.position._polar);
  _camera.position.addVectors(_camera.position._relative, _camera._lookAt);
  _camera.lookAt(cloned.position);
  _camera.up.copy(new THREE.Vector3(0, 1, 0));
  var _size = {
    width: _canv.node().clientWidth,
    height: _canv.node().clientHeight
  };
  var ref = [-1, 1].map(function(d) {
    return d * _size.width / 2;
  });
  var ref1 = [-1, 1].map(function(d) {
    return d * _size.height / 2;
  });
  c.bottom = ref1[0], 
  c.top = ref1[1];
  c.left = ref[0], 
  c.right = ref[1];
  c.updateProjectionMatrix();
  camera = c;
  _scene.add(cloned);
  _rend.render(_scene, _camera);
}

start();

// function main({DOM}) {
//   return {
//     custom: stream.of(1,4,17)
//   };
// }

// Cycle.run(main, {
//   DOM: CycleDOM.makeDOMDriver('#app'),
//   custom: makeCustomDriver('#app')
// });

// function makeCustomDriver() {
// 	  Rx.config.longStackSupport = true;

//   var CAMERA_RADIUS = 100;

//   var INITIAL_THETA = 80;

//   var INITIAL_PHI = 45;

//   var INITIAL_ZOOM = 40;

//   var PARENT_SPHERE_COLOR = new THREE.Color(0, 0, 0);

//   var ROOM_SIZE = {
//     width: 20,
//     length: 18,
//     height: 3
//   };

//   var CONE_BOTTOM = 0.01;

//   function getConeParentWithParams(params) {
//     var CONE_RADIAL_SEGMENTS, cone, coneParent, geometry, material;
//     coneParent = new THREE.Object3D();
//     Object.assign(coneParent, params);
//     coneParent.castShadow = true;
//     coneParent.receiveShadow = true;
//     CONE_RADIAL_SEGMENTS = 50;
//     geometry = new THREE.CylinderGeometry();
//     geometry.parameters = {
//       radiusBottom: CONE_BOTTOM,
//       openEnded: true,
//       radialSegments: CONE_RADIAL_SEGMENTS
//     };
//     geometry = geometry.clone();
//     material = new THREE.MeshPhongMaterial({
//       transparent: true,
//       opacity: 0.5,
//       side: THREE.DoubleSide
//     });
//     cone = new THREE.Mesh(geometry, material);
//     cone.name = 'cone';
//     cone.castShadow = true;
//     cone.renderOrder = 1;
//     cone.receiveShadow = true;
//     coneParent.add(cone);
//     return coneParent;
//   }

//   function addConeParentWithParams(params) {
//     return function(obj) {
//       var coneParent, i;
//       coneParent = getConeParentWithParams(params);
//       updateConeParent(coneParent);
//       i = obj.children.length;
//       coneParent.name = "cone" + i;
//       return obj.add(coneParent);
//     };
//   }

//   function updateConeParent(coneParent) {
//     var cone, geom, newGeom, params;
//     coneParent.rotation.x = coneParent._phi;
//     coneParent.rotation.z = coneParent._theta;
//     cone = coneParent.getObjectByName('cone');
//     geom = cone.geometry;
//     params = geom.parameters;
//     params.height = coneParent._volume;
//     params.radiusTop = coneParent._spread;
//     newGeom = geom.clone();
//     cone.geometry.dispose();
//     cone.geometry = newGeom;
//     return cone.position.y = cone.geometry.parameters.height / 2;
//   }

//   function getFirstCamera() {
//     var c = new THREE.OrthographicCamera();
//     c.zoom = INITIAL_ZOOM;
//     c._lookAt = new THREE.Vector3();
//     c.position._polar = {
//       radius: CAMERA_RADIUS,
//       theta: degToRad(INITIAL_THETA),
//       phi: degToRad(INITIAL_PHI)
//     };
//     c.position._relative = polarToVector(c.position._polar);
//     c.position.addVectors(c.position._relative, c._lookAt);
//     c.lookAt(c._lookAt);
//     c.up.copy(new THREE.Vector3(0, 1, 0));
//     c.updateProjectionMatrix();
//     return c;
//   }

//   function polarToVector(o) {
//     var phi, radius, theta, x, y, z;
//     radius = o.radius, theta = o.theta, phi = o.phi;
//     x = radius * Math.cos(theta) * Math.sin(phi);
//     y = radius * Math.sin(theta) * Math.sin(phi);
//     z = radius * Math.cos(phi);
//     return new THREE.Vector3(y, z, x);
//   }

//   var degToRad = d3.scale.linear().domain([0, 360]).range([0, 2 * Math.PI]);
  
//   function fakeTweenInSphere(sphere) {
//     var currentGeom = sphere.geometry;
//     var params = currentGeom.parameters;
//     params.radius = 0.8;
//     var newGeom = currentGeom.clone();
//     sphere.geometry.dispose();
//     sphere.geometry = newGeom;
//   }
  
//   function addObjectAtPoint2(p, volume) {
//     console.info("Add object at", p);
//     var geometry = new THREE.SphereGeometry(0.1, 30, 30);
//     var material = new THREE.MeshPhongMaterial({
//       color: PARENT_SPHERE_COLOR,
//       transparent: true,
//       opacity: 0.3,
//       side: THREE.DoubleSide
//     });
//     var sphere = new THREE.Mesh(geometry, material);
//     sphere.castShadow = true;
//     sphere.receiveShadow = true;
//     sphere.name = 'parentSphere';
//     sphere._volume = volume || 1;
//     sphere.renderOrder = 10;
//     var lineGeom = new THREE.Geometry();
//     var _lineBottom = -p.y + (-ROOM_SIZE.height / 2);
//     lineGeom.vertices.push(new THREE.Vector3(0, _lineBottom, 0));
//     lineGeom.vertices.push(new THREE.Vector3(0, 100, 0));
//     lineGeom.computeLineDistances();
//     var dashSize = 0.3;
//     var mat = new THREE.LineDashedMaterial({
//       color: 0,
//       linewidth: 1,
//       dashSize: dashSize,
//       gapSize: dashSize,
//       transparent: true,
//       opacity: 0.2
//     });
//     var line = new THREE.Line(lineGeom, mat);
//     sphere.add(line);
//     sphere.position.copy(p);
//     return sphere;
//   }
  
//   function getFloor(room_size) {
//     var FLOOR_SIZE = 100;
//     var floorGeom = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
//     var c = 0.46;
//     var floorMat = new THREE.MeshPhongMaterial({
//       color: new THREE.Color(c, c, c),
//       side: THREE.DoubleSide,
//       depthWrite: false
//     });
//     var e = 0.5;
//     floorMat.emissive = new THREE.Color(e, e, e);
//     var floor = new THREE.Mesh(floorGeom, floorMat);
//     floor.name = 'floor';
//     floor.rotateX(Math.PI / 2);
//     floor.position.setY(-room_size.height / 2);
//     var grid = new THREE.GridHelper(FLOOR_SIZE / 2, 2);
//     grid.rotateX(Math.PI / 2);
//     grid.material.transparent = true;
//     grid.material.opacity = 0.2;
//     grid.material.linewidth = 2;
//     grid.material.depthWrite = false;
//     floor.add(grid);
//     floor.receiveShadow = true;
//     return floor;
//   }

//   function setCameraSize2(s) {
//     return function(c) {
//       // var ref, ref1;
//       var ref = [-1, 1].map(function(d) {
//         return d * s.width / 2;
//       });
//       c.left = ref[0];
//       c.right = ref[1];
//       var ref1 = [-1, 1].map(function(d) {
//         return d * s.height / 2;
//       });
//       c.bottom = ref1[0];
//       c.top = ref1[1];
//       c.updateProjectionMatrix();
//       return c;
//     };
//   }

// function start() {
//   var container = d3.select('body')
//     .append('div')
//     .attr('id', 'new')
//     .style({
//       position: 'relative'
//     });
  
//   var main_canvas = container
//     .append('canvas')
//     .attr('id', 'main-canvas')
//     .style({
//       border: '1px solid black'
//     });
    
//   var editor_container = container
//     .append('div')
//     .classed('container', true)
//     .attr('id', 'editor')
//     .style({
//       position: 'absolute', right: '0px', top: '1%',
//       border: '1px solid green'
//     });
    
//   var editor_canvas = editor_container
//     .append('canvas')
//     .attr('id', 'editor-canvas')
//     .style({
//       border: '1px solid blue'
//     });
    
//   var main_renderer = new THREE.WebGLRenderer({
//     canvas: main_canvas.node(),
//     antialias: true
//   });
//   main_renderer.setSize(500, 500);
//   main_renderer.shadowMap.enabled = true;
//   main_renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
//   var room_size = {
//     width: 20,
//     length: 18,
//     height: 3
//   };
  
//   var new_scene = new THREE.Scene();
  
//   function tweenColor2(color) {
//     return function(o) {
//       o.material.color = color;
//     };
//   }
  
//   var p = new THREE.Vector3(-3, -0.5, 3);
//   var sphere = addObjectAtPoint2(p, 0.7);
//   sphere.name = 'another';
//   fakeTweenInSphere(sphere);
  
//   addConeParentWithParams({
//     _volume: 2,
//     _spread: 0.5,
//     _theta: 0,
//     _phi: Math.PI / 2
//   })(sphere);
  
//   addConeParentWithParams({
//     _volume: 1.2,
//     _spread: 0.7,
//     _theta: Math.PI * 0.3,
//     _phi: -Math.PI * 0.1
//   })(sphere);
  
//   var color = new THREE.Color("#66c2ff");
//   var cone = sphere.children[1].getObjectByName('cone');
  
//   tweenColor2(color)(cone);
  
//   new_scene.add(sphere);
  
//   var floor = getFloor(room_size);
  
//   var spotLight = new THREE.SpotLight(0xffffff, 0.95);
//   spotLight.position.setY(100);
//   spotLight.castShadow = true;
//   spotLight.shadowMapWidth = 4000;
//   spotLight.shadowMapHeight = 4000;
//   spotLight.shadowDarkness = 0.2;
//   spotLight.intensity = 1;
//   spotLight.exponent = 1;

//   var hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
  
//   new_scene.add(floor);
//   new_scene.add(spotLight);
//   new_scene.add(hemisphere);
  
//   var camera = getFirstCamera();
//   setCameraSize2({ width: 500, height: 500 })(camera);
  
//   main_renderer.render(new_scene, camera);
  
//   //
//   // FIXME: SUPER HACKY way of building a secondary view. Really awful.
//   //
  
//   var _canv = editor_canvas;
//   var _rend = new THREE.WebGLRenderer({
//     canvas: _canv.node(),
//     antialias: true
//   });
//   _rend.setClearColor('white');
//   var _scene = new THREE.Scene();
//   _rend.setSize(_canv.node().clientWidth, _canv.node().clientHeight);
//   var cloned = sphere.clone();
//   var _spotLight = new THREE.SpotLight(0xffffff, 0.95);
//   _spotLight.position.setY(100);
//   _spotLight.castShadow = true;
//   _spotLight.shadowMapWidth = 4000;
//   _spotLight.shadowMapHeight = 4000;
//   _spotLight.shadowDarkness = 0.001;
//   var _hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
//   _scene.add(_hemisphere);
//   _scene.add(_spotLight);
//   var _camera = new THREE.OrthographicCamera();
//   var c = _camera;
//   _camera.zoom = INITIAL_ZOOM * 1.5;
//   _camera._lookAt = new THREE.Vector3();
//   _camera.position._polar = {
//     radius: CAMERA_RADIUS,
//     theta: degToRad(INITIAL_THETA),
//     phi: degToRad(INITIAL_PHI)
//   };
//   _camera.position._relative = polarToVector(_camera.position._polar);
//   _camera.position.addVectors(_camera.position._relative, _camera._lookAt);
//   _camera.lookAt(cloned.position);
//   _camera.up.copy(new THREE.Vector3(0, 1, 0));
//   var _size = {
//     width: _canv.node().clientWidth,
//     height: _canv.node().clientHeight
//   };
//   var ref = [-1, 1].map(function(d) {
//     return d * _size.width / 2;
//   });
//   var ref1 = [-1, 1].map(function(d) {
//     return d * _size.height / 2;
//   });
//   c.bottom = ref1[0], 
//   c.top = ref1[1];
//   c.left = ref[0], 
//   c.right = ref[1];
//   c.updateProjectionMatrix();
//   camera = c;
//   _scene.add(cloned);
//   _rend.render(_scene, _camera);
// }

// start();
	// var container = d3.select('body')
 //   .append('main')
 //   .style({
 //     position: 'relative',
 //     width: '900px',
 //     height: '800px',
 //     border: '1px solid green'
 //   });
    
 // var main_canvas = container
 //   .append('canvas')
 //   .attr('id', 'main-canvas')
 //   .style({
 //     border: '1px solid black'
 //   });
    
 // var main_renderer = new THREE.WebGLRenderer({
 //   canvas: main_canvas.node(),
 //   antialias: true
 // });
 // main_renderer.setSize(500, 500);
 // main_renderer.shadowMap.enabled = true;
 // main_renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
 // var room_size = {
 //   width: 20,
 //   length: 18,
 //   height: 3
 // };
  
 // var new_scene = new THREE.Scene();
  
 // function tweenColor2(color) {
 //   return function(o) {
 //     o.material.color = color;
 //   };
 // }
  
 // var p = new THREE.Vector3(-3, -0.5, 3);
 // var sphere = addObjectAtPoint(p, 0.7);
 // sphere.name = 'another';
 // fakeTweenInSphere(sphere);
  
 // addConeParentWithParams({
 //   _volume: 2,
 //   _spread: 0.5,
 //   _theta: 0,
 //   _phi: Math.PI / 2
 // })(sphere);
  
  // addConeParentWithParams({
  //   _volume: 1.2,
  //   _spread: 0.7,
  //   _theta: Math.PI * 0.3,
  //   _phi: -Math.PI * 0.1
  // })(sphere);
  
  // var color = new THREE.Color("#66c2ff");
  // var cone = sphere.children[1].getObjectByName('cone');
  
  // tweenColor2(color)(cone);
  
  // new_scene.add(sphere);
  
  // var floor = getFloor(room_size);
  
  // var spotLight = new THREE.SpotLight(0xffffff, 0.95);
  // spotLight.position.setY(100);
  // spotLight.castShadow = true;
  // spotLight.shadowMapWidth = 4000;
  // spotLight.shadowMapHeight = 4000;
  // spotLight.shadowDarkness = 0.2;
  // spotLight.intensity = 1;
  // spotLight.exponent = 1;

  // var hemisphere = new THREE.HemisphereLight(0, 0xffffff, 0.8);
  
  // new_scene.add(floor);
  // new_scene.add(spotLight);
  // new_scene.add(hemisphere);
  
  // var camera = getFirstCamera();
  // setCameraSize2({ width: 500, height: 500 })(camera);
  
  // main_renderer.render(new_scene, camera);
    
// 	return function(sink$) {
// 		sink$.subscribe(s => {
// 			console.log('sink', s);
// 		});
// 	};
// }

// function addConeParentWithParams(params) {
//   return function(obj) {
//     var coneParent, i;
//     coneParent = getConeParentWithParams(params);
//     updateConeParent(coneParent);
//     i = obj.children.length;
//     coneParent.name = "cone" + i;
//     return obj.add(coneParent);
//   };
// }

// function updateConeParent(coneParent) {
//   var cone, geom, newGeom, params;
//   coneParent.rotation.x = coneParent._phi;
//   coneParent.rotation.z = coneParent._theta;
//   cone = coneParent.getObjectByName('cone');
//   geom = cone.geometry;
//   params = geom.parameters;
//   params.height = coneParent._volume;
//   params.radiusTop = coneParent._spread;
//   newGeom = geom.clone();
//   cone.geometry.dispose();
//   cone.geometry = newGeom;
//   return cone.position.y = cone.geometry.parameters.height / 2;
// }

// function getConeParentWithParams(params) {
// 	var CONE_BOTTOM = 0.01;
//   var CONE_RADIAL_SEGMENTS, cone, coneParent, geometry, material;
//   coneParent = new THREE.Object3D();
//   Object.assign(coneParent, params);
//   coneParent.castShadow = true;
//   coneParent.receiveShadow = true;
//   CONE_RADIAL_SEGMENTS = 50;
//   geometry = new THREE.CylinderGeometry();
//   geometry.parameters = {
//     radiusBottom: CONE_BOTTOM,
//     openEnded: true,
//     radialSegments: CONE_RADIAL_SEGMENTS
//   };
//   geometry = geometry.clone();
//   material = new THREE.MeshPhongMaterial({
//     transparent: true,
//     opacity: 0.5,
//     side: THREE.DoubleSide
//   });
//   cone = new THREE.Mesh(geometry, material);
//   cone.name = 'cone';
//   cone.castShadow = true;
//   cone.renderOrder = 1;
//   cone.receiveShadow = true;
//   coneParent.add(cone);
//   return coneParent;
// }

// function fakeTweenInSphere(sphere) {
//   var currentGeom = sphere.geometry;
//   var params = currentGeom.parameters;
//   params.radius = 0.8;
//   var newGeom = currentGeom.clone();
//   sphere.geometry.dispose();
//   sphere.geometry = newGeom;
// }

// function addObjectAtPoint(p, volume) {
// 	var ROOM_SIZE = {
//     width: 20,
//     length: 18,
//     height: 3
//   };
// 	var PARENT_SPHERE_COLOR = new THREE.Color(0, 0, 0);
//   console.info("Add object at", p);
//   var geometry = new THREE.SphereGeometry(0.1, 30, 30);
//   var material = new THREE.MeshPhongMaterial({
//     color: PARENT_SPHERE_COLOR,
//     transparent: true,
//     opacity: 0.3,
//     side: THREE.DoubleSide
//   });
//   var sphere = new THREE.Mesh(geometry, material);
//   sphere.castShadow = true;
//   sphere.receiveShadow = true;
//   sphere.name = 'parentSphere';
//   sphere._volume = volume || 1;
//   sphere.renderOrder = 10;
//   var lineGeom = new THREE.Geometry();
//   var _lineBottom = -p.y + (-ROOM_SIZE.height / 2);
//   lineGeom.vertices.push(new THREE.Vector3(0, _lineBottom, 0));
//   lineGeom.vertices.push(new THREE.Vector3(0, 100, 0));
//   lineGeom.computeLineDistances();
//   var dashSize = 0.3;
//   var mat = new THREE.LineDashedMaterial({
//     color: 0,
//     linewidth: 1,
//     dashSize: dashSize,
//     gapSize: dashSize,
//     transparent: true,
//     opacity: 0.2
//   });
//   var line = new THREE.Line(lineGeom, mat);
//   sphere.add(line);
//   sphere.position.copy(p);
//   return sphere;
// }

// function d3TweenStream(duration, name) {
//   return stream.create(function(observer) {
//     return d3.select({})
//       .transition()
//       .duration(duration)
//       .ease('linear')
//       .tween(name, function() {
//         return function(t) {
//           return observer.onNext(t);
//         };
//       })
//       .each("end", function() {
//         return observer.onCompleted();
//       });
//   });
// };
