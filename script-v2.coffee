CAMERA_RADIUS = 1000
INITIAL_THETA = 80 # longitude
INITIAL_PHI = 45 # 90 - latitude
INITIAL_ZOOM = 40
MIN_PHI = 0.01
MAX_PHI = Math.PI * 0.5

stream = Rx.Observable

room =
    width: 15
    length: 10
    height: 3

DEFAULT_OBJECT_RADIUS = room.width * 0.1
DEFAULT_CONE_VOLUME = DEFAULT_OBJECT_RADIUS
CONE_TOP = 0.01
DEFAULT_SPREAD = 0.3

start = ->

  # ---------------------------------------------- DOM Init
  main = addMain d3.select('body')
  canvas = main.append('canvas').node()
  sceneControls = addSceneControls main
  modeButtons = getModeButtons sceneControls
  cameraControls = addCameraControls main

  # ---------------------------------------------- Three.js Init
  raycaster = new THREE.Raycaster()
  roomObject = getRoomObject room
  edges = new THREE.EdgesHelper roomObject, 0x00ff00 
  mainObject = getMainObject()
  mainObject.add roomObject
  mainObject.add edges
  scene = new THREE.Scene()
  scene.add mainObject

  # ---------------------------------------------- Sound Objects

  newObject = do ->
    node = modeButtons.select('#object').node()
    stream.fromEvent node, 'click'

  newObject.subscribe ->
    room = roomObject
    sphere = new THREE.SphereGeometry DEFAULT_OBJECT_RADIUS
    material = new THREE.MeshBasicMaterial
      color: 0x0000ff, wireframe: true
    object = new THREE.Mesh( sphere, material )
    i = room.children.length
    object.name = "Object#{i}"
    room.add object

  # ---------------------------------------------- Resize

  resize = Rx.Observable.fromEvent window, 'resize'
    .startWith target: window
    .map (e) -> e.target
    .map -> getClientSize main.node()

  mainRenderer = do ->
    start = new THREE.WebGLRenderer canvas: canvas
    start.setClearColor "white"
    resize.scan (renderer, s) ->
      renderer.setSize s.width, s.height
      return renderer
    , start

  cameraSize = resize
    .map (s) -> (c) ->
      [ c.left, c.right ] = [-1, 1].map (d) -> d * s.width/2
      [ c.bottom, c.top ] = [-1, 1].map (d) -> d * s.height/2
      c.updateProjectionMatrix()
      return c

  # Normalized device coordinates
  NDC = do ->
    _ndc =
      x: d3.scale.linear().range [-1, 1]
      y: d3.scale.linear().range [1, -1]
    return resize
      .map (s) ->
        (d) ->
          d.x.domain [0, s.width]
          d.y.domain [0, s.height]
          return d
      .scan apply, _ndc

  # ---------------------------------------------- Camera Update Streams

  cameraPosition = getCameraPositionStream cameraControls.select('#camera')
  cameraZoom = getCameraZoomStream()
  
  goToNorth = (camera) ->
    _theta = camera.position._polar.theta
    circle = (Math.PI * 2)
    over = _theta % circle
    under = circle - over
    if (over < under) 
      return theta: _theta - over
    else
      return theta: _theta + under
  
  cameraButtonStreams = stream.merge [
    [ 'north', goToNorth ]
    [ 'top', -> phi: MIN_PHI ]
    [ 'phi_45', -> phi: degToRad 45 ]
  ].map (arr) ->
    return stream.fromEvent cameraControls.select("##{arr[0]}").node(), 'click'
      .flatMap ->
        cameraPolarTween arr[1]
          .concat getTweenUpdateStream(1000)

  cameraUpdates = stream.merge [
    cameraPosition
    cameraZoom
    cameraSize
    cameraButtonStreams
  ]

  camera = stream.just getFirstCamera()
    .concat cameraUpdates
    .scan apply
      
  camera.withLatestFrom mainRenderer
    .subscribe (arr) ->
      [camera, renderer] = arr
      renderer.render scene, camera


# ------------------------------------------------------- Functions

addSceneControls = (selection) ->
  selection.append('div')
    .classed 'container', true
    .attr id: 'sceneControls'
    .style
      position: 'absolute'
      right: '0'
      top: '1%'

addMain = (selection) ->
  selection.append('main')
    .style
      width: "100%"
      height: "80vh"
      position: 'relative'

addCone = (obj) ->
  i = obj.children.length
  console.log "cone#{i}"
  coneParent = new THREE.Object3D()
  coneParent.name = "cone#{i}"
  obj.add coneParent
  height = DEFAULT_VOLUME
  geometry = new THREE.CylinderGeometry CONE_TOP, DEFAULT_SPREAD, height
  material = new THREE.MeshBasicMaterial
    color: 0xff0000, wireframe: true
  cone = new THREE.Mesh geometry, material
  cone.name = "cone#{i}"
  cone.position.y = -cone.geometry.parameters.height/2
  coneParent.add cone

updateHud = (sceneControls) ->
  (a) ->
    card = d3.select('#sceneControls').selectAll('#objectCard').data a
    card.enter().append('div')
      .classed 'card', true
      .attr id: 'objectCard'
      .each (d) ->
        _card = d3.select this
        _card.append('div').classed('card-block', true)
          .append 'canvas'
          .each addHudScene
        btns = _card.append('div').classed('card-block', true)
        btns.append('button').classed('btn btn-secondary', true)
          .attr id: 'addCone'
          .text 'add cone'
        btns.append('button').classed('btn btn-secondary', true)
          .attr id: 'removeCone'
          .property disabled: true
          .text 'remove cone'
        _card.append('div').classed('card-block', true)
          .append('button').classed('btn btn-secondary', true)
          .attr id: 'coneFile'
          .property disabled: true
          .text 'file'
        addCardSlider _card, 'coneZ', 0, Math.PI, 0.01
        addCardSlider _card, 'coneY', 0, Math.PI * 2, 0.01
        addCardSlider _card, 'coneHeight', 0.01, 5, 0.01
        addCardSlider _card, 'coneSpread', 0.01, 5, 0.01
    card.each updateCard
    card.exit()
      .each (d) ->
        can = d3.select(this).select('canvas').node()
        can._renderer.dispose()
      .remove()
    return card
  
addCardSlider = (selection, name, min, max, step) ->
  selection.append('div').classed('card-block', true)
    .call (s) ->
      s.append 'input'
        .attr 
          type: 'range', id: name
          min: min, max: max, step: step
      s.append('span').text " #{name}"
  
updateCard = (d) ->
  _card = d3.select this
  canvas = _card.select('canvas')
  thisName = d.object.name
  exists = canvas.node()._scene.getObjectByName thisName
  console.log exists
  
addHudScene = (d) ->
  clone = d.object.clone()
  c = d3.select this
  canvas = c.node()
  geometry = new THREE.BoxGeometry( 1, 1, 1 )
  material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } )
  cube = new THREE.Mesh( geometry, material )
	
  canvas._scene = new THREE.Scene()
  canvas._scene.add clone
  
  canvas._camera = new THREE.OrthographicCamera()
  canvas._camera.zoom = 3
  canvas._camera.left = -10
  canvas._camera.right = 10
  canvas._camera.bottom = -10
  canvas._camera.top = 10
  canvas._camera.updateProjectionMatrix()
  
  #canvas._camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 )
  canvas._camera.position.z = 5
  
  canvas._renderer = new THREE.WebGLRenderer canvas: canvas
  canvas._renderer.setSize 200, 200
  canvas._renderer.setClearColor "white"

combineNdc = (canvas) ->
  (event, ndc) ->
    mouse = d3.mouse canvas
    return {
      x: ndc.x mouse[0]
      y: ndc.y mouse[1]
    }

combineNDC = (event, ndc) ->
  mouse = d3.mouse canvas
  return {
    x: ndc.x mouse[0]
    y: ndc.y mouse[1]
  }

getIntersects = (object, raycaster) ->
  (mouse, camera) ->
    raycaster.setFromCamera mouse, camera
    return raycaster.intersectObjects object.children, false

getCanvasClick = (canvas) ->
  return stream.create (observer) ->
    d3.select(canvas).on 'click', => observer.onNext()

getCanvasDrag = (canvas) ->
  canvasDragHandler = d3.behavior.drag()
  d3.select(canvas).call canvasDragHandler
  return stream.create (observer) ->
    canvasDragHandler.on 'drag', -> observer.onNext d3.event

cameraPolarTween = (endFunc) ->
  return stream.just (camera) ->
    polarStart = camera.position._polar
    end = endFunc camera
    camera._interpolator = d3.interpolate polarStart, end
    camera._update = (t) -> (c) ->
      c.position._polar = c._interpolator t
      c.position.copy polarToVector c.position._polar
      c.lookAt c._lookAt
      return c
    return camera

getCameraPositionStream = (selection) ->
  cameraDrag = d3.behavior.drag()
  selection.call cameraDrag
  return Rx.Observable.create (observer) ->
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

getCameraZoomStream = ->
  zooms = [['In',2],['Out',.5]].map (a) ->
    node = d3.select("#zoom#{a[0]}").node()
    stream.fromEvent node, 'click'
      .map -> a[1]
  return stream.merge zooms
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

addCameraControls = (main) ->
  cameraControls = main
    .append('div').classed 'container', true
    .style
      position: 'absolute'
      right: '0'
      bottom: '1%'
    .append('div').classed 'row', true
    .append('div').classed 'col-xs-12', true
    .append('div').classed "cameraControls", true
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
  return cameraControls

getModeButtons = (sceneControls) ->
  butts = [
    { name: 'object' }
    { name: 'zone' }
    { name: 'trajectory' }
  ]
  return sceneControls
    .append('div').classed 'row', true
    .append('div').classed 'col-xs-12', true
    .append('div').classed 'btn-group modes pull-right', true
    .call (group) ->
      group.selectAll('button').data butts
        .enter().append('button')
        .classed 'btn btn-secondary', true
        .property 'disabled', true
        .attr 'id', (d) -> d.name
        .html (d) -> d.html ? d.name

getFirstCamera = ->
  c = new THREE.OrthographicCamera()
  c.zoom = INITIAL_ZOOM
  c.position._polar =
    radius: CAMERA_RADIUS
    theta: degToRad INITIAL_THETA
    phi: degToRad INITIAL_PHI
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
  
getClientSize = (element) ->
  width: element.clientWidth
  height: element.clientHeight

apply = (last, func) -> func last

degToRad = d3.scale.linear().domain([0,360]).range [0,2*Math.PI]

do start


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
