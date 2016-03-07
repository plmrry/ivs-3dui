if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

var global = {};

function _( el ) {
    if (el === undefined)
        return global;

    if (global.hasOwnProperty( el )) {

        if (arguments.length > 1 )
            // assign value to element and return it
            return global[ el ] = arguments[1];
        else
            // get it's value
            return global[ el ]

    }
    // otherwise, set the value,
    else {
        // or throw error if one is missing
        if (arguments[1] === null ) console.error("missing arguments to _() function! ")

        return global[ el ] = arguments[1];
    }

}


function Start() {
    onCreate();
    onFrame();
}



function onCreate() {
    _("scene", new THREE.Scene() );

    initRenderer();
    initCamera();
    initLights();
    initDivs();
    initBools()
    initCone();
    initSphere();
    initListeners();

}



function onClickAdd() {
    _("isAdding", true);
    _( "isRemoving", false); _("isDragging", false);
    _("interactiveCone").visible = true;
    _("plus").className = "on";
}

function onClickRemove() {

    _("isAdding", false);
    _("isRemoving", true); _("isDragging", false);
    _("interactiveCone").visible = false;
    _("minus").className = "on";
}

function onWindowResize() {

    _("camera").aspect = window.innerWidth / window.innerHeight;
    _("camera").updateProjectionMatrix();

    _("renderer").setSize( window.innerWidth, window.innerHeight );

}


function intersects( event, list ) {

    event.preventDefault();

    _("mouse").set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    _("raycaster").setFromCamera( _("mouse"), _("camera") );

    return _("raycaster").intersectObjects( list )[0];

}

function onDocumentMouseDown( event ) {
    console.log('mouseDown', _("isDragging"), _("isAdding"), _("isRemoving"));
    var _intersect = intersects(event, _("objects").children);

    if ( _intersect != undefined ) {
        console.log("intersects.length > 0", _intersect.point);

        // delete cone
        if ( _("isRemoving") ) {
            console.log("\tisRemoving");

            if ( _intersect.object != _("sphere") ) {

                _("objects").remove( _intersect.object );


                _("isAdding", false); _("isRemoving", false); _("isDragging", false);
                console.log('isRemoving', _("isDragging"), _("isAdding"), _("isRemoving"));
                _("minus").className = "";

            }

        // create cone
        } else if ( _("isAdding") ) {
            var placedCone = _('interactiveCone').clone(); //new THREE.Mesh( interactiveConeGeo, interactiveConeMaterial );
            // First we need to add the cone to the parent
            _("objects").add( placedCone );

            // then, we tell the cone (now a child of the parent object) to
            // look at the postion of the _intersected object's position,
            // which has been converted from world coordinates to local
            placedCone.lookAt( _intersect.object.worldToLocal( _intersect.point ) );

            _('interactiveCone').visible = false;


            _("isAdding", false); _("isRemoving", false); _("isDragging", false);
            console.log('isAdding', _("isDragging"), _("isAdding"), _("isRemoving"));
            _("plus").className = "";


        } else {
            console.log('else..', _("isDragging"), _("isAdding"), _("isRemoving"));
            if ( _intersect.object === _("sphere") ) {
                _("isDragging", true);

                _("isAdding", false); _("isRemoving", false);
                console.log('else..', _("isDragging"), _("isAdding"), _("isRemoving"));

            }
        }

        draw();

    } else {

        _("isAdding", false); _("isRemoving", false);
    }

}


function onDocumentMouseMove( event ) {
    event.preventDefault();

    _("mouse").set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    if (_("isAdding")) {

        _("raycaster").setFromCamera( _("mouse"), _("camera") );

        var intersects = _("raycaster").intersectObjects( _("objects").children );

        if ( intersects.length > 0 ) {

            var intersect = intersects[ 0 ];

            _("interactiveCone").lookAt(intersect.point);
            console.log(intersect.point);
        }

        draw();

    } else if(_("isDragging")) {
        console.log("isDragging", _("isDragging")); //, mouse.x, mouse.y);
        var deltaMove = {
            x: event.offsetX-_("prevMousePos").x,
            y: event.offsetY-_("prevMousePos").y
        };

        var deltaRotationQuaternion = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(
                toRadians(deltaMove.y * 1),
                toRadians(deltaMove.x * 1),
                0,
                'XYZ'
            ));

        _("objects").quaternion.multiplyQuaternions(deltaRotationQuaternion, _("objects").quaternion);
        draw();

    }

    _("prevMousePos", {
        x: event.offsetX,
        y: event.offsetY
    });

}

function onDocumentMouseUp( event ) {
    console.log('mouseUp!');
    if (_("isDragging")){
        _("isDragging", false); _("isAdding", false); _("isRemoving", false);
        console.log('mouseUp', _("isDragging"), _("isAdding"), _("isRemoving"));
    }

}

function onFrame() {
    requestAnimationFrame( onFrame );
    draw();

}

function draw() {

    _("renderer").render( _("scene"), _("camera") );

}


function toRadians(angle) {
    return angle * (Math.PI / 180);
}

function toDegrees(angle) {
    return angle * (180 / Math.PI);
}