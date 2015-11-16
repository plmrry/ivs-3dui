CAMERA_RADIUS = 100
INITIAL_THETA = 80 # longitude
INITIAL_PHI = 45 # 90 - latitude
INITIAL_ZOOM = 40
MIN_PHI = 0.01
MAX_PHI = Math.PI * 0.5

Rx.config.longStackSupport = true
stream = Rx.Observable
raycaster = new THREE.Raycaster()

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
  _roomObject = getRoomObject room
  edges = new THREE.EdgesHelper _roomObject, 0x00ff00 
  mainObject = getMainObject()
  mainObject.add _roomObject
  mainObject.add edges
  scene = new THREE.Scene()
  scene.add mainObject

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

  #canvasDrag = d3.drag

  # ---------------------------------------------- Camera Update Streams
  cameraSize = resize.map setCameraSize
  cameraPosition = getCameraPositionStream cameraControls.select('#camera')
  cameraZoom = getCameraZoomStream()
  cameraButtonStreams = getCameraButtonStreams cameraControls
  
  cameraUpdates = stream.merge [
    cameraPosition
    cameraZoom
    cameraSize
    cameraButtonStreams
  ]
  
  # Transform camera updates in to model updates
  cameraModelUpdates = cameraUpdates
    .map (func) ->
      (model) ->
        model.camera = func model.camera
        return model

  #Normalized device coordinates
  mainNDC = resize.map updateNdcDomain
    .scan apply, getNdcScales()
  
  canvasDragHandler = d3.behavior.drag()
  d3.select(canvas).call canvasDragHandler
  
  canvasDrag = fromD3drag canvasDragHandler
    .map getMouseFrom canvas
    .withLatestFrom mainNDC, getNdcFromMouse
    .map (e) ->
      e.update = updateIntersects e
      return e
    .shareReplay()
  
  canvasDragStart = canvasDrag
    .filter (event) -> event.type is 'dragstart'
    .map setPanStart
        
  canvasDragMove = canvasDrag
    .filter (event) -> event.type is 'drag'
    .map panCamera

  allModelUpdates = stream.merge(
    cameraModelUpdates
    canvasDragStart
    canvasDragMove
  )
  
  roomObject = stream.just _roomObject
  
  model = stream.just
    camera: getFirstCamera()
    room: _roomObject
    scene: scene
    floor: scene.getObjectByName 'floor'
  .concat allModelUpdates
  .scan apply
  
  camera = model.map (model) -> model.camera
    
  # ---------------------------------------------- Render   
  do ->
    onNext = (arr) ->
      [camera, renderer] = arr
      renderer.render scene, camera
    onError = (err) -> 
      console.error(err.stack);
    camera.withLatestFrom mainRenderer
      .subscribe onNext, onError

# ------------------------------------------------------- Functions

# Based on MapControls.js
# github.com/grey-eminence/3DIT/blob/master/js/controls/MapControls.js
panCamera = (event) ->
  (m) ->
    event.update m
    _current = m.floorIntersects[0]?.point or (new THREE.Vector3())
    _start = m.panStart or _current
    delta = (new THREE.Vector3()).subVectors _start, _current
    m.camera._lookAt.add delta
    m.camera.position.add delta
    return m

setPanStart = (event) ->
  (m) ->
    event.update m
    m.selected = 
      if m.roomIntersects[0]? then 'object' 
      else if m.floorIntersects[0]? then 'floor'
      else 'nothing'
    m.panStart = m.floorIntersects[0]?.point
    return m

updateIntersects = (event) ->
  (model) ->
    m = model
    mouse = event.ndc
    raycaster.setFromCamera mouse, m.camera
    m.roomIntersects = raycaster.intersectObjects m.room.children, false
    m.floorIntersects = raycaster.intersectObject m.floor, false

updateNdcDomain = (s) ->
  (d) ->
    d.x.domain [0, s.width]
    d.y.domain [0, s.height]
    return d

getNdcFromMouse = (event, ndc) ->
  event.ndc = 
    x: ndc.x event.mouse[0]
    y: ndc.y event.mouse[1]
  return event
  
getMouseFrom = (node) ->
  (event) ->
    event.mouse = d3.mouse node
    return event

getMouse = (event) -> 
  #console.log event.sourceEvent.target
  event.mouse = d3.mouse event.sourceEvent.target
  return event

fromD3drag = (drag) ->
  return stream.create (observer) ->
    drag.on 'dragstart', -> observer.onNext d3.event
      .on 'drag', -> observer.onNext d3.event
      .on 'dragend', -> observer.onNext d3.event

fromD3event = (emitter, event) ->
  return stream.create (observer) ->
    emitter.on event, -> observer.onNext d3.event

getCanvasDrag = (canvas) ->
  canvasDragHandler = d3.behavior.drag()
  d3.select(canvas).call canvasDragHandler
  return stream.create (observer) ->
    canvasDragHandler.on 'drag', observer.onNext

getNdcScales = ->
  x: d3.scale.linear().range [-1, 1]
  y: d3.scale.linear().range [1, -1]

setCameraSize = (s) ->
  (c) ->
    [ c.left, c.right ] = [-1, 1].map (d) -> d * s.width/2
    [ c.bottom, c.top ] = [-1, 1].map (d) -> d * s.height/2
    c.updateProjectionMatrix()
    return c
    
getCameraButtonStreams = (cameraControls) ->
  stream.merge [
    [ 'north', goToNorth ]
    [ 'top', -> phi: MIN_PHI ]
    [ 'phi_45', -> phi: degToRad 45 ]
  ].map (arr) ->
    node = cameraControls.select("##{arr[0]}").node()
    return stream.fromEvent node, 'click'
      .flatMap ->
        cameraPolarTween arr[1]
          .concat getTweenUpdateStream(1000)

goToNorth = (camera) ->
  _theta = camera.position._polar.theta
  circle = (Math.PI * 2)
  over = _theta % circle
  under = circle - over
  if (over < under) 
    return theta: _theta - over
  else
    return theta: _theta + under

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
      c.position._relative = polarToVector c.position._polar
      #c.position.copy polarToVector c.position._polar
      c.position.addVectors c.position._relative, c._lookAt
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
      camera.position._relative = polarToVector camera.position._polar
      camera.position.addVectors camera.position._relative, camera._lookAt
      camera.lookAt camera._lookAt
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
  c._lookAt = new THREE.Vector3()
  c.position._polar =
    radius: CAMERA_RADIUS
    theta: degToRad INITIAL_THETA
    phi: degToRad INITIAL_PHI
    
  c.position._relative = polarToVector c.position._polar
  c.position.addVectors c.position._relative, c._lookAt
  #c.position.copy polarToVector c.position._polar

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
  mainObject = new THREE.Object3D()
  
  floorGeom = new THREE.PlaneGeometry 100, 100, 10, 10
  floorMat = new THREE.MeshBasicMaterial
    color: 0xffff00, side: THREE.DoubleSide, wireframe: true
  floor = new THREE.Mesh( floorGeom, floorMat )
  floor.name = 'floor'
  floor.rotateX Math.PI/2
  mainObject.add floor
  
  axisHelper = new THREE.AxisHelper 5
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
