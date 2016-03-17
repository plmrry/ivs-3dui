var Soundzone = function(points) {

	this.type = 'Soundzone';
	this.isActive = true;

	this.splinePoints = points;
	this.pointObjects,
	this.spline,
	this.shape;

	var geometry, material;

	// splinePoints control the curve of the path
	var pointObjects = [];
	points.forEach(function(point) {
		geometry = new THREE.BoxGeometry( 7, 7, 7 );
		material = new THREE.MeshBasicMaterial( { color:0xff0000 } );
		var pcube = new THREE.Mesh( geometry, material );
		pcube.position.x = point.x;
		pcube.position.y = point.y;
		pointObjects.push(pcube);
	});
	this.pointObjects = pointObjects;

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

    scene.add(this.pointObjects, this.spline.mesh, this.shape);
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

	setActive: function() {
		this.isActive = true;
	},

	setInactive: function() {
		this.isActive = false;
	}
}


drawing = {               // live drawing by mouse
	points: [],               //    points on path
	lines: [],                //    lines on the scene
	beginAt: function(point) {
		this.points = [point];
	},
	addPoint: function(point) {
		var material = new THREE.LineBasicMaterial({
			color: 0xff0000
		});
		var geometry = new THREE.Geometry();
		geometry.vertices.push(this.points.peek(), point);
		var line = new THREE.Line(geometry,material);
		scene.add(line);
		this.points.push(point);
		this.lines.push(line);
	},
	getPoints: function() {
		var points = simplify(this.points,10,true); // :-\
		return points;
	},
	clear: function() {
		this.lines.forEach(function(line) {
			scene.remove(line);
		});
		this.lines = [];
	}
}