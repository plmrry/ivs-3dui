

  
start = ->
  MIN_PHI = 0.01
  MAX_PHI = Math.PI * 0.5
  CAMERA_RADIUS = 1000
  INITIAL_THETA = degToRad 80 # longitude
  INITIAL_PHI = degToRad 45 # 90 - latitude
  INITIAL_ZOOM = 20
 
  # theta = longitude
  # phi = latitude
  
  stream = Rx.Observable
  
  room =
    width: 15
    length: 10
    height: 3
    
  buttons = [
    { name: "up" }
    { name: "camera", html: '<i class="material-icons" style="display: block">3d_rotation</i>' }
    { name: "zoomIn", html: '<i class="material-icons" style="display: block">zoom_in</i>' }
    { name: "zoomOut", html: '<i class="material-icons" style="display: block">zoom_out</i>' }
  ]
  
  # ---------------------------------------------- DOM Init
  
  main = d3.select('body').append('main')
    .style
      width: "100%"
      height: "80vh"
      position: 'relative'
      
  canvas = main.append('canvas').node()
  
  # ---------------------------------------------- Mode Buttons
  
  modeButtons = do ->
    butts = [
      { name: 'object' }
      { name: 'zone' }
      { name: 'trajectory' }
    ]
    return main.append 'div'
      .classed 'btn-group mode', true
      .style
        position: 'absolute'
        right: '1%'
        top: '1%'
      .call (group) ->
        group.selectAll('button').data butts
          .enter().append('button')
          .classed 'btn btn-secondary', true
          .attr 'disabled', true
          .html (d) -> d.html ? d.name
  
  # ---------------------------------------------- Camera Controls
  
  CONTROLS_MARGIN = right: '10%', bottom: '10%'
      
  cameraControls = main.append "div"
    .classed "controls", true
    .style
      position: 'absolute'
      right: '1%'
      bottom: '1%'
      
  butts = cameraControls.selectAll("button").data(buttons)
  butts.enter().append("button")
    .classed("btn btn-secondary", true)
    .attr "id", (d) -> d.name
    .html (d) -> d.html ? d.name
    
  cameraDrag = d3.behavior.drag()
  d3.select('#camera').call cameraDrag
    
  # ---------------------------------------------- Three.js Init
  
  gridHelper = new THREE.GridHelper 100, 10
  axisHelper = new THREE.AxisHelper 5
  mainObject = new THREE.Object3D()
  mainObject.add gridHelper
  mainObject.add axisHelper
  
  geometry = new THREE.BoxGeometry room.width, room.height, room.length
  material = new THREE.MeshBasicMaterial color: 0x00ff00, transparent: true, opacity: 0.1
  roomObject = new THREE.Mesh( geometry, material );
  edges = new THREE.EdgesHelper( roomObject, 0x00ff00 )
  mainObject.add( roomObject );
  mainObject.add( edges );
  
  scene = new THREE.Scene()
  scene.add mainObject
  
  firstRenderer = new THREE.WebGLRenderer canvas: canvas
  firstRenderer.setPixelRatio window.devicePixelRatio
  firstRenderer.setClearColor "white"
  
  # ---------------------------------------------- Initial Camera
  
  initialCamera = (c) ->
    c.zoom = INITIAL_ZOOM
    c.position._polar = 
      radius: CAMERA_RADIUS
      theta: INITIAL_THETA
      phi: INITIAL_PHI
    c.position.copy polarToVector c.position._polar
    c._lookAt = new THREE.Vector3()
    c.lookAt c._lookAt
    c.up.copy new THREE.Vector3 0, 1, 0
    c.updateProjectionMatrix()
    return c
  
  # ---------------------------------------------- Streams
  
  animation = Rx.Observable.create (observer) ->
    d3.timer -> observer.onNext()
  .timestamp()
  
  # ---------------------------------------------- Resize
  
  resize = Rx.Observable.fromEvent window, 'resize'
    .startWith target: window
    .map (e) -> e.target
    .map -> getClientSize main.node()
    
  renderer = resize.scan (renderer, r) ->
    renderer.setSize r.width, r.height
    return renderer
  , firstRenderer
    
  cameraSize = resize
    .map (s) -> (c) ->
      [ c.left, c.right ] = [-1, 1].map (d) -> d * s.width/2
      [ c.bottom, c.top ] = [-1, 1].map (d) -> d * s.height/2
      c.updateProjectionMatrix()
      return c
  
  # ---------------------------------------------- Camera Position
    
  cameraPosition = Rx.Observable.create (observer) ->
    cameraDrag.on 'drag', -> observer.onNext d3.event
  .map (e) ->
    (camera) ->
      polar = camera.position._polar
      polar.phi += degToRad e.dy
      polar.theta += degToRad e.dx
      polar.phi = MIN_PHI if polar.phi < MIN_PHI
      polar.phi = MAX_PHI if polar.phi > MAX_PHI
      camera.position.copy polarToVector polar
      camera.lookAt new THREE.Vector3()
      camera
      
  up = stream.fromEvent d3.select('#up').node(), 'click'
    .flatMap ->
      stream.just (camera) ->
        end = theta: 0
        polarStart = camera.position._polar
        camera._interpolator = d3.interpolate polarStart, end
        camera._update = (t) -> (c) ->
          c.position._polar = c._interpolator t
          c.position.copy polarToVector c.position._polar
          c.lookAt c._lookAt
          return c
        return camera
      .concat getTweenUpdateStream(1000)
      
  # ---------------------------------------------- Camera Zoom
  
  zooms = [['In',2],['Out',.5]].map (a) ->
    node = d3.select("#zoom#{a[0]}").node()
    stream.fromEvent node, 'click'
      .map -> a[1]
    
  cameraZoom = stream.merge zooms
    .flatMap (dz) ->
      stream.just (cam) ->
        end = cam.zoom * dz
        cam._interpolator = d3.interpolate cam.zoom, end
        cam._update = (t) -> (c) ->
          c.zoom = c._interpolator t
          c.updateProjectionMatrix()
          return c
        return cam
      .concat getTweenUpdateStream 500
      
  # ---------------------------------------------- Camera
  
  cameraUpdateStreams = [ cameraPosition, cameraZoom, cameraSize, up ]
  
  # A stream that emits camera updaters
  # @emits (camera) => camera
  cameraUpdates = stream
    .merge cameraUpdateStreams
    .startWith initialCamera
  
  # Scan over the camera update functions
  camera = cameraUpdates
    .scan apply, new THREE.OrthographicCamera()
    
  aboveSwitch = camera
    .map (c) -> c.position._polar.phi is MIN_PHI
    .bufferWithCount 2, 1
    .filter (a) -> a[0] isnt a[1]
    .map (a) -> a[1]
  
  animation.withLatestFrom renderer, camera
    .subscribe (arr) ->
      [time, renderer, camera] = arr
      renderer.render scene, camera
      
  aboveSwitch.subscribe (isAbove) -> 
    main.select('.mode').selectAll('button')
      .property 'disabled', not isAbove
  
  #<div class="card">
    #<img class="card-img-top" data-src="holder.js/100%x180/?text=Image cap" alt="Card image cap">
    #<div class="card-block">
      #<h4 class="card-title">Card title</h4>
      #<p class="card-text">Some quick example text to build on the card title and make up the bulk of the card's content.</p>
    #</div>
    #<ul class="list-group list-group-flush">
      #<li class="list-group-item">Cras justo odio</li>
      #<li class="list-group-item">Dapibus ac facilisis in</li>
      #<li class="list-group-item">Vestibulum at eros</li>
    #</ul>
    #<div class="card-block">
      #<a href="#" class="card-link">Card link</a>
      #<a href="#" class="card-link">Another link</a>
    #</div>
  #</div>
  
# ------------------------------------------------------- Functions

getTweenUpdateStream = (duration) ->
  tweenStream(duration).map (time) ->
    (cam) -> cam._update(time)(cam)

tweenStream = (duration) ->
  duration = duration or 0
  Rx.Observable.create (observer) ->
    d3.transition()
      .duration duration
      .tween "tween", -> (t) -> observer.onNext t
      .each "end", -> observer.onCompleted()
  
# NOTE: See http://mathworld.wolfram.com/SphericalCoordinates.html
polarToVector = (o) ->
  { radius, theta, phi } = o
  x = radius * Math.cos(theta) * Math.sin(phi)
  y = radius * Math.sin(theta) * Math.sin(phi)
  z = radius * Math.cos(phi)
  return new THREE.Vector3 y, z, x
  
# NOTE: See http://mathworld.wolfram.com/SphericalCoordinates.html
vectorToPolar = (vector) ->
  radius = vector.length()
  _x = vector.z
  _y = vector.x
  _z = vector.y
  phi = Math.acos _z/radius
  theta	= Math.atan _y/_x
  return { radius, theta, phi }
  
degToRad = d3.scale.linear()
  .domain [0, 360]
  .range [0, 2*Math.PI]
  
getClientSize = (element) ->
  width: element.clientWidth
  height: element.clientHeight
  
apply = (last, func) -> func last
  
do start