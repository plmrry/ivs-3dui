import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import log from './log.js';
import apply from './apply.js';

const stream = Rx.Observable;

const room_size = {
	width: 20,
	length: 18,
	height: 3
};

function subVectors(arr) {
	return {
		x: arr[0].floor_point.x - arr[1].floor_point.x,
		y: arr[0].floor_point.y - arr[1].floor_point.y,
		z: arr[0].floor_point.z - arr[1].floor_point.z
	};
}

function intent({
		raycasters, main_dragstart$, main_drag$, main_dragend$,
		camera_is_birds_eye$, add_object_click$, new_object_proxy$, dom
	}) {
	const main_raycaster$ = raycasters
		.select({ name: 'main' })
		.pluck('event$')
		.flatMapLatest(obs => obs)
		.shareReplay(1)
		.distinctUntilChanged()
	
	const main_floor_pairwise_delta$ = main_dragstart$
		.flatMap(start => main_drag$
			.startWith(start)
			.pairwise()
			.takeUntil(main_dragend$)
		)
		.map(subVectors)
		.withLatestFrom(
			main_dragstart$,
			(delta, start) => ({ delta, start })
		);
	
	const drag_object$ = main_floor_pairwise_delta$
		.filter(({ start: { first_object_key } }) => typeof first_object_key !== 'undefined')
		.withLatestFrom(
			camera_is_birds_eye$,
			(drag, camera) => ({ drag, camera })
		);
		
	/** Adding a new object turns off add object mode */
	const add_object_mode$ = stream
		.merge(
			add_object_click$.map(() => true),
			new_object_proxy$.map(() => false) 
		)
		.startWith(false);
		
	const new_object_key$ = new_object_proxy$
		.pluck('key');
		
	const selected_object$ = main_dragstart$
		.withLatestFrom(
			add_object_mode$,
			(event, mode) => ({ event, mode })
		)
		.filter(({ mode }) => mode !== true)
		.pluck('event')
		.pluck('first_object_key')
		.merge(new_object_key$)
		.shareReplay(1);
	
	const add_object$ = main_raycaster$
		.pairwise()
		.filter(arr => arr[0].event.type === 'dragstart')
		.filter(arr => arr[1].event.type === 'dragend')
		.pluck('1')
		.pluck('intersect_groups')
		.flatMapLatest(arr => stream.from(arr))
		.pluck('intersects')
		.flatMapLatest(arr => stream.from(arr))
		.filter(({ object }) => object.name === 'floor')
		.pluck('point')
		.withLatestFrom(
			add_object_mode$,
			camera_is_birds_eye$,
			(point, mode, birds) => ({ point, mode, birds })
		)
		.filter(({ mode, birds}) => mode === true && birds === true)
		.pluck('point')
		.do(debug('event:add-object'));
		
	const delete_selected_object$ = dom
		.select('#delete-object')
		.events('click');
		
	const add_cone$ = dom
		.select('#add-cone')
		.events('click');
		
	const editor_raycaster$ = raycasters
		.select({ name: 'editor' })
		.pluck('event$')
		.flatMapLatest(obs => obs);
		
	const editor_intersects$ = editor_raycaster$
		.map(({ event, intersect_groups, mouse }) => {
			const intersects = intersect_groups[0].intersects;
			const cones = intersects
				.filter(({ object: { name } }) => name === 'cone')
				.map(({ object }) => object);
			const screens = intersects
				.filter(({ object: { name } }) => name === 'screen')
			const screen_point = typeof screens[0] === 'undefined' ? undefined : screens[0].point;
			const first_cone = cones[0];
			const first_cone_key = first_cone ? d3.select(first_cone).datum().key : undefined;
			return {
				event,
				screen_point,
				intersects,
				cones,
				first_cone,
				first_cone_key,
				mouse
			};
		})
		.distinctUntilChanged();
		
	const editor_mousemove$ = editor_intersects$
		.filter(({ event }) => event.type === 'mousemove');
		
	const editor_dragstart$ = editor_intersects$
		.filter(({ event }) => event.type === 'dragstart')
		.shareReplay(1);
		
	const editor_drag$ = editor_intersects$
		.filter(({ event: { type } }) => type === 'drag');
		
	const editor_dragend$ = editor_intersects$
		.filter(({ event: { type } }) => type === 'dragend');
		
	const selected_cone$ = editor_dragstart$
	  .filter(({ first_cone }) => typeof first_cone !== 'undefined')
	  .pluck('first_cone_key');
	  
	const drag_sphere$ = editor_dragstart$
		.filter(({ first_cone }) => typeof first_cone === 'undefined')
		.flatMap(start => editor_drag$
			.startWith(start)
			.takeUntil(editor_dragend$)
		)
		.pluck('mouse', 'mouse')
		.pairwise()
		.map(arr => {
			return {
				dx: arr[1][0] - arr[0][0],
				dy: arr[1][1] - arr[0][1]
			};
		})
		// .subscribe(log)
		
	const drag_cone$ = editor_dragstart$
		.filter(({ first_cone }) => typeof first_cone !== 'undefined')
		.flatMap(start => editor_drag$
			.startWith(start)
			.takeUntil(editor_dragend$)
		)
		.pluck('screen_point');
		// .pluck('first_cone')
		// .map(const intersects = intersect_groups[0].intersects;)
		// .filter((obj) => { debugger })
		// .subscribe(log);
		
	const editor_mousemove_screen$ = editor_mousemove$
		.pluck('screen_point');
		
	return {
		add_object$, drag_object$, selected_object$, delete_selected_object$,
		add_cone$, editor_mousemove_screen$, editor_dragstart$, drag_cone$,
		selected_cone$, drag_sphere$
	};
}

export function component({
		raycasters, main_dragstart$, main_drag$, main_dragend$,
		camera_is_birds_eye$, add_object_click$, dom
	}) {
		
	const new_object_proxy$ = new Rx.Subject();
		
	const actions = intent({
		raycasters, main_dragstart$, main_drag$, main_dragend$,
		camera_is_birds_eye$, add_object_click$, new_object_proxy$, dom
	});
	
	const { scenes_model$, new_object$, selected$ } = model(actions);
	
	new_object$.subscribe(new_object_proxy$);
	
	const scenes_state_reducer$ = view(scenes_model$);
	
	return {
		scenes_state_reducer$,
		new_object$,
		selected$
	};
}

function subtractVectors(a, b) {
	return {
		x: a.x - b.x,
		y: a.y - b.y,
		z: a.z - b.z
	};
}

export function model({ 
	add_object$, drag_object$, selected_object$, delete_selected_object$,
	add_cone$, editor_mousemove_screen$, editor_dragstart$, drag_cone$,
	selected_cone$, drag_sphere$
}) {
	const new_object$ = new Rx.Subject();
	
	const add_object_update$ = add_object$
		.map(position => objects => {
			const max = d3.max(objects, d => d.id);
			const id = typeof max === 'undefined' ? 0 : max + 1;
			const new_object = {
				id,
				key: id,
				name: 'sound_object',
				position: {
					x: position.x,
					y: position.y,
					z: position.z
				},
				quaternion: new THREE.Quaternion(),
				volume: 1,
				material: {
					color: 'ffffff'
				},
				cones: [],
				selected: true
			};
			new_object$.onNext(new_object);
			return objects.concat(new_object);
		});
		
	const delete_object_update$ = delete_selected_object$
		.withLatestFrom(
			selected_object$,
			(del, selected) => selected
		)
		.map(key => objects => objects.filter(obj => obj.key !== key));
		
	const selected_object_update$ = selected_object$
		.map(key => object => {
			if (key === object.key) {
				object.selected = true;
				object.material.color = '66c2ff';
			}
			else {
				object.selected = false;
				object.material.color = 'ffffff';
			}
			return object;
		});
		
	const drag_x_z_update$ = drag_object$
		.filter(({ camera }) => camera === true)
		.map(({ drag: { delta: { x, z }, start } }) => {
			const delta = { x, y: 0, z };
			const key = start.first_object_key;
			return { delta, key };
		})
		.map(({ delta, key }) => obj => {
			if (obj.key === key) obj.position = subtractVectors(obj.position, delta);
			return obj;
		});
		
	const add_cone_to_selected$ = add_cone$
		.let(withSelected(selected_object$, addCone));
		
	const select_cone$ = selected_cone$
		.let(withSelected(selected_object$, setSelected))
		
	const move_dragged$ = drag_cone$
		.let(withSelected(selected_object$, moveSelected));
		
	const rotate_object$ = drag_sphere$
	  .let(withSelected(selected_object$, rotateObject));
		
	const move_interactive$ = editor_mousemove_screen$
		.let(withSelected(selected_object$, moveInteractiveCone));
		
	const disable_interactive$ = editor_dragstart$
		.let(withSelected(selected_object$, disableInteractiveCone));
		
	function toRadians(angle) {
    return angle * (Math.PI / 180);
	}
		
	function rotateObject({ dx, dy }) {
	  const euler = new THREE.Euler(
	    toRadians(dx * 0.2),
	    toRadians(dy * 0.2),
	    0
	  );
	  const delta_quaternion = (new THREE.Quaternion()).setFromEuler(euler);
	  return function(object) {
	    object.quaternion.multiplyQuaternions(delta_quaternion, object.quaternion);
	  };
	}
		
	function moveSelected(lookAt) {
		return function(object) {
			object.cones = object.cones.map(cone => {
				if (cone.selected) cone.lookAt = lookAt;
				return cone;
			});
		};
	}
		
	function setSelected(key) {
		return function(object) {
			object.cones = object.cones.map(cone => {
				if (cone.key === key) cone.selected = true;
				return cone;
			});
		};
	}
		
	function disableInteractiveCone(_) {
		return function(object) {
			object.cones = object.cones.map(cone => {
				if (cone.interactive) cone.interactive = false;
				if (cone.selected) cone.selected = false;
				return cone;
			});
		};
	}
		
	function moveInteractiveCone(lookAt) {
		return function(object) {
			object.cones = object.cones.map(cone => {
				if (cone.interactive) cone.lookAt = lookAt;
				return cone;
			});
		};
	}
	
	function addCone(value) {
		return function(object) {
			const maxKey = d3.max(object.cones, d => d.key);
			const key = typeof maxKey === 'undefined' ? 0 : maxKey + 1;
			const parentKey = object.key;
			object.cones.push(getNewCone(key, parentKey));
		};
	}
		
	function withSelected(selected_object$, func) {
		return function(observable) {
			return observable
				.withLatestFrom(
					selected_object$,
					(value, key) => ({ value, key })
				)
				.map(({ value, key }) => obj => {
					if (obj.key === key) func(value)(obj);
					return obj;
				});
		};
	}
		
	function getNewCone(key) {
		return {
			key,
			volume: 1,
			spread: 0.5,
			interactive: true,
			selected: true,
			lookAt: {
				x: Math.random(),
				y: Math.random(),
				z: Math.random()
			}
		};
	}
		
	const object_update$ = stream
		.merge(
			drag_x_z_update$,
			selected_object_update$,
			add_cone_to_selected$,
			move_interactive$,
			disable_interactive$,
			select_cone$,
			move_dragged$
			// rotate_object$
		)
		.map(update => objects => objects.map(update));
		
	const sound_objects$ = stream
		.merge(
			add_object_update$,
			delete_object_update$,
			object_update$
		)
		.startWith([])
		.scan(apply)
		.do(debug('sound objects'))
		.shareReplay(1);
		
	const selected$ = sound_objects$
		.map(arr => arr.filter(d => d.selected)[0])
		.shareReplay(1);
		
	const main_scene_model$ = sound_objects$
		.map(sound_objects => {
			return {
				name: 'main',
				floors: [
					{
						name: 'floor'
					}
				],
				sound_objects
			};
		});
		
	const editor_sound_objects_model$ = selected$
		.map(obj => {
			if (typeof obj !== 'undefined') {
				const position = {
					x: 0, y: 0, z: 0
				};
				return [Object.assign({}, obj, { position })];
			}
			else return [];
		});
		
	const editor_scene_model$ = editor_sound_objects_model$
		.map(sound_objects => {
			return {
				name: 'editor',
				sound_objects,
				screens: [
					{}
				]
			};
		});
		
	const scenes_model$ = stream
		.combineLatest(
			main_scene_model$,
			editor_scene_model$
		);
		
	return {
		scenes_model$,
		new_object$,
		selected$
	};
}

export function view(model$) {
	return model$
		.map(model => state_reducer(model));
}

export function state_reducer(model) {
  return function(selectable) {
    const scenes_join = d3_selection
			.select(selectable)
			.selectAll()
			.data(model);
					
		const scenes = scenes_join
			.enter()
			.append(function(d) {
				debug('scene')('new scene');
				var new_scene = new THREE.Scene();
				new_scene._type = 'scene';
				new_scene._id = d.name;
				new_scene.name = d.name;
				new_scene.add(getSpotlight());
				new_scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
				return new_scene;
			})
			.merge(scenes_join);
					
		const floors_join = scenes
			.selectAll({ name: 'floor' })
			.data(d => d.floors || []);
				
		const floors = floors_join
			.enter()
			.append(d => {
				return getFloor(room_size);
			})
			.merge(floors_join);
			
		const screens_join = scenes
			.selectAll({ name: 'screen' })
			.data(d => d.screens || []);
			
		const panels = screens_join
			.enter()
			.append(d => {
				return getScreen();
			})
			.merge(screens_join);
					
		const sound_objects = updateSoundObjects(scenes);
		
		updateCones(sound_objects);
    return selectable;
  };
}

function getScreen() {
	const geometry = new THREE.PlaneGeometry(6, 6);
	const material = new THREE.MeshPhongMaterial({
		// color: new THREE.Color(1, 0.5, 0.5),
		// side: THREE.DoubleSide,
		depthWrite: false
	});
	material.opacity = 0;
	material.transparent = true;
	const screen = new THREE.Mesh(geometry, material);
	screen.position.z = 4;
	screen.name = 'screen';
	return screen;
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

function updateCones(sound_objects) {
	let join = sound_objects
		.selectAll()
		.data(function(d) { return d.cones || [] });
	join
		.exit()
		.each(function(d) {
			this.parent.remove(this);
		});
	return join
		.enter()
		.append(getNewCone)
		.merge(join)
		.each(updateOneCone);
}

function getNewCone(d) {
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
	d3.select(cone).datum(d);
	let coneParent = new THREE.Object3D();
	coneParent.name = 'cone_parent';
	coneParent.add(cone);
	return coneParent;	
}

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
	else cone.material.color = new THREE.Color('#ffffff');
	/** Update color */
// 	cone.material.color = new THREE.Color(`#${d.material.color}`);
}

function updateSoundObjects(scenes) {
	let sound_objects_join = scenes
		.selectAll({ name: 'sound_object' })
		.data(function(d) { return d.sound_objects || [] });
		
	sound_objects_join
		.exit()
		.each(function(d) {
			this.parent.remove(this);
		});
			
	const sound_objects = sound_objects_join
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
		})
		.merge(sound_objects_join)
		.each(function(d) {
		  /** Update quaternion */
		  if (! _.isMatch(this.quaternion, d.quaternion)) {
		    this.quaternion.copy(d.quaternion);
				var vec = new THREE.Vector3(0,0,1);
				var m = this.matrixWorld;
				var mx = m.elements[12], my = m.elements[13], mz = m.elements[14];
				m.elements[12] = m.elements[13] = m.elements[14] = 0;
				vec.applyProjection(m);
				vec.normalize();
				m.elements[12] = mx;
				m.elements[13] = my;
				m.elements[14] = mz;
		  }
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
		
	return sound_objects;
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

// function apply(o, fn) { return fn(o); }

THREE.Object3D.prototype.appendChild = function (c) { 
	this.add(c); 
	return c; 
};

THREE.Object3D.prototype.insertBefore = THREE.Object3D.prototype.appendChild;

THREE.Object3D.prototype.querySelector = function(query) {
	let key = Object.keys(query)[0];
	return this.getObjectByProperty(key, query[key]);
};

THREE.Object3D.prototype.querySelectorAll = function (query) { 
	if (typeof query === 'undefined') return this.children;
	return this.children.filter(d => _.isMatch(d, query));
};