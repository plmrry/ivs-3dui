var Main = function() {

    this.camera = null;
    this.scene = null;
    this.renderer = null;

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


}