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

var _plus = document.getElementById("plus");
var _minus = document.getElementById("minus");

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
    sphere.name = "Sphere";  // debugging purposes more than anything
    objects.add( sphere );


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

    _plus.addEventListener("click", onClickAdd, false);
    _minus.addEventListener("click", onClickRemove, false);

    window.addEventListener( 'resize', onWindowResize, false );

}


function onClickAdd() {
    isAdding = true;
    isRemoving = isDragging = false;
    interactiveCone.visible = true;
    _plus.className = "on";
}

function onClickRemove() {

    isAdding = false;
    isRemoving = true;
    interactiveCone.visible = false;
    _minus.className = "on";
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
                _minus.className = "";
            }

        // create cone
        } else if (isAdding) {
            var placedCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
            // First we need to add the cone to the parent
            objects.add( placedCone );

            // then, we tell the cone (now a child of the parent object) to
            // look at the postion of the intersected object's position,
            // which has been converted from world coordinates to local
            placedCone.lookAt( intersect.object.worldToLocal( intersect.point ) );

            interactiveCone.visible = false;
            isAdding = isRemoving = isDragging = false;
            _plus.className = "";


        } else {
            console.log("\telse..", isDragging, isAdding, isRemoving);
            if ( intersect.object === sphere ) {
                isDragging = true;
                isAdding = isRemoving = false;

            }
        }

        render();

    } else {
        isAdding = isRemoving = false;
    }

}


function onDocumentMouseMove( event ) {
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
        render();

    } else if (cameraControls.enableRotate) {
        render();
    }

    previousMousePosition = {
        x: event.offsetX,
        y: event.offsetY
    };

}

function onDocumentMouseUp( event ) {

    if (isDragging)
        isDragging = isAdding = isRemoving = false;

    if (cameraControls.enableRotate)
        cameraControls.enableRotate = false;

}

function animate() {
    requestAnimationFrame( animate );
    cameraControls.update();
    render();

}

function render() {

    renderer.render( scene, camera );

}


function toRadians(angle) {
    return angle * (Math.PI / 180);
}

function toDegrees(angle) {
    return angle * (180 / Math.PI);
}