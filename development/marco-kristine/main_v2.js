function Main() {
    var scene, camera, renderer;

    var mouse = new THREE.Vector3();
    var ray = new THREE.Raycaster();

    var isMouseDown = false;
    var isAdding = false;

    var activeObject = null;       // object to edit/inspect
                                   //   (i.e., last clicked 'parent' object)

    var floor;

    var soundzones = [];


    this.init = function() {
        var width = window.innerWidth,
            height = window.innerHeight;

        camera = new THREE.OrthographicCamera( width/-2, width/2, height/-2,height/2, 1, 1000 );
        camera.position.z = 100;    // <-- depth of room

        ray.linePrecision = 10;

        scene = new THREE.Scene();
        scene.add(camera);
        scene.add( new THREE.AmbientLight( 0xf0f0f0 ) );

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setClearColor( 0xf0f0f0 );
        renderer.setSize( width, height );
        drawing.setScene(scene);

        //Adding floor
        var geometry = new THREE.PlaneGeometry(width, height);
        var material = new THREE.MeshBasicMaterial( {color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide} );
        floor = new THREE.Mesh( geometry, material );
        scene.add( floor );
    }

    this.appendToContainer = function(container) {
        container.appendChild( renderer.domElement );

        container.addEventListener( 'mousedown', onMouseDown, false );
        container.addEventListener( 'mouseup', onMouseUp, false );
        container.addEventListener( 'mouseleave', onMouseUp, false );
        container.addEventListener( 'mousemove', onMouseMove, false );
        document.body.addEventListener( 'keydown', onKeyDown, false);

        // !!temporary
        document.querySelector('#add-btn').onclick = toggleAdd.bind(this);
    }

    this.render = function() {
        requestAnimationFrame( this.render.bind(this) );
        renderer.render( scene, camera );
    }

    //////////////
    // functions /
    //////////////
    var toggleAdd = function() {
        isAdding = !isAdding;
        if (isAdding) {
            renderer.setClearColor(0xe0e0e0);
            document.querySelector('#add-btn').innerHTML = 'cancel add';
        }
        else {
            renderer.setClearColor(0xf0f0f0);
            document.querySelector('#add-btn').innerHTML = 'add object';
        }
    }

    var setMousePosition = function(e) {

        // Mouse is normalized
        var rect = renderer.domElement.getBoundingClientRect();
        var pointer = new THREE.Vector3();
        pointer.x = 2 * (e.clientX - rect.left) / rect.width - 1;
        pointer.y = 1 - 2 * (e.clientY - rect.top) / rect.height;
        
        ray.setFromCamera( pointer, camera );   

        // calculate objects intersecting the picking ray
        var intersects = ray.intersectObject( floor );
        if(intersects.length > 0) {
            mouse = intersects[0].point;
        }
    

    }

    var setActiveObject = function(obj) {
        if (activeObject && activeObject.type === 'Soundzone') {
            activeObject.setInactive();
        }
        activeObject = obj;

        if (obj && obj.type === 'Soundzone') {
            obj.setActive();
        }
    }

    var removeSoundzone = function(soundzone) {
        soundzone.removeFromScene(scene);
        var i = soundzones.indexOf(soundzone);
        soundzones.splice(i,1);
    }

    //////////////
    //   events  /
    //////////////
    var onMouseDown = function(e) {
        isMouseDown = true;
        setMousePosition(e);

        if (isAdding) {
            drawing.beginAt(mouse);
        }
        else {
            // make or cancel a selection

            if (activeObject && activeObject.isUnderMouse(ray)) {
                // click inside active object
                var intersect = activeObject.objectUnderMouse(ray);
                activeObject.select(intersect);
            }
            else {
                // click outside active object
                var intersects = soundzones.filter(obj => obj.isUnderMouse(ray));
                if (intersects.length > 0) {
                    intersects[0].select(intersects[0].objectUnderMouse(ray));
                    setActiveObject(intersects[0]);
                }
                else
                    setActiveObject(null);
            }
        }
    }
    var onMouseUp = function(e) {
        if (isMouseDown)
        {
            // create a new object
            if (isAdding) {
                var obj = drawing.createObject();
                if (obj && obj.type === 'Soundzone') {
                    soundzones.push(obj);
                    setActiveObject(obj);
                }
                toggleAdd();
            }

            // TODO: 
            else if (/**/ true) {

            }
        }
        isMouseDown = false;
        isAdding = false;
    }
    var onMouseMove = function(e) {
        setMousePosition(e);

        if (isAdding === true) {
            if (isMouseDown === true) {
                drawing.addPoint(mouse);
            }
        }
        else if (activeObject) {
            var intersection = activeObject.objectUnderMouse(ray);

            if (isMouseDown === true) {
                // click+drag
                activeObject.move(mouse);
            }
            else {
                // hover cursor over line

                if (intersection && intersection.object.type === 'Line') {
                    activeObject.showCursor();
                    activeObject.setCursor(intersection.point);
                }
                else if (intersection && intersection.object.parent.type === 'Object3D') {
                    activeObject.showCursor();
                    activeObject.setCursor(intersection.object.parent.position);

                }
                else {
                    activeObject.showCursor(false);
                }
            }

        }
    }

    // delete an object when pressing delete key
    var onKeyDown = function(e) {
        var key = e.keyCode || e.which;
        switch(key) {
            case 8: case 46:    // backspace, delete
                e.preventDefault();
                if (activeObject && activeObject.type === 'Soundzone') {
                    // delete a spline point in the object
                    if (activeObject.selectedPoint && activeObject.splinePoints.length > 3) {

                        activeObject.removePoint();
                    }
                    else if (confirm('Delete object?')) {
                        removeSoundzone(activeObject);
                        activeObject = null;
                    }
                }
                break;
            case 27:            // esc: cancel selection/add
                setActiveObject(null);
            case 81:            // 'Q': cancel add
                if (isAdding && !isMouseDown)
                    toggleAdd();
                break;

            case 65:            // 'A': add shortcut
                if (!isAdding)
                    toggleAdd();
                break;
            default:
//                console.log(key);
        }
    }

}