// Initializers


function initCamera() {

    _("camera", new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 ) );
    _("camera").position.set( 500, 800, 1300 );
    _("camera").lookAt( new THREE.Vector3() );

    _("raycaster", new THREE.Raycaster() );
    _("mouse", new THREE.Vector2() );

    _("prevMousePos", { x: 0, y: 0 });

}

function initRenderer() {
    _("renderer", new THREE.WebGLRenderer( { antialias: true } ));
    _("renderer").setClearColor( 0xf0f0f0 );
    _("renderer").setPixelRatio( window.devicePixelRatio );
    _("renderer").setSize( window.innerWidth, window.innerHeight );

    _('container', document.getElementById('IVS') );
    _('container').appendChild( _("renderer").domElement );

}

function initDivs() {
    _("plus", document.getElementById("plus") );
    _("minus", document.getElementById("minus") );
}

function initCone() {

    _("interactiveConeGeo",
            new THREE.CylinderGeometry(100, 0, 600, 100, 1, true)
                .translate(0, 300, 0)
                .rotateX(Math.PI/2.)
    );

    _("interactiveConeMaterial", new THREE.MeshBasicMaterial({color: 0x80FFE5, opacity: 0.5}) );
    _("interactiveCone", new THREE.Mesh( _("interactiveConeGeo"), _("interactiveConeMaterial") ));
    _("interactiveCone").material.side = THREE.DoubleSide;
    _("interactiveCone").material.transparent = true;
    _("interactiveCone").visible = false; // Make its visibility to off for now

    _("scene").add( _("interactiveCone") );

}


function initBools() {
    _("isAdding", false);
    _("isRemoving", false);
    _("isDragging", false);
}

function initListeners() {

    _('plus').addEventListener("click", onClickAdd, false);
    // _('minus').addEventListener("click", onClickRemove, false);

    _('container').addEventListener( 'click', onDocumentMouseClick, false );
    _('container').addEventListener( 'mousemove', onDocumentMouseMove, false );
    document.addEventListener( 'keydown', onDocumentKeyDown, false );

    // document.addEventListener( 'mouseup', onDocumentMouseUp, false );

    window.addEventListener( 'resize', onWindowResize, false );
}


function initSphere() {


    var geometry = new THREE.SphereBufferGeometry( 300, 100, 100 );
    _("sphere", new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( {color: 0xFFFFFF, opacity: 0.6 } ) ) );
    _("sphere").material.transparent = true;
    _("sphere").name = "Sphere";  // debugging purposes more than anything

    _("objects", new THREE.Object3D() );
    _("objects").name = "Objects"
    _("objects").add( _("sphere") );
    _("scene").add( _("objects") );


}

function initLights() {
    // Lights
    var ambientLight = new THREE.AmbientLight( 0x606060 );
    var directionalLight = new THREE.DirectionalLight( 0xffffff );
    directionalLight.position.set( 1, 0.75, 0.5 ).normalize();

    _("scene").add( ambientLight, directionalLight );
}