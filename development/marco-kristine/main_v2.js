function Main() {
    var scene, camera, renderer;

    var mouse = new THREE.Vector3();
    var ray = new THREE.Raycaster();

    var isMouseDown = false;
    var isAdding = false;

    var activeObject = null;       // object to edit/inspect
                            //     (i.e., last clicked 'parent' object)
    var selectedObject;     // object being clicked


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
        if (isAdding === true) {
            mouse.x = e.clientX - renderer.domElement.offsetLeft +camera.left;
            mouse.y = e.clientY - renderer.domElement.offsetTop +camera.top;
        }
        else { // raycasting
            var rect = renderer.domElement.getBoundingClientRect();
            mouse.x = 2 * (e.clientX - rect.left) / rect.width - 1;
            mouse.y = 1 - 2 * (e.clientY - rect.top) / rect.height;
        }
    }

    var setSelectedObject = function(obj) {
        if (selectedObject && selectedObject.material && selectedObject.material.color) {
            selectedObject.material.color.set(0xff0000);
        }
        if (obj && obj.material && obj.material.color)
            obj.material.color.set(0x0000ff);

        selectedObject = obj;
    }
    var setActiveObject = function(obj) {
        if (activeObject) {
            activeObject.setInactive();
        }
        activeObject = obj;

        if (obj && obj.type === 'Soundzone') {
            obj.setActive();
        }
    }

    //////////////
    //   events  /
    //////////////
    var onMouseDown = function(e) {
        isMouseDown = true;
        setMousePosition(e);

        if (isAdding) {
            drawing.beginAt(mouse.clone());
        }
        else {
            // make or cancel a selection
            ray.setFromCamera(mouse, camera);

            if (activeObject && activeObject.isUnderMouse(ray)) {
                // click inside active object
                var intersect = activeObject.objectUnderMouse(ray);
                setSelectedObject(intersect.object);
            }
            else {
                // click outside active object
                setSelectedObject(null);
                var intersects = soundzones.filter(obj => obj.isUnderMouse(ray));
                if (intersects.length > 0)
                    setActiveObject(intersects[0]);
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
                    console.log('added object: ',obj);
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
                drawing.addPoint(mouse.clone());
            }
        }
        else {
            ray.setFromCamera(mouse, camera);
            if (activeObject && activeObject.isUnderMouse(ray)) {
                var intersection = 
                console.log('selected: ',activeObject.objectUnderMouse(ray).object.type);

            }





        }
    }

    // delete an object when pressing delete key
    var onKeyDown = function(e) {
        var key = e.keyCode || e.which;
        switch(key) {
            case 8:         // backspace
            case 46:        // delete
                e.preventDefault();
                if (activeObject && activeObject.type === 'Soundzone') {
                    if (confirm('Delete object?')) {
                        activeObject.removeFromScene(scene);
                        var i = soundzones.indexOf(activeObject);
                        soundzones.splice(i,1);
                        activeObject = null;
                    }
                }
            default:
//                console.log(key);
        }
    }

}