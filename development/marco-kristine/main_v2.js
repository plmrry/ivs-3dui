function Main() {
    var scene, camera, renderer;

    var mouse = new THREE.Vector3();
    var ray = new THREE.Raycaster();

    var isMouseDown = false;
    var isAdding = false;

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
        if(renderer != null) {
            mouse.x = e.clientX - renderer.domElement.offsetLeft + camera.left;
            mouse.y = e.clientY - renderer.domElement.offsetTop + camera.top;
        }
    }

    var onMouseDown = function(e) {
        isMouseDown = true;
        setMousePosition(e);

        if (isAdding) {
            drawing.beginAt(mouse.clone());
        }
    }
    var onMouseUp = function(e) {
        if (isMouseDown && isAdding) {
            drawing.createObject();
            isAdding = false;
            toggleAdd();
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
    }

}