import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3_selection from 'd3-selection';
import Rx from 'rx';

const stream = Rx.Observable;

const room_size = {
	width: 20,
	length: 18,
	height: 3
};

export function component({ dom, main_intersects$, editor_intersects$ }) {
  const clicked$ = main_intersects$
		.pairwise()
		.filter(arr => arr[0].event.type === 'dragstart')
		.filter(arr => arr[1].event.type === 'dragend')
		.pluck('1');
		
	// const editor_mousemove$ = dom
	// 	.select('#editor-canvas')
		
	const clicked_key$ = clicked$
		.pluck('intersects')
		.map(arr => arr.filter(d => d.key === 'sound_objects'))
		.pluck('0', 'intersects', '0', 'object')
		.map(o => {
			if (typeof o !== 'undefined') {
				/** TODO: Better way of selecting parent when child cone is clicked? */
				if (o._type === 'cone') return o.parent.parent.__data__.key;
				return o.__data__.key;
			}
			return undefined;
		})
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
		
	const add_object$ = dom
		.select('#add-object')
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
			return objects.concat(obj);
		});
		
	const add_cone_click$ = dom
		.select('#add-cone-random')
		.events('click')
		.shareReplay()
		// .subscribe(log)
		
	const add_cone_random$ = add_cone_click$
		.map(ev => {
			let DEFAULT_CONE_VOLUME = 1;
			let DEFAULT_CONE_SPREAD = 0.5;
			return {
				volume: DEFAULT_CONE_VOLUME,
				spread: DEFAULT_CONE_SPREAD,
				lookAt: {
					x: Math.random(),
					y: Math.random(),
					z: Math.random()
				},
				interactive: true
			};
		})
		.map(cone => objects => {
			return objects.map(obj => {
				if (obj.selected === true) obj.cones.push(cone);
				return obj;
			});
		});
		
	const sound_objects_update$ = stream
		.merge(
			add_object$,
			select_object$,
			unselect_object$,
			add_cone_random$
		);
		
	const sound_objects$ = sound_objects_update$	
		.startWith([])
		.scan(apply)
		.shareReplay();
		
	// const selected$ = sound_objects$
	// 	.map(arr => arr.filter(d => d.selected)[0])
	// 	.do(s => debug('selected')(s))
	// 	.subscribe()
	
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
		
	return main_scene_model$;
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
					
		const sound_objects = updateSoundObjects2(scenes);
		
		updateCones(sound_objects);
    return selectable;
  };
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