if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

var container, cameraControls;
var camera, scene, renderer;
var mouse, raycaster, isShiftDown = false;
var isAdding = isRemoving = isDragging = false;
var face;
var _last = new THREE.Vector4();
var _inverse = new THREE.Matrix4();
var _v4 = new THREE.Vector3();
var _vector = new THREE.Vector3();

var previousMousePosition = {
    x: 0,
    y: 0
}

var interactiveCone, interactiveConeMaterial;
var objects;

init();
animate();

function init() {

    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );
    camera.position.set( 500, 800, 1300 );
    camera.lookAt( new THREE.Vector3() );

    scene = new THREE.Scene();

    objects = new THREE.Object3D();
    objects.name = "Objects"
    scene.add( objects );


    interactiveConeGeo = new THREE.CylinderGeometry(100, 0, 600, 100, 1, true);
    interactiveConeGeo.translate(0, 300, 0);
    interactiveConeGeo.rotateX(Math.PI/2.);
    interactiveConeMaterial = new THREE.MeshBasicMaterial({color: 0x80FFE5, opacity: 0.5});
    interactiveCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
    interactiveCone.material.side = THREE.DoubleSide;
    interactiveCone.material.transparent = true;
    interactiveCone.visible = false; // Make its visibility to off for now
    scene.add( interactiveCone );

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    var geometry = new THREE.SphereBufferGeometry( 300, 100, 100 );
    sphere = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( {color: 0xFFFFFF, opacity: 0.6 } ) );
    sphere.material.transparent = true;
    sphere.name = "Sphere"
    objects.add( sphere );


    // face = new THREE.VertexNormalsHelper(sphere, 20, 0xff33ff);
    // scene.add(face);
    // Lights

    var ambientLight = new THREE.AmbientLight( 0x606060 );

    var directionalLight = new THREE.DirectionalLight( 0xffffff );
    directionalLight.position.set( 1, 0.75, 0.5 ).normalize();

    scene.add( ambientLight );
    scene.add( directionalLight );


    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setClearColor( 0xf0f0f0 );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );


    cameraControls = new THREE.OrbitControls( camera, renderer.domElement );
    cameraControls.enableZoom = false;
    cameraControls.enablePan = false;
    cameraControls.enableRotate = false;
    cameraControls.enableDamping = true;
    cameraControls.target.set( 0, 0, 0 );
    // cameraControls.addEventListener( 'change', render );


    container = document.getElementById('IVS');
    container.appendChild( renderer.domElement );

    document.addEventListener( 'mousemove', onDocumentMouseMove, false );
    document.addEventListener( 'mousedown', onDocumentMouseDown, false );
    document.addEventListener( 'mouseup', onDocumentMouseUp, false );
    document.addEventListener( 'keydown', onDocumentKeyDown, false );
    document.addEventListener( 'keyup', onDocumentKeyUp, false );

    document.getElementById("plus").addEventListener("click", onClickAdd, false);
    document.getElementById("minus").addEventListener("click", onClickRemove, false);

    window.addEventListener( 'resize', onWindowResize, false );

}

function onClickAdd() {

    isAdding = true;
    isRemoving = isDragging = false;
    interactiveCone.visible = true;
}

function onClickRemove() {

    isAdding = false;
    isRemoving = true;
    interactiveCone.visible = false;
}


function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}


function onDocumentMouseDown( event ) {
    console.log('mouseDown', isDragging, isAdding, isRemoving, cameraControls.enableRotate);
    event.preventDefault();

    mouse.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    raycaster.setFromCamera( mouse, camera );

    var intersects = raycaster.intersectObjects( objects.children );

    if ( intersects.length > 0 ) {
        console.log("intersects.length > 0", intersects[0].point);
        var intersect = intersects[ 0 ];

        // delete cone

        if ( isRemoving ) {
            console.log("\tisRemoving");
            if ( intersect.object != sphere ) {

                // scene.remove( intersect.object );

                objects.remove( intersect.object );
                isAdding = isRemoving = isDragging = false;
            }

        // create cone

        } else if (isAdding) {
            var placedCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
            // placedCone.lookAt(intersect.point);
            // placedCone.visible = false;
            // scene.add(placedCone);

            var m = placedCone.quaternion.clone();
            // _inverse.getInverse(objects.matrix);
            // _v4.copy( intersect.point );
            // _v4.applyMatrix4(_inverse);
            // THREE.SceneUtils.attach( placedCone, scene, objects );
            objects.add( placedCone );
            placedCone.lookAt( intersect.object.worldToLocal( intersect.point ) );
            // placedCone.lookAt ( intersect.point );

            // placedCone.quaternion.multiplyQuaternions(m, objects.quaternion);
            // .matrix.makeRotationFromQuaternion (m);
            console.log("\tisAdding", intersect.point, placedCone);
            interactiveCone.visible = false;
            isAdding = isRemoving = isDragging = false;
            cameraControls.enableRotate = false;

        } else {
            console.log("\telse..", isDragging, isAdding, isRemoving, cameraControls.enableRotate);
            if ( intersect.object === sphere ) {
                isDragging = true;
                isAdding = isRemoving = false;
                cameraControls.enableRotate = false;
            }
        }

        render();

    } else {
        // isDragging = true;
        isAdding = isRemoving = false;
        cameraControls.enableRotate = true;
    }

}


function onDocumentMouseMove( event ) {
    // console.log('mouseMove', isDragging, isAdding, isRemoving, cameraControls.enableRotate);

    event.preventDefault();

    mouse.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    if (isAdding) {

        raycaster.setFromCamera( mouse, camera );

        var intersects = raycaster.intersectObjects( objects.children );

        if ( intersects.length > 0 ) {

            var intersect = intersects[ 0 ];

            interactiveCone.lookAt(intersect.point);
            console.log(intersect.point);
        }

        render();

    } else if(isDragging) {
        console.log("isDragging", isDragging); //, mouse.x, mouse.y);
        var deltaMove = {
            // x: mouse.x-previousMousePosition.x,
            // y: mouse.y-previousMousePosition.y
            x: event.offsetX-previousMousePosition.x,
            y: event.offsetY-previousMousePosition.y
        };

        var deltaRotationQuaternion = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(
                toRadians(deltaMove.y * 1),
                toRadians(deltaMove.x * 1),
                0,
                'XYZ'
            ));

        objects.quaternion.multiplyQuaternions(deltaRotationQuaternion, objects.quaternion);
        // face.update();
        render();

    } else if (cameraControls.enableRotate) {
        render();
    }

    previousMousePosition = {
        // x: mouse.x,
        // y: mouse.y
        x: event.offsetX,
        y: event.offsetY
    };

}

function onDocumentMouseUp( event ) {
    console.log('mouseUp', isDragging, isAdding, isRemoving, cameraControls.enableRotate);
    if (isDragging)
        isDragging = isAdding = isRemoving = false;

    if (cameraControls.enableRotate)
        cameraControls.enableRotate = false;

}

function onDocumentKeyDown( event ) {

    switch( event.keyCode ) {

        case 16: isShiftDown = true; break;

    }

}

function onDocumentKeyUp( event ) {

    switch ( event.keyCode ) {

        case 16: isShiftDown = false; break;

    }

}


function animate() {
    requestAnimationFrame( animate );
    cameraControls.update();
    render();

}

function render() {

    renderer.render( scene, camera );

}



// $(renderer.domElement).on('mousedown', function(e) {
//     isDragging = true;
// })
// .on('mousemove', function(e) {
//     //console.log(e);

//     var deltaMove = {
//         x: e.offsetX-previousMousePosition.x,
//         y: e.offsetY-previousMousePosition.y
//     };

//     if(isDragging) {

//         var deltaRotationQuaternion = new THREE.Quaternion()
//             .setFromEuler(new THREE.Euler(
//                 toRadians(deltaMove.y * 1),
//                 toRadians(deltaMove.x * 1),
//                 0,
//                 'XYZ'
//             ));

//         objects.quaternion.multiplyQuaternions(deltaRotationQuaternion, objects.quaternion);
//     }

//     previousMousePosition = {
//         x: e.offsetX,
//         y: e.offsetY
//     };
// });
// /* */

// $(document).on('mouseup', function(e) {
//     isDragging = false;
// });


function toRadians(angle) {
    return angle * (Math.PI / 180);
}

function toDegrees(angle) {
    return angle * (180 / Math.PI);
}