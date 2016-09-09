var SoundObject = function(audio){

  this.type = "SoundObject";

  this.containerObject = new THREE.Object3D();

  var sphereGeometry = new THREE.SphereBufferGeometry(50, 100, 100);
  var sphereMaterial = new THREE.MeshBasicMaterial({color: 0xFFFFFF, opacity: 0.8, transparent:true});
  this.omniSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  this.containerObject.add(this.omniSphere);

  var lineMaterial = new THREE.LineDashedMaterial({ color: 0x888888, dashSize: 30, gapSize: 30 });
  var lineGeometry = new THREE.Geometry();
  lineGeometry.vertices.push(
      new THREE.Vector3( 0, 0, 0 ),
      new THREE.Vector3( 0, 0, 500 )
    );
  lineGeometry.computeLineDistances();
  var line = new THREE.Line( lineGeometry, lineMaterial );
  this.containerObject.add(line);

  this.cones = [];

  this.createCone = function(fileName){

    var coneWidth = Math.random() * 50;
    var coneLength = Math.random() * 50 + 100;
    var coneGeo = new THREE.CylinderGeometry(coneWidth, 0, coneLength, 100, 1, true);
    var coneColor = new THREE.Color(0.5, Math.random(), 0.9);
    var coneMaterial = new THREE.MeshBasicMaterial({color: coneColor, opacity: 0.5});
    coneGeo.translate(0, coneLength/2., 0);
    coneMaterial.side = THREE.DoubleSide;
    var cone = new THREE.Mesh(coneGeo, coneMaterial);
    cone.rotateX(Math.random()*Math.PI*2.);

    this.containerObject.add(cone);

    cone.sound = loadSound(fileName);
    cone.sound.panner.coneInnerAngle = 0.01*180/Math.PI;
    cone.sound.panner.coneOuterAngle = 1*180/Math.PI;
    cone.sound.panner.coneOuterGain = 0.03;

    this.cones.push(cone);
    this.setPosition(cone);
  };

  this.setPosition = function(cone){

    var p = new THREE.Vector3();
    var q = new THREE.Vector3();
    p.setFromMatrixPosition(cone.matrixWorld);
    var px = p.x, py = p.y, pz = p.z;

    cone.updateMatrixWorld();
    q.setFromMatrixPosition(cone.matrixWorld);
    var dx = q.x-px, dy = q.y-py, dz = q.z-pz;
    cone.sound.panner.setPosition(q.x/1300., q.y/1300., q.z/1300.);

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
}
