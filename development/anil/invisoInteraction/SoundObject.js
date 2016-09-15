var SoundObject = function(audio){

  this.type = 'SoundObject';
  this.containerObject = new THREE.Object3D();

  this.trajectory = null;
  this.trajectoryClock = 1;
  this.movementSpeed = 5;
  this.movementDirection = 1;
  this.movementIncrement = null;

  var sphereGeometry = new THREE.SphereBufferGeometry(50, 100, 100);
  var sphereMaterial = new THREE.MeshBasicMaterial({color: 0xFFFFFF, opacity: 0.8, transparent:true});
  this.omniSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

  var lineMaterial = new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 30, gapSize: 30 });
  var lineGeometry = new THREE.Geometry();
  lineGeometry.vertices.push(
      new THREE.Vector3( 0, 0, -300 ),
      new THREE.Vector3( 0, 0, 300 )
    );
  lineGeometry.computeLineDistances();
  this.altitudeHelper = new THREE.Line( lineGeometry, lineMaterial );
  scene.add(this.altitudeHelper);
  this.altitudeHelper.position.copy(mouse);

  this.containerObject.add(this.omniSphere);
  this.containerObject.position.copy(mouse);
  scene.add(this.containerObject);

  this.cones = [];

  this.createCone = function(fileName){

    var coneWidth = Math.random() * 50;
    var coneHeight = Math.random() * 50 + 100;
    var coneGeo = new THREE.CylinderGeometry(coneWidth, 0, coneHeight, 100, 1, true);
    var coneColor = new THREE.Color(0.5, Math.random(), 0.9);
    var coneMaterial = new THREE.MeshBasicMaterial({color: coneColor, opacity: 0.5});
    coneGeo.translate(0, coneHeight/2., 0);
    coneMaterial.side = THREE.DoubleSide;
    var cone = new THREE.Mesh(coneGeo, coneMaterial);
    cone.rotateX(Math.PI);

    cone.sound = loadSound(fileName);
    cone.sound.panner.refDistance = 50;
    cone.sound.panner.distanceModel = 'inverse';
    cone.sound.panner.coneInnerAngle = Math.atan(coneWidth/coneHeight) * (180/Math.PI);
    cone.sound.panner.coneOuterAngle = cone.sound.panner.coneInnerAngle * 1.5;
    cone.sound.panner.coneOuterGain = 0.05;
    cone.sound.volume.gain.value = mapRange(coneHeight, 100., 150., 0.2, 1.);

    this.cones.push(cone);
    this.containerObject.add(cone);
    this.setAudioPosition(cone);
  };

  this.setAudioPosition = function(cone){

    var p = new THREE.Vector3();
    var q = new THREE.Vector3();
    p.setFromMatrixPosition(cone.matrixWorld);
    var px = p.x, py = p.y, pz = p.z;

    cone.updateMatrixWorld();
    q.setFromMatrixPosition(cone.matrixWorld);
    var dx = q.x-px, dy = q.y-py, dz = q.z-pz;
    cone.sound.panner.setPosition(q.x, q.y, q.z);

    var vec = new THREE.Vector3(0, 1, 0);
    var m = cone.matrixWorld;
    var mx = m.elements[12], my = m.elements[13], mz = m.elements[14];
    m.elements[12] = m.elements[13] = m.elements[14] = 0;
    vec.applyProjection(m);
    vec.normalize();
    cone.sound.panner.setOrientation(vec.x, vec.y, vec.z);
    m.elements[12] = mx;
    m.elements[13] = my;
    m.elements[14] = mz;
  }

  function loadSound(soundFileName){

    var context = audio.context;

    var sound = {};
    sound.source = context.createBufferSource();
    sound.source.loop = true;
    sound.panner = context.createPanner();
    sound.panner.panningModel = 'HRTF';
    sound.volume = context.createGain();

    sound.source.connect(sound.volume);
    sound.volume.connect(sound.panner);
    sound.panner.connect(audio.destination);

    var request = new XMLHttpRequest();
    request.open("GET", soundFileName, true);
    request.responseType = "arraybuffer";
    var context = audio.context;
    request.onload = function() {
      context.decodeAudioData(request.response, function(buffer){
        sound.buffer = buffer;
        sound.source.buffer = sound.buffer;
        sound.source.start(context.currentTime + 0.020);
      }, function() {
        alert("Decoding the audio buffer failed");
      });
    };
    request.send();

    return sound;
  }

  this.isUnderMouse = function(ray) {
    return ray.intersectObject( this.containerObject, true ).length > 0;
  }

  this.move = function() {

    if( perspectiveView ) {
      var pointer = this.containerObject.position;
      var posY = mapRange(nonScaledMouse.y, -0.5, 0.5, -200, 200);
      pointer.z = posY;
    }
    else var pointer = mouse ;

    this.containerObject.position.copy(pointer);
    this.altitudeHelper.position.copy(pointer);
    this.altitudeHelper.position.z = 0;
    if(this.trajectory) this.trajectory.move(pointer);
    if(this.cones[0]){

      for(i in this.cones){
        this.setAudioPosition(this.cones[i]);
      }
    }
  }

  this.addToScene = function() {

    scene.add(this.containerObject);
  }

  this.setActive = function() {

    if(this.trajectory) this.trajectory.setActive();
    if(this.trajectory) this.trajectory.setMouseOffset(mouse);
  }

  this.setInactive = function() {

    if(this.trajectory) this.trajectory.setInactive();
  }

  this.removeFromScene = function() {
    scene.remove(this.containerObject, true);
    scene.remove(this.altitudeHelper, true);
    scene.remove(this.trajectory, true);
  }

  this.followTrajectory = function() {

    if (this.trajectory){

      this.trajectoryClock -= this.movementDirection * this.movementIncrement;
      if ( this.trajectoryClock >= 1 ){
        if( this.trajectory.spline.closed ){
          this.trajectoryClock = 0;
        }
        else{
          this.movementDirection = - this.movementDirection;
          this.trajectoryClock = 1;
        }
      }

      if ( this.trajectoryClock < 0 ){
        if( this.trajectory.spline.closed ){
          this.trajectoryClock = 1;
        }
        else{
          this.movementDirection = - this.movementDirection;
          this.trajectoryClock = 0;
        }
      }

      this.containerObject.position.copy(this.trajectory.spline.getPointAt(this.trajectoryClock));
      this.altitudeHelper.position.copy(this.trajectory.spline.getPointAt(this.trajectoryClock));
      this.altitudeHelper.position.z = 0;

      if(this.cones[0]){

        for(i in this.cones){
          this.setAudioPosition(this.cones[i]);
        }
      }
    }
  }

  this.calculateMovementSpeed = function() {
    if(this.trajectory) this.movementIncrement = this.movementSpeed / this.trajectory.spline.getLength(10);
  }
}
