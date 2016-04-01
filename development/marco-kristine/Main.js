var Main = function() {

    var self = this;
    this.camera = null;
    this.scene = null;
    this.renderer = null;

    this.isMouseDown = false;
    this.mouse = new THREE.Vector3();

    this.animate = function() {
        requestAnimationFrame( this.animate.bind(this) );
        this.render();

    };

    this.render = function () {
        this.renderer.render(this.scene, this.camera);

    };

    this.init = function() {

        this.scene = new THREE.Scene();


        //Camera setup
        var width = 100;
        var height = 100;
        this.camera = new  THREE.OrthographicCamera( width / - 2, width / 2, height / 2, height / - 2, 1, 1000 );
        this.camera.position.z = 100;
        this.scene.add(this.camera);

        //Renderer
        this.renderer = new THREE.WebGLRenderer({antialias:true}); 
        this.renderer.setClearColor( 0xf0f0f0 );

        console.log(this.renderer);
        this.renderer.setSize( window.innerWidth, window.innerHeight );
        
        console.log("Scene setup complete");

        this.animate();
    };

    this.appendToContainer = function(container) {
        container.appendChild( this.renderer.domElement );

        container.addEventListener( 'mousedown', this.onMouseDown, false );
        container.addEventListener( 'mouseup', this.onMouseUp, false );
        container.addEventListener( 'mouseleave', this.onMouseUp, false );
        container.addEventListener( 'mousemove', this.onMouseMove, false );
    };


    this.setMousePosition2D = function(e) {
        if(this.renderer != null) {
            this.mouse.x = e.clientX - this.renderer.domElement.offsetLeft + this.camera.left;
            this.mouse.y = e.clientY - this.renderer.domElement.offsetTop + this.camera.top;
        }
    }

    this.onMouseDown = function(e) {
        self.setMousePosition2D(e);
        self.isMouseDown = true;
        drawing.scene = self.scene;
        drawing.beginAt(self.mouse.clone());
    }

    this.onMouseUp = function(e) {
        self.setMousePosition2D(e);
        self.isMouseDown = false;
        var sz = drawing.createObject();
        alert(sz);
    }

    this.onMouseMove = function(e) {
        self.setMousePosition2D(e);
    }

    this.addSoundzone = function() {
        
    }



}