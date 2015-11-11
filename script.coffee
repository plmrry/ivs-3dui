degToRad = d3.scale.linear().domain [0, 360]
  .range [0, 2*Math.PI]

CAMERA_RADIUS = 1000
INITIAL_THETA = degToRad 80 # longitude
INITIAL_PHI = degToRad 45 # 90 - latitude
INITIAL_ZOOM = 40

start = ->
  stream = Rx.Observable

  MIN_PHI = 0.01
  MAX_PHI = Math.PI * 0.5
  ``


  # theta = longitude
  # phi = latitude

  room =
    width: 15
    length: 10
    height: 3

  DEFAULT_OBJECT_RADIUS = room.width * 0.1

  # ---------------------------------------------- DOM Init

  main = d3.select('body').append('main')
    .style
      width: "100%"
      height: "80vh"
      position: 'relative'

  canvas = main.append('canvas').node()

  sceneControls = main
    .append('div').classed 'container', true
    .style
      position: 'absolute'
      right: '0'
      top: '1%'

  # ---------------------------------------------- Mode Buttons

  modeButtons = do ->
    butts = [
      { name: 'object' }
      { name: 'zone' }
      { name: 'trajectory' }
    ]
    return sceneControls
      .append('div').classed 'row', true
      .append('div').classed 'col-xs-12', true
      .append('div').classed 'btn-group mode pull-right', true
      .call (group) ->
        group.selectAll('button').data butts
          .enter().append('button')
          .classed 'btn btn-secondary', true
          .property 'disabled', true
          .attr 'id', (d) -> d.name
          .html (d) -> d.html ? d.name

  # ---------------------------------------------- Camera Controls

  CONTROLS_MARGIN = right: '10%', bottom: '10%'

  cameraControls = main
    .append('div').classed 'container', true
    .style
      position: 'absolute'
      right: '0'
      bottom: '1%'
    .append('div').classed 'row', true
    .append('div').classed 'col-xs-12', true
    .append('div').classed "controls", true

  buttons = [
    { name: "north" }, { name: "top" }
    { name: "phi_45", html: '45' }
    { name: "camera", html: '<i class="material-icons" style="display: block">3d_rotation</i>' }
    { name: "zoomIn", html: '<i class="material-icons" style="display: block">zoom_in</i>' }
    { name: "zoomOut", html: '<i class="material-icons" style="display: block">zoom_out</i>' }
  ]

  butts = cameraControls.selectAll("button").data(buttons)
  butts.enter().append("button")
    .classed("btn btn-secondary", true)
    .attr "id", (d) -> d.name
    .html (d) -> d.html ? d.name

  # ---------------------------------------------- Three.js Init

  raycaster = new THREE.Raycaster()

  roomObject = getRoomObject room
  mainObject = getMainObject()
  mainObject.add roomObject
  scene = new THREE.Scene()
  scene.add mainObject

  firstRenderer = new THREE.WebGLRenderer canvas: canvas
  firstRenderer.setClearColor "white"

  # ------------------------------------------------------------- Streams

  animation = Rx.Observable.create (observer) ->
    d3.timer -> observer.onNext()
  .timestamp()

  # ---------------------------------------------- Objects

  canvasClick = stream.create (observer) ->
    d3.select(canvas).on 'click', -> observer.onNext()

  newObject = do ->
    node = modeButtons.select('#object').node()
    stream.fromEvent node, 'click'

  # TODO: Stateful
  newObject.subscribe ->
    room = roomObject
    sphere = new THREE.SphereGeometry DEFAULT_OBJECT_RADIUS
    material = new THREE.MeshBasicMaterial
      color: 0x0000ff, wireframe: true
    object = new THREE.Mesh( sphere, material )
    room.add object

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

  cameraDrag = d3.behavior.drag()
  d3.select('#camera').call cameraDrag
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

  cameraPolarTween = (end) ->
    stream.just (camera) ->
      polarStart = camera.position._polar
      camera._interpolator = d3.interpolate polarStart, end
      camera._update = (t) -> (c) ->
        c.position._polar = c._interpolator t
        c.position.copy polarToVector c.position._polar
        c.lookAt c._lookAt
        return c
      return camera

  north = stream.fromEvent d3.select('#north').node(), 'click'
    .flatMap ->
      cameraPolarTween theta: 0
        .concat getTweenUpdateStream(1000)

  top = stream.fromEvent d3.select('#top').node(), 'click'
    .flatMap ->
      cameraPolarTween phi: MIN_PHI
        .concat getTweenUpdateStream(1000)

  phi_45 = stream.fromEvent d3.select('#phi_45').node(), 'click'
    .flatMap ->
      cameraPolarTween phi: degToRad 45
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

  cameraUpdates = stream.merge [
    cameraPosition
    cameraZoom
    cameraSize
    north
    top
    phi_45
  ]

  camera = stream.just getFirstCamera()
    .concat cameraUpdates
    .scan apply

  aboveSwitch = camera
    .map (c) -> c.position._polar.phi is MIN_PHI
    .bufferWithCount 2, 1
    .filter (a) -> a[0] isnt a[1]
    .map (a) -> a[1]

  sceneDragHandler = d3.behavior.drag()
  d3.select(canvas).call sceneDragHandler

  NDC =
    x: d3.scale.linear().range [-1, 1]
    y: d3.scale.linear().range [1, -1]

  stream.create (observer) ->
    sceneDragHandler.on 'drag', -> observer.onNext d3.event
  .subscribe (event) ->
    console.log event.x, event.y
    console.log d3.mouse canvas

  #canvasClick.withLatestFrom camera
    #.subscribe (arr) ->
      #camera = arr[1]
      #
       #FIXME
      #NDC = [
        #d3.scale.linear().range [-1, 1]
        #d3.scale.linear().range [1, -1]
      #]
      #_c = d3.select canvas
      #NDC[0].domain [0, _c.attr('width')]
      #NDC[1].domain [0, _c.attr('height')]
      #
      #mouse = d3.mouse canvas
        #.map (d, i) -> NDC[i] d
      #
      #raycaster.setFromCamera { x: mouse[0], y: mouse[1] }, camera
      #intersects = raycaster.intersectObjects roomObject.children, false
      #first = intersects[0].object
      #clone = first.clone()
      #
      #console.log first
      #
      #sceneControls.selectAll('#objectView').data(Array(1))
        #.enter().append('div').classed('card', true)
        #.attr id: 'objectView'
        #.append 'canvas'
        #.call ->
          #_wid = 300
          #_camera = new THREE.OrthographicCamera()
          #_camera.left = _camera.bottom = -_wid/2
          #_camera.right = _camera.top = _wid/2
          #_renderer = new THREE.WebGLRenderer canvas: this.node()
          #_renderer.setSize _wid, _wid
          #_renderer.setClearColor "white"
          #_scene = new THREE.Scene()
          #_scene.add clone
          #d3.timer -> _renderer.render _scene, _camera

  animation.withLatestFrom renderer, camera
    .subscribe (arr) ->
      [time, renderer, camera] = arr
      renderer.render scene, camera

  aboveSwitch.subscribe (isAbove) ->
    main.select('.mode').selectAll('button')
      .property 'disabled', not isAbove

# ------------------------------------------------------- Functions

getFirstCamera = ->
  c = new THREE.OrthographicCamera()
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

getRoomObject = (room) ->
  geometry = new THREE.BoxGeometry room.width, room.height, room.length
  material = new THREE.MeshBasicMaterial
    color: 0x00ff00, transparent: true, opacity: 0.1
  roomObject = new THREE.Mesh( geometry, material );
  edges = new THREE.EdgesHelper( roomObject, 0x00ff00 )
  roomObject.add edges
  roomObject.name = 'room'
  return roomObject

getMainObject = ->
  gridHelper = new THREE.GridHelper 100, 10
  axisHelper = new THREE.AxisHelper 5
  mainObject = new THREE.Object3D()
  mainObject.add gridHelper
  mainObject.add axisHelper
  return mainObject

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

# degToRad = d3.scale.linear().domain [0, 360]
#   .range [0, 2*Math.PI]

getClientSize = (element) ->
  width: element.clientWidth
  height: element.clientHeight

apply = (last, func) -> func last

do start
