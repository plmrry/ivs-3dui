import Cycle from '@cycle/core';
import CycleDOM from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import Rx from 'rx';
import THREE from 'three/three.js';
import _ from 'underscore';
import combineLatestObj from 'rx-combine-latest-obj';

debug.enable('*');
const stream = Rx.Observable;
Rx.config.longStackSupport = true;

THREE.Object3D.prototype.appendChild = function (c) { 
	this.add(c); 
	return c; 
};
THREE.Object3D.prototype.querySelector = function(query) {
	let key = Object.keys(query)[0];
	return this.getObjectByProperty(key, query[key]);
};
THREE.Object3D.prototype.querySelectorAll = function (query) { 
	if (typeof query === 'undefined') return this.children;
	return this.children.filter(d => _.isMatch(d, query));
};
d3.selection.prototype.nodes = function() {
	let nodes = [];
	this.each(function() { nodes.push(this); });
	return nodes;
};

function main({custom}) {
	const log = console.log.bind(console);
	
	const size$ = stream
		.of({ width: 600, height: 700 })
		.shareReplay();
		
  const ndcScale$ = size$
  	.map(({ width, height }) => ({
  		x: d3.scale.linear().domain([0, width]).range([-1, +1]),
  		y: d3.scale.linear().domain([0, height]).range([+1, -1])
  	}));
	
	const main_canvas$ = custom.dom
    .select('#main-canvas');
    
  const main_canvas_drag_handler$ = main_canvas$
  	.d3dragHandler();

	const main_scene$ = custom.scenes
	  .map(scenes => scenes.select({ name: 'main' }))
	  .filter(s => s.size() > 0)
	  .do(s => debug('scene')('state'))
	  
	const floor$ = main_scene$
		.map(scene => scene.select({ name: 'floor' }))
	  .filter(s => s.size() > 0)
	  .map(floor => floor.node())
	  .map(floor => [floor]);
	  
	const main_camera_state$ = custom.states
		.pluck('cameras')
		.map(s => s.select({ name: 'main' }))
		.filter(s => s.size() > 0)
		.map(s => s.node());
		
	const to_birds_eye$ = custom.dom
		.select('#camera_to_birds_eye')
		.events('click')
		.flatMap(ev => {
			let destination = MAX_LATITUDE;
      return d3TweenStream(500)
        .scan((last, t) => ({ t: t, dt: t - last.t }), { t: 0, dt: 0 })
        .map(({ t, dt }) => {
          return p => {
            let speed = (1-t) === 0 ? 0 : (destination - p)/(1 - t);
            let step = p + dt * speed;
            let next = t === 1 ? destination : step;
            return next;
          };
        });
    });

  const main_canvas_event$ = stream
  	.merge(
  		main_canvas_drag_handler$.events('drag'),
  		main_canvas_drag_handler$.events('dragstart'),
  		main_canvas_drag_handler$.events('dragend'),
  		main_canvas$.events('mousemove')
  	)
  	.map((obj) => { 
  		obj.mouse = d3.mouse(obj.node);
  		return obj;
  	})
  	.withLatestFrom(
  		ndcScale$,
  		(event, ndcScale) => { 
  			event.ndc = {
  				x: ndcScale.x(event.mouse[0]), 
  				y: ndcScale.y(event.mouse[1]) 
  			};
  			return event;
  		}
  	)
  	.withLatestFrom(
  		main_camera_state$,
  		(e,c) => ({ event: e, camera: c })
  	)
  	.map(({ event, camera }) => { 
  		let raycaster = new THREE.Raycaster();
  		raycaster.setFromCamera(event.ndc, camera);
  		event.raycaster = raycaster;
  		return event;
  	})
  	.withLatestFrom(
  		main_scene$.map(s => s.node()),
  		(event, scene) => ({ event, scene })
  	)
  	.map(({ event, scene }) => {
  		/** FIXME: It's inefficient to get ojects on every event */
  		let floor = scene.getObjectByProperty('name', 'floor');
  		let objects = scene.children.filter(d => _.isMatch(d, { name: 'sound_object' }));
  		event.intersects = {
  			floor: event.raycaster.intersectObject(floor),
  			sound_objects: event.raycaster.intersectObjects(objects, true)
  		};
  		return event;
  	})
  	.shareReplay();

 	const clicked$ = main_canvas_event$
 		.pairwise()
 		.filter(arr => arr[0].event.type === 'dragstart')
 		.filter(arr => arr[1].event.type === 'dragend')
 		.pluck('1');
 		
 	const clicked_key$ = clicked$
 		.pluck('intersects', 'sound_objects', '0', 'object')
 		.map(o => {
 			if (typeof o !== 'undefined') {
 				/** TODO: Better way of selecting parent when child cone is clicked? */
 				if (o._type === 'cone') return o.parent.parent.__data__.key;
 				return o.__data__.key;
 			}
 			return undefined;
 		})
 		.do(log)
 		.distinctUntilChanged()
 		.shareReplay();
 		
 	const select_object$ = clicked_key$
 		.filter(key => typeof key !== 'undefined')
 		.map(key => objects => {
 			return objects.map(obj => {
 				if (obj.key === key) {
 					obj.selected = true;
 					obj.material.color = '66c2ff';
 					return obj;
 				}
 				return obj;
 			});
 		});
 		
 	const unselect_object$ = clicked_key$
 		.pairwise()
 		.pluck('0')
 		.filter(key => typeof key !== 'undefined')
 		.map(key => objects => {
 			return objects.map(obj => {
 				if (obj.key === key) {
 					obj.selected = false;
 					obj.material.color = 'ffffff';
 					return obj;
 				}
 				return obj;
 			});
 		});

  const orbit$ = custom.dom
    .select('#orbit_camera')
    .d3dragHandler()
    .events('drag')
    .pluck('event')
    .shareReplay();
    
	const MAX_LATITUDE = 89.99;
	const MIN_LATITUDE = 5;
	
	const latitude_to_theta = d3.scale.linear()
		.domain([90, 0, -90])
		.range([0, Math.PI/2, Math.PI]);
		
	const longitude_to_phi = d3.scale.linear()
		.domain([0, 360])
		.range([0, 2 * Math.PI]);
	
	const delta_theta$ = orbit$
		.pluck('dy')
		.map(dy => theta => theta - dy);
		
	const theta$ = stream
		.merge(
			delta_theta$, to_birds_eye$
		)
		.startWith(45)
		.scan((theta, fn) => fn(theta))
		.map(lat => {
			if (lat >= MAX_LATITUDE) return MAX_LATITUDE;
			if (lat <= MIN_LATITUDE) return MIN_LATITUDE;
			return lat;
		})
		.map(latitude_to_theta);
		
	const phi$ = orbit$
		.pluck('dx')
		.startWith(45)
		.scan((a,b) => a+b)
		.map(longitude_to_phi)
		.map(phi => phi % (2 * Math.PI))
		.map(phi => (phi < 0) ? (2 * Math.PI) + phi : phi);
		
	const polar_position$ = stream
		.combineLatest(
			stream.of(100),
			theta$,
			phi$,
			(radius, theta, phi) => ({ radius, theta, phi })
		);
		
	const relative_position$ = polar_position$
		.map(polarToVector);
		
	const lookAt$ = stream
		.of({
			x: 0, y: 0, z: 0
		});
		
	const position$ = stream
		.combineLatest(
			relative_position$,
			lookAt$,
			(rel, look) => ({
				x: rel.x + look.x,
				y: rel.y + look.y,
				z: rel.z + look.z
			})
		);
		
	const main_camera$ = combineLatestObj({
			position$,
			lookAt$,
			size$
		})
		.map(({ position, lookAt, size }) => {
			return {
				name: 'main',
				size: size,
				position: position,
				zoom: 40,
				lookAt: lookAt
			};
		});
	
	const editor_camera$ = stream
		.just({
			name: 'editor',
			size: {
				width: 300,
				height: 300
			},
			position: {
				x: 10, y: 1, z: 0
			},
			zoom: 50
		});
		
	const add_object$ = custom.dom
		.select('#add_object')
		.events('click')
		.map((ev, i) => ({
			count: i,
			key: i,
			class: 'sound_object',
			type: 'sound_object',
			name: 'sound_object',
			position: {
				x: Math.random() * 2 - 1,
				y: Math.random() * 2 - 1,
				z: Math.random() * 2 - 1,
			},
			volume: Math.random() + 0.4,
			material: {
				color: 'ffffff'
			},
			cones: [
				{
					volume: 2,
					spread: 0.5,
					rotation: {
						x: 0.5,
						y: 0.1,
						z: 0.1
					},
					lookAt: {
						x: 2,
						y: 1,
						z: 1
					}
				}
			],
		}))
		.map(obj => objects => {
			// objects[obj.key] = obj;
			objects.push(obj);
			return objects;
		});
		
	const add_cone_click$ = custom.dom
		.select('#add_cone')
		.events('click')
		.shareReplay();
		
	const add_cone_to_selected$ = add_cone_click$
		// .map(ev => objects => {
		// 	_.values(objects)
		// 		.filter(d => d.selected)
		// 		.map(selected => )
		// })
		
	const sound_objects_update$ = stream
		.merge(
			add_object$,
			select_object$,
			unselect_object$
		);
		
	const sound_objects$ = sound_objects_update$	
		// .startWith({})
		.startWith([])
		.scan(apply)
		// .map(_.values)
		.shareReplay();

	const selected$ = sound_objects$
		.map(arr => arr.filter(d => d.selected)[0]);
		
	const editor$ = selected$
		.map(obj => {
			if (typeof obj !== 'undefined') {
				obj.position = undefined;
				return [obj];
			}
			else return [];
		})
		// .do(log);
	
	const foo$ = stream.of(1,2);
	
	const view$ = combineLatestObj({
			main_camera$,
			editor_camera$,
			size$,
			foo$,
			sound_objects$,
			editor$
		})
		.map(({ main_camera, editor_camera, size, foo, sound_objects, editor }) => {
			return {
				scenes: [
					{
						name: 'editor',
						// floors: [
						//   {
						//     name: 'floor',
						//     _type: 'floor'
						//   }
						// ],
						sound_objects: editor
					},
					{
						name: 'main',
						floors: [
						  {
						    name: 'floor',
						  }
						],
						sound_objects: sound_objects,
					}
				],
				cameras: [ main_camera, editor_camera ],
				renderers: [
					{
						id: 'main',
						name: 'main',
						canvas: '#main-canvas',
						size: size
					},
					{
						name: 'editor',
						canvas: '#editor-canvas',
						size: {
							width: 300,
							height: 300
						}
					}
				],
				renderSets: [
					{
						render_id: 'main',
						scene_id: 'main',
						camera_id: 'main'
					},
					{
						render_id: 'editor',
						scene_id: 'editor',
						camera_id: 'editor'
					}
				]
			};
		});
	
	return {
		custom: view$
	};
}

Cycle.run(main, {
	DOM: CycleDOM.makeDOMDriver('#app'),
	custom: makeCustomDriver('#app')
});

function makeCustomDriver() {

	var container = d3.select('body')
		.append('div');
	
	container
		.append('canvas')
		.attr('id', 'main-canvas')
		.style({
			border: '1px solid black'
		});
		
	container
		.append('canvas')
		.attr('id', 'editor-canvas')
		.style({
			border: '1px solid red'
		})
		.attr({
			height: '300px',
			width: '300px'
		});
		
	var controls = container.append('div');
		
	controls
		.append('button')
		.attr('id', 'orbit_camera')
		.text('orbit_camera')
		.style('height', '100px');
		
	controls
		.append('button')
		.attr('id', 'camera_to_birds_eye')
		.text('camera to birds eye');
		
	controls
		.append('button')
		.attr('id', 'add_cone')
		.text('add cone');
		
	controls
		.append('button')
		.attr('id', 'add_object')
		.text('add object');

	var room_size = {
		width: 20,
		length: 18,
		height: 3
	};
	
	const state = {
		dom: container,
		renderers: d3.select(new Selectable()),
		scenes: d3.select(new Selectable()),
		cameras: d3.select(new Selectable())
	};
	
	const _state = d3.select(new Selectable());
	
	return function customDriver(view$) {
		const dom$ = new Rx.ReplaySubject();
		const scenes$ = new Rx.ReplaySubject();
		const state$ = new Rx.ReplaySubject();
		view$.subscribe(view => {
			debug('view')('view update');
				
			let scenes = _state.selectAll({ _type: 'scene' }).data(view.scenes);
				
			scenes
				.enter()
				.append(function(d) {
					debug('scene')('new scene');
					var new_scene = new THREE.Scene();
					new_scene._type = 'scene';
					new_scene._id = d.name;
					new_scene.name = d.name;
					new_scene.add(getSpotlight());
					new_scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
					scenes$.onNext(scenes);
					return new_scene;
				});
				
			let floors = scenes
				.selectAll({ name: 'floor' })
				.data(d => d.floors || []);
				
			floors.enter()
				.append(d => {
					return getFloor(room_size);
				});
				
			let sound_objects = updateSoundObjects(scenes);
			
			updateCones(sound_objects);
			
			updateCameras(view, state);
	
			updateRenderers(view, _state, container);
				
			view.renderSets
				.forEach(({render_id, scene_id, camera_id}) => {
					let renderer = _state.select({ _type: 'renderer', name: render_id }).node();
					let scene = _state.select({ _type: 'scene', name: scene_id }).node();
					let camera = state.cameras.select({ name: camera_id }).node();
					renderer.render(scene, camera);
				});
			
			dom$.onNext(state.dom);
			// scenes$.onNext(state.scenes);
			state$.onNext(state);
		});
		
		return {
			dom: {
				select: function(selector) {
					let selection$ = dom$.map(dom => dom.select(selector));
					return {
						events: function(type) {
							return selection$.flatMap(observableFromD3Event(type));
						},
						d3dragHandler: function() {
							let handler = d3.behavior.drag();
							let dragHandler$ = selection$
								.map(s => {
									handler.call(s); 
									return handler;
								});
							return {
								events: function(type) {
									return dragHandler$.flatMap(observableFromD3Event(type));
								}
							};
						}
					};
				}
			},
			scenes: scenes$,
			states: state$
		};
	};
}

function updateCameras(view, state) {
	let cameras = state.cameras.selectAll().data(view.cameras);
			
	cameras.enter()
		.append(function(d) {
			debug('camera')('new camera');
			let cam = new THREE.OrthographicCamera();
			cam.name = d.name;
		  return cam;
		});
		
	cameras
		.each(function(d) {
			/** Update camera size if needed */
			if (! _.isMatch(this._size, d.size)) {
				debug('camera')('update size');
				var s = d.size;
				[ this.left, this.right ] = [-1,+1].map(d => d * s.width * 0.5);
				[ this.bottom, this.top ] = [-1,+1].map(d => d * s.height * 0.5);
				this.updateProjectionMatrix();
				this._size = d.size;
			}
			/** Always update lookAt and up with position! */
			if (! _.isMatch(this.position, d.position)) {
			  debug('camera')('update position');
			  this.position.copy(d.position);
			  this.lookAt(d.lookAt || new THREE.Vector3());
			  this.up.copy(new THREE.Vector3(0, 1, 0));
			  /** Apparently we do not need to call `updateProjectionMatrix()` */
			}
			/**
			 * NOTE: You could, in theory, raycast from the middle of the camera's
			 * view to the floor in order to get the "current lookat". But that's
			 * a little crazy, don't you think?
			 */
			/** Update camera zoom */
			if (this.zoom !== d.zoom) {
				debug('camera')('update zoom');
				this.zoom = d.zoom;
				this.updateProjectionMatrix();
			}
		});
}

function updateSoundObjects(scenes) {

	let sound_objects = scenes
		.selectAll({ name: 'sound_object' })
		.data(function(d) { return d.sound_objects || [] });
			
	sound_objects
		.enter()
		.append(function(d) {
			debug('sound object')('new object');
			var geometry = new THREE.SphereGeometry(0.1, 30, 30);
			var PARENT_SPHERE_COLOR = new THREE.Color(0, 0, 0);
			var material = new THREE.MeshPhongMaterial({
				color: PARENT_SPHERE_COLOR,
				transparent: true,
				opacity: 0.3,
				side: THREE.DoubleSide
			});
			var sphere = new THREE.Mesh(geometry, material);
			sphere.castShadow = true;
			sphere.receiveShadow = true;
			sphere.name = d.name;
			sphere._type = 'sound_object';
			sphere._volume = 1;
			sphere.renderOrder = 10;
			return sphere;
		});
			
	sound_objects
		.each(function(d) {
			/** Update position */
			if (! _.isMatch(this.position, d.position)) {
				debug('sound object')('set position', d.position);
				this.position.copy(d.position);
			}
			/** Update geometry */
			let params = this.geometry.parameters;
			if (! _.isMatch(params, { radius: d.volume })) {
				debug('sound object')('set radius', d.volume);
				Object.assign(params, { radius: d.volume });
				let newGeom = new THREE.SphereGeometry(
					params.radius,
					params.widthSegments,
					params.heightSegments
				);
				this.geometry.dispose();
				this.geometry = newGeom;
			}
			/** Update color */
			this.material.color = new THREE.Color(`#${d.material.color}`);
		});
		
	sound_objects
		.exit()
		.each(function(d) {
			this.parent.remove(this);
		});
		
	return sound_objects;
}

function updateCones(sound_objects) {
	let cones = sound_objects
		.selectAll()
		.data(function(d) { return d.cones || [] });
	cones
		.enter()
		.append(getNewCone);
	cones
		.each(updateOneCone);
}

const latitude_to_theta = d3.scale.linear()
	.domain([90, 0, -90])
	.range([0, Math.PI/2, Math.PI]);

function updateOneCone(d) {
	/** Update rotation */
	this.lookAt(d.lookAt || new THREE.Vector3());
	/** If params change, update geometry */
	let cone = this.children[0];
	let params = cone.geometry.parameters;
	let newParams = { height: d.volume, radiusTop: d.spread };
	if (! _.isMatch(params, newParams)) {
		debug('cone')('new geometry');
		Object.assign(params, newParams);
		let newGeom = cylinder_geometry_from_params(params);
		cone.geometry.dispose();
		cone.geometry = newGeom;
		cone.rotation.x = Math.PI/2;
		cone.position.z = cone.geometry.parameters.height / 2;
	}
	/** Update color */
	let SELECTED_COLOR = new THREE.Color("#66c2ff");
	if (d.selected === true) cone.material.color = SELECTED_COLOR;
}

function cylinder_geometry_from_params(params) {
	return new THREE.CylinderGeometry(
		params.radiusTop,
		params.radiusBottom,
		params.height,
		params.radialSegments,
		params.heightSegments,
		params.openEnded
	);
}

function getNewCone() {
	let CONE_BOTTOM = 0.01;
	let CONE_RADIAL_SEGMENTS = 50;
	let params = {
		radiusBottom: CONE_BOTTOM,
		openEnded: true,
		radialSegments: CONE_RADIAL_SEGMENTS
	};
	let geometry = new THREE.CylinderGeometry(
		params.radiusTop,
		params.radiusBottom,
		params.height,
		params.radialSegments,
		params.heightSegments,
		params.openEnded
	);
	let material = new THREE.MeshPhongMaterial({
		transparent: true,
		opacity: 0.5,
		side: THREE.DoubleSide
	});
	let cone = new THREE.Mesh(geometry, material);
	cone.name = 'cone';
	cone._type = 'cone';
	cone.castShadow = true;
	cone.receiveShadow = true;
	let coneParent = new THREE.Object3D();
	coneParent.add(cone);
	return coneParent;	
}

function updateRenderers(view, state, dom) {
	let renderers = state.selectAll({ _type: 'renderer' }).data(view.renderers);
	renderers
		.enter()
		.append(function(d) {
			debug('renderer')('new renderer');
			let renderer = new THREE.WebGLRenderer({
				canvas: dom.select(d.canvas).node(),
				antialias: true
			});
			renderer._type = 'renderer';
			renderer.shadowMap.enabled = true;
			renderer.shadowMap.type = THREE.PCFSoftShadowMap;
			renderer.name = d.name;
			renderer._id = d.name;
			renderer.setClearColor(0xf0f0f0);
			return renderer;
		});
	renderers
		.each(function(d) {
			// console.log(this);
			let current = this.getSize();
			let diff = _.difference(_.values(current), _.values(d.size));
			if (diff.length > 0) {
				debug('renderer')('set size');
				this.setSize(d.size.width, d.size.height);
			}
		});
}

function Selectable() {
	this.children = [];
	this.querySelector = function(query) {
		return this.children.filter(d => _.isMatch(d, query))[0];
	};
	this.querySelectorAll = function(query) {
		if (typeof query === 'undefined') return this.children;
		return this.children.filter(d => _.isMatch(d, query));
	};
	this.appendChild = function(child) {
		this.children.push(child);
		return child;
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

function getNdcFromMouse(mouse, ndc) {
	return {
		x: ndc.x(mouse[0]),
		y: ndc.y(mouse[1])
	};
}

function updateNdcDomain({ width, height }) {
  return function(d) {
    d.x.domain([0, width]);
    d.y.domain([0, height]);
    return d;
  };
}

function apply(o, fn) {
	return fn(o);
}

function polarToVector({ radius, theta, phi }) {
	return {
		x: radius * Math.sin(phi) * Math.sin(theta),
		z: radius * Math.cos(phi) * Math.sin(theta),
		y: radius * Math.cos(theta)
	};
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

function d3TweenStream(duration, name) {
  return stream.create(function(observer) {
    return d3.select({})
      .transition()
      .duration(duration)
      .ease('linear')
      .tween(name, function() {
        return function(t) {
          return observer.onNext(t);
        };
      })
      .each("end", function() {
        return observer.onCompleted();
      });
  });
}