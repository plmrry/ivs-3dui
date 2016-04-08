import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import d3 from 'd3';
import Rx from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

const stream = Rx.Observable;

import { scoped_sound_object } from './soundObject.js';

const room_size = {
	width: 20,
	length: 18,
	height: 3
};

export function component({ add_object$ }, objectComponentCreator) {
	const { scenes_model$, new_object$, selected$ } = model(
			{ add_object$ }, 
			objectComponentCreator
		);
	
	const scenes_state_reducer$ = view(scenes_model$);
	
	return {
		scenes_state_reducer$,
		new_object$,
		selected$
	};
}

export function intent({ 
		main_raycaster$, 
		camera_is_birds_eye$, 
		new_object_proxy$, 
		add_object_click$,
		dom
	}) {
	const new_object_key$ = new_object_proxy$
		.pluck('id');
		
	const add_object_mode$ = stream
		.merge(
			add_object_click$.map(() => true),
			new_object_proxy$.map(() => false)
		)
		.startWith(false)
		.shareReplay(1);
	
	const selected_object$ = main_raycaster$
		.filter(({ event }) => event.type === 'dragstart')
		.withLatestFrom(
			add_object_mode$,
			(event, mode) => ({ event, mode })
		)
		.filter(({ mode }) => mode !== true)
		.pluck('event', 'intersect_groups')
		.flatMapLatest(arr => stream.from(arr))
		.pluck('intersects', '0', 'object')
		.map(obj => {
			if (obj.name === 'sound_object') return d3.select(obj).datum().key;
			/** TODO: Better way of selecting parent when child cone is clicked? */
			if (obj.name === 'cone') return d3.select(obj.parent.parent).datum().key;
			return undefined;
		})
		.merge(new_object_key$);
	
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
		.pluck('point');
		
	const add_cone$ = dom
		.select('#add-cone')
		.events('click')
		.shareReplay(1);
	
	return {
		add_object$,
		selected_object$,
		add_cone$
	};
}

export function model(
		{ add_object$ }, 
		objectComponentCreator
	) {
	const new_object$ = add_object$
		.map(objectComponentCreator)
		.shareReplay(1);
	
	const sound_objects$ = new_object$
		.map(new_obj => array => array.concat(new_obj))
		.startWith([])
		.scan(apply)
		.map(arr => arr.map(d => d.model$))
		.flatMapLatest(stream.combineLatest)
		.startWith([]);
		
	const selected$ = sound_objects$
		.map(arr => arr.filter(d => d.selected)[0])
		.shareReplay();
		
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
				obj.position = undefined;
				return [obj];
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
			
		const screens = screens_join
			.enter()
			.append(d => {
				return getScreen();
			})
			.merge(screens_join);
					
		const sound_objects = updateSoundObjects2(scenes);
		
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
}

function updateSoundObjects2(scenes) {
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

function log(d) { console.log(d); }

function apply(o, fn) { return fn(o); }

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