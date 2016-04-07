var Soundzone = function(points) {

	this.type = 'Soundzone';
	this.isActive = true;

	this.splinePoints = points;
	this.pointObjects;
	this.spline;
	this.shape;

	this.selectedPoint;
	this.mouseOffsetX = 0, this.mouseOffsetY = 0;

	var geometry, material;

	// cursor indicates which location/obj the mouse is pointed at
	this.cursor = new THREE.Mesh(
		new THREE.BoxGeometry(9,9,9),
		new THREE.MeshBasicMaterial({ color:0x00ccff })
	);
	this.cursor.visible = false;


	this.renderPath = function() {
		// splinePoints control the curve of the path
		var points = this.splinePoints;
		this.pointObjects = (function() {
			// setup
			var cube = new THREE.BoxGeometry( 5, 5, 5 );		
			var cubeMat = new THREE.MeshBasicMaterial( { color:0xff0000 } );
			
			var collider = new THREE.SphereGeometry(15);
			var colliderMat = new THREE.MeshBasicMaterial( {color:0xff0000, transparent:true, opacity:0});
			var colliderMesh = new THREE.Mesh( collider, colliderMat );

			// place a meshgroup at each point in array
			var pointObjects = [];
			points.forEach(function(point) {
				var cubeMesh = new THREE.Mesh( cube, cubeMat.clone() );
				var group = new THREE.Object3D();

				group.add(cubeMesh, colliderMesh.clone());
				group.position.x = point.x,
				group.position.y = point.y;

				pointObjects.push(group);
			})


			return pointObjects;
		
		})();

		// a soundzone is a closed, filled path
		// trajectory may need to be modified for this
		this.spline = new THREE.CatmullRomCurve3(this.splinePoints);
		this.spline.type = 'centripetal';
		this.spline.closed = true;
		geometry = new THREE.Geometry();
		geometry.vertices = this.spline.getPoints(200);
		material = new THREE.LineBasicMaterial({
			color: 0xff0000,
			linewidth:1,
			transparent:true,
			opacity:0.4
		});
		this.spline.mesh = new THREE.Line( geometry, material );

		// fill the path
		var shape = new THREE.Shape();
		shape.fromPoints(geometry.vertices);
		geometry = new THREE.ShapeGeometry(shape);
		material = new THREE.MeshPhongMaterial({
			color: 0xff0000,
			transparent: true,
			opacity: 0.2,
			side: THREE.DoubleSide,
			depthWrite: false
		});
		this.shape = new THREE.Mesh(geometry,material);
	}
	this.renderPath();
}


Soundzone.prototype = {

	constructor: Soundzone,

	get objects() {
		return [].concat(this.pointObjects, this.spline.mesh, this.shape);
	},

	contains: function (obj) {
		return ( obj === this.shape || 
			     obj === this.spline.mesh || 
			     this.pointObjects.some(point => point === obj) );
	},

	addToScene: function(scene) {
		this.objects.forEach(obj => scene.add(obj));
	    scene.add(this.cursor);
	},
	removeFromScene: function(scene) {
		this.objects.forEach(obj => scene.remove(obj, true));
		scene.remove(this.cursor);
	},

	// raycast to this soundzone
	isUnderMouse: function(raycaster) {
		if (this.isActive) {
			return raycaster.intersectObjects( this.objects ).length > 0;
		}
		else {
			return raycaster.intersectObject( this.shape ).length > 0;
		}
	},
	objectUnderMouse: function(raycaster) {
		var intersects = raycaster.intersectObjects( this.objects, true );

		if (intersects.length > 0) {
			if (intersects[0].object.type === 'Line') {
				return intersects[Math.floor(intersects.length/2)];
			}
			else
				return intersects[0];
		}
		return null;
	},

	setMouseOffset: function(point) {
		this.mouseOffsetX = point.x,
		this.mouseOffsetY = point.y;
	},
	move: function(point, obj) {
		if (this.selectedPoint) {
			// move selected point
			var i = this.pointObjects.indexOf(this.selectedPoint);
			if (i > -1) {
				this.showCursor(false);
				this.splinePoints[i].copy(point);
				this.updateShape();
				this.selectPoint(this.pointObjects[i]);
			}
		}
		else {
			// move entire shape
			var dx = point.x - this.mouseOffsetX;
			var dy = point.y - this.mouseOffsetY;
			this.mouseOffsetX = point.x, this.mouseOffsetY = point.y;

			this.objects.forEach(function(obj) {
				obj.position.x += dx;
				obj.position.y += dy;
			});
			this.splinePoints.forEach(function(pt) {
				pt.x += dx;
				pt.y += dy;
			});
		}
	},

	setCursor: function(point) {
		this.cursor.position.copy(point);
	},
	showCursor: function(bool) {
		if (bool === undefined)
			this.cursor.visible = true;
		this.cursor.visible = bool;
	},

	setActive: function() {
		this.isActive = true;
		this.pointObjects.forEach(function(obj) {
			obj.visible = true;
		});
		this.spline.mesh.visible = true;
	},

	setInactive: function() {
		this.deselectPoint();
		this.showCursor(false);
		this.isActive = false;
		this.pointObjects.forEach(function(obj) {
			obj.visible = false;
		});
		this.spline.mesh.visible = false;
	},

	select: function(intersect) {
		if (!intersect) return;

		// obj can be the curve, a spline point, or the shape mesh
		var obj = intersect.object;

		if (obj.type === 'Line') {
			//add a point to the line
			this.addPoint(intersect.point);
		}
		else if (obj.parent.type === 'Object3D') {
			// select an existing point on line
			this.selectPoint(obj.parent);
		}
		else {
			this.deselectPoint();
			this.setMouseOffset(intersect.point);
		}
	},

	selectPoint: function(obj) {
		this.deselectPoint();
		this.selectedPoint = obj;
		obj.children[0].material.color.set('blue');
	},
	deselectPoint: function() {
		if (this.selectedPoint) {
			this.selectedPoint.children[0].material.color.set('red');
			this.selectedPoint = null;
		}
	},
	addPoint: function(position) {

		var closestSplinePoint = 0;
		var prevDistToSplinePoint = -1;
		var minDistance = Number.MAX_VALUE;
		var minPoint = 1;

		// search for point on spline
		for (var t=0; t < 1; t+=1/200.0) {
			var pt = this.spline.getPoint(t);

			var distToSplinePoint = this.splinePoints[closestSplinePoint].distanceToSquared(pt);
			if (distToSplinePoint > prevDistToSplinePoint) {
				++closestSplinePoint;
				if (closestSplinePoint >= this.splinePoints.length)
					closestSplinePoint = 0;
			}
			prevDistToSplinePoint = this.splinePoints[closestSplinePoint].distanceToSquared(pt);
			var distToPoint = pt.distanceToSquared(position);
			if (distToPoint < minDistance) {
				minDistance = distToPoint;
				minPoint = closestSplinePoint;
			}
		}
//		console.log(minPoint);

		this.splinePoints.splice(minPoint, 0, position);
		this.updateShape();
		this.selectPoint(this.pointObjects[minPoint]);

	},
	removePoint: function() {
		// find point in array
		var i = this.pointObjects.indexOf(this.selectedPoint);
		this.splinePoints.splice(i,1);
		this.deselectPoint();
		this.updateShape();
	},
	updateShape: function() {
		var scene = this.spline.mesh.parent;
		this.removeFromScene(scene);
		this.renderPath();
		this.addToScene(scene);
	}
}


drawing = {                   // live drawing by mouse
	scene: null,              //    the scene
	points: [],               //    points on path
	lines: [],                //    lines on the scene
	lastPoint: new THREE.Vector3(),

	setScene: function(scene) {
		this.scene = scene;
	},
	beginAt: function(point, scene) {
		this.lastPoint = point;
		this.points = [point];
	},
	addPoint: function(point) {
		if (this.scene === null) {
			console.log('scene not set');
			return;
		}

		var material = new THREE.LineBasicMaterial({
			color: 0xff0000
		});
		var geometry = new THREE.Geometry();
		geometry.vertices.push(this.lastPoint, point);
		var line = new THREE.Line(geometry,material);

		this.lastPoint = point;
		this.points.push(point);
		this.lines.push(line);
		this.scene.add(line);
	},
	createObject: function() {
		// simplify points using algorithm from simplify.js
		// tolerance = 10 is a somewhat arbitrary number :-\
		var points = simplify(this.points, 10, true);
		var object;
		if (points.length >= 3) {
			object = new Soundzone(points);
		}
		// else {}                       // not enough points = a sound OBJECT

		this.clear();

		if (this.scene && object)
			object.addToScene(this.scene);
		return object;
	},
	clear: function() {
		var scene = this.scene;
		this.lines.forEach(function(line) {
			scene.remove(line);
		});
		this.lines = [];
		this.points = [];
	}
}