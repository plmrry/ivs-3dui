if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

var container;
var camera, scene, renderer;
var mouse, raycaster, isShiftDown = false;
var isAdding = isRemoving = false;

var interactiveCone, interactiveConeMaterial;
var objects = new THREE.Object3D();

init();
render();

function init() {

    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );
    camera.position.set( 500, 800, 1300 );
    camera.lookAt( new THREE.Vector3() );

    scene = new THREE.Scene();

    interactiveConeGeo = new THREE.CylinderGeometry(100, 0, 600, 100, 1, true);
    interactiveConeGeo.translate(0, 300, 0);
    interactiveConeGeo.rotateX(Math.PI/2.);
    interactiveConeMaterial = new THREE.MeshBasicMaterial({color: 0x80FFE5, opacity: 0.5});
    interactiveCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
    interactiveCone.material.side = THREE.DoubleSide;
    interactiveCone.material.transparent = true;
    interactiveCone.visible = false; // Make its visibility to off for now

    scene.add( interactiveCone, objects );

    //

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    var geometry = new THREE.SphereBufferGeometry( 300, 100, 100 );

    sphere = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( {color: 0xFFFFFF, opacity: 0.6 } ) );
    sphere.material.transparent = true;
    scene.add( sphere );

    objects.add( sphere );

    // Lights

    var ambientLight = new THREE.AmbientLight( 0x606060 );
    scene.add( ambientLight );

    var directionalLight = new THREE.DirectionalLight( 0xffffff );
    directionalLight.position.set( 1, 0.75, 0.5 ).normalize();
    scene.add( directionalLight );

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setClearColor( 0xf0f0f0 );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );

    container = document.getElementById('IVS');
    container.appendChild( renderer.domElement );


    document.addEventListener( 'mousemove', onDocumentMouseMove, false );
    document.addEventListener( 'mousedown', onDocumentMouseDown, false );
    document.addEventListener( 'keydown', onDocumentKeyDown, false );
    document.addEventListener( 'keyup', onDocumentKeyUp, false );

    document.getElementById("plus").addEventListener("click", onClickAdd, false);
    document.getElementById("minus").addEventListener("click", onClickRemove, false);
    //

    window.addEventListener( 'resize', onWindowResize, false );

}

function onClickAdd() {

    isAdding = true;
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

function onDocumentMouseMove( event ) {

    event.preventDefault();

    mouse.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    if (isAdding) {

        raycaster.setFromCamera( mouse, camera );

        var intersects = raycaster.intersectObjects( objects.children );

        if ( intersects.length > 0 ) {

            var intersect = intersects[ 0 ];

            interactiveCone.lookAt(intersect.point);

        }

        render();
    }

}

function onDocumentMouseDown( event ) {

    event.preventDefault();

    mouse.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    raycaster.setFromCamera( mouse, camera );

    var intersects = raycaster.intersectObjects( objects.children );

    if ( intersects.length > 0 ) {

        var intersect = intersects[ 0 ];

        // delete cone

        if ( isRemoving ) {

            if ( intersect.object != sphere ) {

                // scene.remove( intersect.object );

                objects.remove( intersect.object );
                isRemoving = false;
            }

        // create cone

        } else {

            if (isAdding) {

                var placedCone = new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
                placedCone.lookAt(intersect.point);

                objects.add( placedCone );
                isAdding = false;
                interactiveCone.visible = false;

            }

        }

        render();

    }

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

function render() {

    renderer.render( scene, camera );

}

