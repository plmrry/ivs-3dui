/*  overrides three.js triangulate with earcut.js algorithm for the conversion of a curve to a filled (2D) path. still doesn't produce desired behavior with some non-simple paths */

THREE.ShapeUtils.triangulate = function ( contour, indices ) {

	var n = contour.length;

	if ( n < 3 ) return null;

	var result = [],
		verts = [],
		vertIndices = [];

	// flatten contour into 1d array e.g [x0,y0, x1,y1, x2,y2, ...]
	var path = [];
	contour.forEach(function(point) {
		path.push(point.x, point.y);
	});
	(function() {
		var triangles = earcut(path);
		var nTri = triangles.length;

		for (var i = 0; i < nTri; i+=3) {
			var a = triangles[i],
			    b = triangles[i+1],
			    c = triangles[i+2];
			vertIndices.push([a, b, c]);
			result.push( [ contour[ a ],
			               contour[ b ],
			               contour[ c ] ] );
		}
	})();

	if ( indices ) return vertIndices;
	return result;

};