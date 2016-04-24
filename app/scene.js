import debug from 'debug';
import THREE from 'three/three.js';
import _ from 'underscore';
import d3 from 'd3';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';

import log from './utilities/log.js';
import apply from './utilities/apply.js';

const room_size = {
	width: 20,
	length: 18,
	height: 3
};

export function view(model$) {
	return model$.map(state_reducer);
}

function state_reducer(model) {
  return function(selectable) {
    const scenes = updateScenes(selectable, model)
      .select(function() { return this.scene; });
    const floors = updateFloors(scenes);
    const heads = updateHeads(scenes);
    const parents = updateSoundObjectParents(scenes);
    const trajectories = updateTrajectories(parents);
    const control_points = updateControlPoints(trajectories);
    const sound_objects = updateSoundObjects(parents);
    const cones = updateCones(sound_objects);
			
		return selectable;
  };
}

function updateSoundObjects(parents) {
	const join = parents
		.selectAll({ name: 'sound_object' })
		.data(function(d) { return d.sound_objects || [] });
		
	join
		.exit()
		.each(function(d) {
			this.parent.remove(this);
		});
			
	const sound_objects = join
		.enter()
		.append(function(d) {
			debug('reducer:sound-object')('new object');
			const geometry = new THREE.SphereGeometry(0.1, 30, 30);
			const PARENT_SPHERE_COLOR = new THREE.Color(0, 0, 0);
			const material = new THREE.MeshPhongMaterial({
				color: PARENT_SPHERE_COLOR,
				transparent: true,
				opacity: 0.3,
				side: THREE.DoubleSide
			});
			const object = new THREE.Mesh(geometry, material);
			object.castShadow = true;
			object.receiveShadow = true;
			object.name = 'sound_object';
			object.renderOrder = 10;
			return object;
		})
		.merge(join)
		.each(function({ position, volume, material }) {
			/** Update position */
			if (! _.isMatch(this.position, position)) {
				debug('sound object')('set position', position);
				this.position.copy(position);
			}
			/** Update geometry */
			let params = this.geometry.parameters;
			if (! _.isMatch(params, { radius: volume })) {
				debug('sound object')('set radius', volume);
				Object.assign(params, { radius: volume });
				let newGeom = new THREE.SphereGeometry(
					params.radius,
					params.widthSegments,
					params.heightSegments
				);
				this.geometry.dispose();
				this.geometry = newGeom;
			}
			/** Update color */
			this.material.color = new THREE.Color(`#${material.color}`);
		});
		
	return sound_objects;
}

function updateControlPoints(trajectories) {
  const join = trajectories
    .selectAll({ name: 'trajectory_control_point' })
    .data(d => d.curve.points || []);
  const control_points = join
		.enter()
		.append(function(d) {
			const geometry = new THREE.SphereGeometry(0.2, 30, 30);
      const material = new THREE.MeshPhongMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.5
      });
      const controlPoint = new THREE.Mesh(geometry, material);
      controlPoint.castShadow = true;
      controlPoint.receiveShadow = true;
      controlPoint.name = 'trajectory_control_point';
      return controlPoint;
		})
		.merge(join)
		.each(function(d) {
			this.position.copy(d);
		});
	return control_points;
}

function updateHeads(scenes) {
  const join = scenes
    .selectAll({ name: 'head' })
    .data(d => d.heads || []);
  const heads = join
    .enter()
    .append(d => {
      const head = d.object;
      head.rotation.y += Math.PI;
      head.children[0].castShadow = true;
      const scale = 0.5;
      head.scale.set(scale, scale, scale);
      head.name = d.name;
      return head;
    })
    .merge(join)
		.each(function(d) {
			this.position.copy(d.position);
			// this.lookAt(d.lookAt);
		});
	return heads;
}

function updateTrajectories(parents) {
  const join = parents
    .selectAll({ name: 'trajectory' })
    .data(d => d.trajectories || []);
  const trajectories = join
		.enter()
		.append(function(d) {
			const geometry = new THREE.TubeGeometry(d.curve, 100, 0.05, 8, true);
			const material = new THREE.MeshPhongMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.5
      });
      const trajectory = new THREE.Mesh(geometry, material);
      trajectory.castShadow = true;
      trajectory.name = 'trajectory';
      return trajectory;
		})
		.merge(join);
	return trajectories;
}

function updateSoundObjectParents(scenes) {
  const join = scenes
    .selectAll({ name: 'sound_object_parent' })
    .data(d => d.sound_objects || []);
  const objects = join
    .enter()
    .append(d => {
      /** FIXME: Business logic in driver :/ */
      const { points, splineType } = d;
      const curve = new THREE[splineType](points);
      curve.closed = true;
      d.curve = curve;
      /** Create object */
      const object = new THREE.Object3D();
      object.name = 'sound_object_parent';
      return object;
    })
    .merge(join)
    .each(function(d) {
      /** FIXME: Business logic in driver :/ */
      const { curve, t, position, volume, material, cones } = d;
      const { points } = curve;
      d.trajectories = points.length > 1 ? [
        {
          curve
        }
      ] : [];
      const trajectoryOffset = points.length > 1 ? 
        curve.getPoint(t) : 
        new THREE.Vector3();
      d.sound_objects = [
        {
          position: trajectoryOffset,
          volume,
          material,
          cones
        }
      ];
      /** Update position */
			if (! _.isMatch(this.position, position)) {
				debug('reducer:sound-object-parent')('set position', position);
				this.position.copy(position);
			}
    });
  return objects;
}

function updateScenes(selectable, model) {
  const join = d3
      .select(selectable)
      .selectAll()
      .data(model);
  return join
    .enter()
    .append(function({ name }) {
			debug('reducer:scene')('new scene');
			var scene = new THREE.Scene();
			scene.add(getSpotlight());
			scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
			return {
			  name,
			  scene
			};
		})
		.merge(join);
}

function updateFloors(scenes) {
  const floors_join = scenes
		.selectAll({ name: 'floor' })
		.data(d => d.floors || []);
	const floors = floors_join
		.enter()
		.append(() => {
			return getFloor(room_size);
		})
		.merge(floors_join);
	return floors;
}

// function state_reducer(model) {
//   return function(selectable) {
//     const scenes_join = d3_selection
// 			.select(selectable)
// 			.selectAll()
// 			.data(model);
					
// 		const scenes = scenes_join
// 			.enter()
// 			.append(function(d) {
// 				debug('scene')('new scene');
// 				var new_scene = new THREE.Scene();
// 				new_scene._type = 'scene';
// 				new_scene._id = d.name;
// 				new_scene.name = d.name;
// 				new_scene.add(getSpotlight());
// 				// new_scene.add(getDirectionalLight())
// 				new_scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
// 				return new_scene;
// 			})
// 			.merge(scenes_join);
					
// 		const floors_join = scenes
// 			.selectAll({ name: 'floor' })
// 			.data(d => d.floors || []);
				
// 		const floors = floors_join
// 			.enter()
// 			.append(d => {
// 				return getFloor(room_size);
// 			})
// 			.merge(floors_join);
			
// 		const screens_join = scenes
// 			.selectAll({ name: 'screen' })
// 			.data(d => d.screens || []);
			
// 		const panels = screens_join
// 			.enter()
// 			.append(d => {
// 				return getScreen();
// 			})
// 			.merge(screens_join);
					
// 		const sound_objects = updateSoundObjects(scenes);
		
// 		const sound_object_parents = scenes
// 			.selectAll({ name: 'sound_object_parent' });
			
// 		const trajectories_join = sound_object_parents
// 			.selectAll({ name: 'trajectory' })
// 			.data(d => d.trajectories || []);
			
// 		const trajectories = trajectories_join
// 			.enter()
// 			.append(function(d) {
// 				const vectors = d.points.map(v => (new THREE.Vector3()).copy(v));
// 				const curve = new THREE[d.splineType](vectors);
// 				curve.closed = true;
// 				const geometry = new THREE.TubeGeometry(curve, 100, 0.05, 8, true);
// 				const material = new THREE.MeshPhongMaterial({
//           color: 0x000000,
//           transparent: true,
//           opacity: 0.5
//         });
//         const trajectory = new THREE.Mesh(geometry, material);
//         trajectory.castShadow = true;
//         trajectory.name = 'trajectory';
//         return trajectory;
// 			})
// 			.merge(trajectories_join);
			
// 		const control_points_join = trajectories
// 			.selectAll({ name: 'trajectory_control_point' })
// 			.data(d => d.points || []);
			
// 		const control_points = control_points_join
// 			.enter()
// 			.append(function(d) {
// 				const geometry = new THREE.SphereGeometry(0.2, 30, 30);
//         const material = new THREE.MeshPhongMaterial({
//           color: 0x000000,
//           transparent: true,
//           opacity: 0.5
//         });
//         const controlPoint = new THREE.Mesh(geometry, material);
//         controlPoint.castShadow = true;
//         controlPoint.receiveShadow = true;
//         controlPoint.name = 'trajectory_control_point';
//         return controlPoint;
// 			})
// 			.merge(control_points_join)
// 			.each(function(d) {
// 				this.position.copy(d);
// 			});
		
// 		updateCones(sound_objects);
		
// 		const heads_join = scenes
// 			.selectAll({ name: 'head' })
// 			.data(d => d.heads || []);
			
// 		const heads = heads_join
// 			.enter()
// 			.append(d => {
// 				const head = d.object;
// 				head.rotation.y += Math.PI;
// 				const scale = 0.5;
// 				head.children[0].castShadow = true;
// 				head.scale.set(scale, scale, scale);
// 				head.name = d.name;
// 				return head;
// 			})
// 			.merge(heads_join)
// 			.each(function(d) {
// 				this.position.copy(d.position);
// 				// this.lookAt(d.lookAt);
// 			})
		
//     return selectable;
//   };
// }

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

function getDirectionalLight() {
	var dirLight = new THREE.DirectionalLight( 0xffffff, 1 );
	dirLight.color.setHSL( 0.1, 1, 0.95 );
	dirLight.position.set( -1, 1.75, 1 );
	dirLight.position.multiplyScalar( 50 );
	dirLight.castShadow = true;
	dirLight.shadowMapWidth = 2048;
	dirLight.shadowMapHeight = 2048;
	var d = 50;
	dirLight.shadowCameraLeft = -d;
	dirLight.shadowCameraRight = d;
	dirLight.shadowCameraTop = d;
	dirLight.shadowCameraBottom = -d;
	dirLight.shadowCameraFar = 3500;
	dirLight.shadowBias = -0.0001;
	dirLight.shadowDarkness = 0.35;
	return dirLight;
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

// function updateSoundObjects(scenes) {
// 	let sound_objects_join = scenes
// 		.selectAll({ name: 'sound_object_parent' })
// 		.data(function(d) { return d.sound_objects || [] });
		
// 	sound_objects_join
// 		.exit()
// 		.each(function(d) {
// 			this.parent.remove(this);
// 		});
			
// 	const sound_objects = sound_objects_join
// 		.enter()
// 		.append(function(d) {
// 			debug('sound object')('new object');
// 			var geometry = new THREE.SphereGeometry(0.1, 30, 30);
// 			var PARENT_SPHERE_COLOR = new THREE.Color(0, 0, 0);
// 			var material = new THREE.MeshPhongMaterial({
// 				color: PARENT_SPHERE_COLOR,
// 				transparent: true,
// 				opacity: 0.3,
// 				side: THREE.DoubleSide
// 			});
// 			var sphere = new THREE.Mesh(geometry, material);
// 			sphere.castShadow = true;
// 			sphere.receiveShadow = true;
// 			sphere.name = 'sound_object';
// 			sphere._type = 'sound_object';
// 			sphere._volume = 1;
// 			sphere.renderOrder = 10;
// 			const object_parent = new THREE.Object3D();
// 			object_parent.name = 'sound_object_parent';
// 			object_parent.add(sphere);
// 			return object_parent;
// 			// return sphere;
// 		})
// 		.merge(sound_objects_join)
// 		.each(function(d) {
// 			/** Update position */
// 			if (! _.isMatch(this.position, d.position)) {
// 				debug('sound object')('set position', d.position);
// 				this.position.copy(d.position);
// 			}
// 		})
// 		.select({ name: 'sound_object' })
// 		.each(function(d) {
// 		  /** Update quaternion */
// 		  // if (! _.isMatch(this.quaternion, d.quaternion)) {
// 		  //   this.quaternion.copy(d.quaternion);
// 				// var vec = new THREE.Vector3(0,0,1);
// 				// var m = this.matrixWorld;
// 				// var mx = m.elements[12], my = m.elements[13], mz = m.elements[14];
// 				// m.elements[12] = m.elements[13] = m.elements[14] = 0;
// 				// vec.applyProjection(m);
// 				// vec.normalize();
// 				// m.elements[12] = mx;
// 				// m.elements[13] = my;
// 				// m.elements[14] = mz;
// 		  // }
// 		  /** FIXME: This is lame. DRY. */
// 			/** FIXME: An object should be a point inside a trajectory */
// 			d.trajectories = d.trajectories || [];
// 			if (d.trajectories.length > 0) {
// 				const traj = d.trajectories[0];
// 				const vectors = traj.points.map(v => (new THREE.Vector3()).copy(v));
// 				const curve = new THREE[traj.splineType](vectors);
// 				curve.closed = true;
// 				const trajectoryOffset = curve.getPoint(d.t);
// 				if (! _.isMatch(this.position, trajectoryOffset)) {
// 					debug('sound object')('set trajectory position', trajectoryOffset);
// 					this.position.copy(trajectoryOffset);
// 				}
// 			}
// 			// /** Update position */
// 			// if (! _.isMatch(this.position, d.position)) {
// 			// 	debug('sound object')('set position', d.position);
// 			// 	this.position.copy(d.position);
// 			// }
// 			/** Update geometry */
// 			let params = this.geometry.parameters;
// 			if (! _.isMatch(params, { radius: d.volume })) {
// 				debug('sound object')('set radius', d.volume);
// 				Object.assign(params, { radius: d.volume });
// 				let newGeom = new THREE.SphereGeometry(
// 					params.radius,
// 					params.widthSegments,
// 					params.heightSegments
// 				);
// 				this.geometry.dispose();
// 				this.geometry = newGeom;
// 			}
// 			/** Update color */
// 			this.material.color = new THREE.Color(`#${d.material.color}`);
// 		});
		
// 	return sound_objects;
// }

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