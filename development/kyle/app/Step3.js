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
    if ( ! _("isAdding") ) {

        _("isAdding", true);
        _( "isRemoving", false); _("isDragging", false);
        _("interactiveCone").visible = true;
        _("plus").className = "on";

        // First we need to add the cone to an empty parent object
        var placedCone = new THREE.Object3D().add( _('interactiveCone').clone() );
        _("objects").add( placedCone );

        // Set the new cone as our Active object
        _('activeCone', placedCone);

        // turn off the Interactive cone
        _('interactiveCone').visible = false;


        // Set Dragging to true so it starts moving right away
        _("isDragging", true);

        // Leave this on
        _("isAdding", true);

        // Debugging
        console.log('isAdding', _("isDragging"), _("isAdding"), _("isRemoving"));

        // draw it
        draw();
    }

}




function onWindowResize() {

    _("camera").aspect = window.innerWidth / window.innerHeight;
    _("camera").updateProjectionMatrix();
    _("renderer").setSize( window.innerWidth, window.innerHeight );

}


function onDocumentMouseClick( event ) {

    var _intersect = intersects(event, _("objects").children);
    if ( _("isAdding") ) {
        // Turn off the addition color
        _("plus").className = "";

        // Remove reference to the _activeCone
        _('activeCone', null);

        // // Set Dragging to true so it starts moving right away
        _("isDragging", false);

        // // Turn off adding stuff
        _("isAdding", false);
    }
    else if ( _intersect !== undefined ) {
        console.log("_intersect", _intersect === _("sphere"), _("sphere"));
        if ( _intersect.object != _("sphere") ) {
            // set the activeCone to the selected object (presumably the cone..)
            // console.log("_intersect", _intersect);
            _('activeCone', _intersect.object.parent)
            _("isDragging", true);

        } else
            _("isDragging", false);
    }
    else {
        if ( !_("isDragging") )
            _("isDragging", true);
        else
            _("isDragging", false);

        _('activeCone', null);
    }
    console.log("click, _intersect", _intersect);
    draw();
}


function onDocumentMouseDown( event ) {
    console.log('mouseDown', _("isDragging"), _("isAdding"), _("isRemoving"));
    var _intersect = intersects(event, _("objects").children);

    if ( _intersect === undefined ) {
        _("isDragging", true);
    }

    if ( _intersect != undefined &&  _intersect.object != _("sphere") ) {
        console.log("intersects.length > 0", _intersect.point);

        // delete cone
        if ( _intersect.object === _("sphere") ) {
            _("isDragging", true);

            _("isAdding", false); _("isRemoving", false);
            console.log('else..', _("isDragging"), _("isAdding"), _("isRemoving"));

        }

        draw();

    } else {

        _("isAdding", false); _("isRemoving", false);
    }

}


function onDocumentMouseMove( event ) {
    event.preventDefault();

    console.log("Moving", _("isDragging"), _('activeCone') );
    _("mouse").set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    if(_("isDragging")) {
        console.log("isDragging", _("isDragging"), _('activeCone')); //, mouse.x, mouse.y);
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

        if (_('activeCone') != null )
            _('activeCone').quaternion.multiplyQuaternions(deltaRotationQuaternion, _('activeCone').quaternion);
        else
            _('objects').quaternion.multiplyQuaternions(deltaRotationQuaternion, _('objects').quaternion);
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


function onDocumentKeyDown( event ) {
    console.log(event.keyCode);
    switch( event.keyCode ) {
        case 8:
            event.preventDefault();
            if ( _("activeCone") ) {
                console.log("delete me");
                _("objects").remove( _("activeCone") );
                _("activeCone", null);
            }
        break;

    }

}


function onFrame() {
    requestAnimationFrame( onFrame );
    draw();

}

function draw() {

    _("renderer").render( _("scene"), _("camera") );

}


function intersects( event, list ) {

    event.preventDefault();

    _("mouse").set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1 );

    _("raycaster").setFromCamera( _("mouse"), _("camera") );

    return _("raycaster").intersectObjects( list, true )[0];

}


function toRadians(angle) {
    return angle * (Math.PI / 180);
}

function toDegrees(angle) {
    return angle * (180 / Math.PI);
}