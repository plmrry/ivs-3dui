function Main() {
    var scene, camera, renderer;

    var mouse = new THREE.Vector3();
    var ray = new THREE.Raycaster();
    var walkingRay = new THREE.Raycaster();

    var isMouseDown = false;
    var isAdding = true;

    var activeObject = null;       // object to edit/inspect
                                   //   (i.e., last clicked 'parent' object)

    var floor;

    var soundzones = [];

    var loader;
    var headModel;
    var ambienLight;
    var container;
    var moveLeft = 0, moveRight= 0, moveForward = 0, moveBackwards = 0;
    var pitchUp = 0, pitchDown = 0, yawLeft = 0, yawRight = 0;
    var rotationSpeed = 0.05;
    var movementSpeed = 5;

    this.init = function() {
        var width = window.innerWidth,
            height = window.innerHeight;

        camera = new THREE.OrthographicCamera( width/-2, width/2, height/-2,height/2, 1, 1000 );
        camera.position.z = 100;

        ray.linePrecision = 10;

        scene = new THREE.Scene();
        scene.add(camera);

        var dirLight = new THREE.DirectionalLight( 0xffffff, 1 );
  			dirLight.color.setHSL( 0.1, 1, 0.95 );
  			dirLight.position.set( -1, 1.75, 1 );
  			dirLight.position.multiplyScalar( 50 );
  			scene.add( dirLight );

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setClearColor( 0xf0f0f0 );
        renderer.setSize( width, height );
        drawing.setScene(scene);

        //Adding floor
        var geometry = new THREE.PlaneGeometry(width, height);
        var material = new THREE.MeshBasicMaterial( {color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide} );
        floor = new THREE.Mesh( geometry, material );
        scene.add( floor );

        loader = new THREE.OBJLoader();
        loader.load('../assets/head.obj', function(object){
          headModel = object;

          headModel.material = new THREE.MeshBasicMaterial({color: 0x156289});
          headModel.rotateX(-Math.PI/2.);
          headModel.position.z = 40;
          headModel.scale.set(30, 30, 30);
          scene.add(headModel);
        });

    }

    this.appendToContainer = function(container) {
        container.appendChild( renderer.domElement );

        container.addEventListener( 'mousedown', onMouseDown, false );
        container.addEventListener( 'mouseup', onMouseUp, false );
        container.addEventListener( 'mouseleave', onMouseUp, false );
        container.addEventListener( 'mousemove', onMouseMove, false );
        document.body.addEventListener( 'keydown', onKeyDown, false);
        document.body.addEventListener('keyup', onKeyUp, false);
    }

    this.updateDummyHead = function() {

      headModel.rotation.y += - yawLeft + yawRight;
      headModel.translateX( - moveLeft + moveRight);
      headModel.translateZ( - moveBackwards + moveForward);
    }

    this.render = function() {
        requestAnimationFrame( this.render.bind(this) );
        renderer.render( scene, camera );
        this.updateDummyHead();
    }

    //////////////
    // functions /
    //////////////
    var toggleAdd = function() {
        isAdding = !isAdding;
        if (isAdding) {
            //renderer.setClearColor(0xe0e0e0);
            //document.querySelector('#add-btn').innerHTML = 'cancel add';
        }
        else {
            //renderer.setClearColor(0xf0f0f0);
            //document.querySelector('#add-btn').innerHTML = 'add object';
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
                var intersects = soundzones.filter(function(obj) {
                    return obj.isUnderMouse(ray);
                });
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

      var walkingRayVector = new THREE.Vector3(0, 0, -1);
      walkingRay.set(axisHelper.position, walkingRayVector);

      for( i in soundZones ){
        var intersects = walkingRay.intersectObject( soundzones[i].shape );
        if(intersects.length > 0) {
            console.log("IN THE ZOAN");
        }
        else {
            console.log("OUT THE ZOAN");
        }
      }

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

          case 82:            // 'A': add shortcut
              if (!isAdding)
                  toggleAdd();
              break;

          case 87: moveForward = 1 * movementSpeed; break; //W
          case 83: moveBackwards = 1 * movementSpeed; break; //S
          case 68: yawLeft = 1 * rotationSpeed; break; // D
          case 38: pitchUp = 1 * rotationSpeed; break; //Top
          case 65: yawRight = 1 * rotationSpeed; break; // A
          case 40: pitchDown = 1 * rotationSpeed; break; //Bottom

          default:
             //console.log(key);
      }
    }

    var onKeyUp = function(e) {
      switch(e.keyCode){
        // case 65: moveLeft = 0; break; //A
        case 87: moveForward = 0; break; //W
        // case 68: moveRight = 0; break; //D
        case 83: moveBackwards = 0; break; //S
        // case 37: yawLeft = 0; break; //Left
        case 68: yawLeft = 0; break; // D
        case 38: pitchUp = 0; break; //Top
        // case 39: yawRight = 0; break; //Right
        case 65: yawRight = 0; break; // A
        case 40: pitchDown = 0; break; //Bottom
      }
    }

}
