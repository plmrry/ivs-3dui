var Soundzone = function(points) {

	this.type = 'Soundzone';
	this.isActive = true;

	this.splinePoints = points;
	this.pointObjects;
	this.cursor;
	this.spline;
	this.shape;

	var geometry, material;

	// splinePoints control the curve of the path
	this.pointObjects = (function() {
		// setup
		var cube = new THREE.BoxGeometry( 5, 5, 5 );		
		var cubeMat = new THREE.MeshBasicMaterial( { color:0xff0000 } );
		var cubeMesh = new THREE.Mesh( cube, cubeMat );
		
		var collider = new THREE.SphereGeometry(10);
		var colliderMat = new THREE.MeshBasicMaterial( {transparent:true, opacity:0});
		var colliderMesh = new THREE.Mesh( collider, colliderMat );

		var group = new THREE.Object3D();
		group.add(cubeMesh, colliderMesh);

		// place a meshgroup at each point in array
		var pointObjects = [];
		points.forEach(function(point) {
			group.position.x = point.x,
			group.position.y = point.y;

			pointObjects.push(group.clone());
		})


		return pointObjects;
	
	})();

	// cursor indicates which location/obj the mouse is pointed at
	this.cursor = new THREE.Mesh(
		new THREE.BoxGeometry(9,9,9),
		new THREE.MeshBasicMaterial({ color:0x00ccff })
	);
	this.cursor.visible = false;

	// a soundzone is a closed, filled path
	// trajectory may need to be modified for this
	this.spline = new THREE.CatmullRomCurve3(points);
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

	var shape = new THREE.Shape(); /////// the algorithm used by three.js is not very robust, consider replacing with earcut
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
	    scene.add(this.objects, this.cursor);
	},
	removeFromScene: function(scene) {
		scene.remove(this.objects, this.cursor);
	},

	// raycast to this soundzone
	isUnderMouse: function(raycaster, mouse, camera) {
		if (this.isActive) {
			return raycaster.intersectObjects( this.objects ).length > 0;
		}
		else {
			return raycaster.intersectObject( this.shape ).length > 0;
		}
	},
	objectUnderMouse: function(raycaster, mouse, camera) {
		// todo
	},

	move: function(x, y, offsetX = 0, offsetY = 0) {}, // todo

	setActive: function() {
		this.isActive = true;
		this.pointObjects.forEach(function(obj) {
			obj.visible = true;
		});
		this.spline.mesh.visible = true;
	},

	setInactive: function() {
		this.isActive = false;
		this.pointObjects.forEach(function(obj) {
			obj.visible = false;
		});
		this.spline.mesh.visible = false;
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
	beginAt: function(point) {
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
			clear();
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