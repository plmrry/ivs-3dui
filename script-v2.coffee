Rx.config.longStackSupport = true
stream = Rx.Observable
raycaster = new THREE.Raycaster()

CAMERA_RADIUS = 100
INITIAL_THETA = 80 # longitude
INITIAL_PHI = 45 # 90 - latitude
INITIAL_ZOOM = 40
MIN_PHI = 0.01
MAX_PHI = Math.PI * 0.5

room =
    width: 15
    length: 10
    height: 3

DEFAULT_OBJECT_VOLUME = room.width * 0.1
DEFAULT_OBJECT_HEIGHT = room.height * 0.5
CONE_TOP = 0.01
DEFAULT_SPREAD = 0.3

emitter = do ->
  subject = new Rx.Subject()
  _emitter = (event) ->
    return subject
      .filter (o) -> o.event is event
      .map (o) -> o.data
  _emitter.emit = (event, data) ->
    subject.onNext { event, data }
  return _emitter

start = ->
  # ---------------------------------------------- DOM Init
  main = addMain d3.select('body')
  canvas = main.append('canvas').node()
  
  sceneControls = addSceneControls main
  modeButtons = getModeButtons sceneControls
  cameraControls = addCameraControls main

  # ---------------------------------------------- Three.js Init
  firstRenderer = new THREE.WebGLRenderer canvas: canvas
  firstRenderer.setClearColor 'white'
  
  roomObject = getRoomObject room
  scene = getInitialScene roomObject

  # ---------------------------------------------- Resize
  resize = Rx.Observable.fromEvent window, 'resize'
    .startWith target: window
    .map (e) -> e.target
    .map -> getClientSize main.node()

  renderer = stream.just firstRenderer
    .concat resize
    .scan (r, s) ->
      r.setSize s.width, s.height
      return r
    
  # ---------------------------------------------- Add Object Button
  
  # floorIntersects = stream.fromEvent emitter, 'floorIntersects'
  floorIntersects = emitter 'floorIntersects'
  
  emitter 'objectAdded'
    .withLatestFrom emitter 'cameraState'
    .subscribe (arr) ->
      [object, camera] = arr
      
  
  addObject = emitter 'addObject'
    .withLatestFrom emitter 'floorIntersects'
    .subscribe (arr) ->
      [ event, intersects ] = arr
      p = intersects[0]?.point
      newObject = new THREE.Object3D()
      geometry = new THREE.SphereGeometry DEFAULT_OBJECT_VOLUME
      material = new THREE.MeshBasicMaterial
        color: 0x0000ff, wireframe: true
      object = new THREE.Mesh geometry, material
      y = DEFAULT_OBJECT_HEIGHT
      object.position.set p.x, y, p.z
      update = (model) ->
        i = model.room.children.length
        object.name = "object#{i}"
        model.room.add object
        return model
      emitter.emit 'modelUpdate', update
      emitter.emit 'objectAdded', object
  
  cameraState = emitter 'cameraState'

  cancelAdd = emitter 'cancelAdd'
    .do -> console.log 'Add object mode cancelled.'
  
  addObjectMode = stream.fromEvent(
      modeButtons.select('#object').node(), 
      'click'
    )
    
  readyAdd = addObjectMode.map -> true
    .merge cancelAdd.map -> false
    .startWith false
    .do (d) -> console.log 'readyAdd', d
    
  addObjectMode
    .withLatestFrom cameraState, (e, c) -> c
    .subscribe (camera) ->
      if not isAbove camera
        cameraPolarTween(goToTop, emitter) camera

  # ---------------------------------------------- Camera Update Streams
  # cameraTop = stream.fromEvent emitter, 
  
  cameraMoveButton = cameraControls.select('#camera')
  cameraSize = resize.map setCameraSize
  cameraPosition = getCameraPositionStream cameraMoveButton, emitter
  cameraZoom = getCameraZoomStream emitter
  
  cameraButtonStreams = getCameraButtonStreams cameraControls, emitter
  
  cameraTweenStream = emitter 'tweenCamera'
    .flatMap (o) -> getTweenStream(o.duration) o.update
  
  cameraUpdates = stream.merge [
    cameraPosition
    cameraZoom
    cameraSize
    cameraButtonStreams
    cameraTweenStream
  ]
  
  # Transform camera updates into model updates
  cameraModelUpdates = cameraUpdates
    .map (func) ->
      (model) ->
        model.camera = func model.camera
        emitter.emit 'cameraState', model.camera
        return model

  # Normalized device coordinates
  mainNDC = resize.map updateNdcDomain
    .scan apply, getNdcScales()
  
  canvasDrag = fromD3drag d3.select(canvas)
    .map getMouseFrom canvas
    .withLatestFrom mainNDC, getNdcFromMouse
    .map (e) ->
      e.update = updateIntersects e
      return e
    .shareReplay()
    
  modelState = emitter 'modelState'
  
  canvasDrag.withLatestFrom modelState
    .subscribe (arr) ->
      [ event, model ] = arr
      m = model
      mouse = event.ndc
      raycaster.setFromCamera mouse, m.camera
      room = raycaster.intersectObjects m.room.children, false
      floor = raycaster.intersectObject m.floor, false
      emitter.emit 'floorIntersects', floor
  
  canvasDragStart = canvasDrag
    .filter (event) -> event.type is 'dragstart'
    #.do (event) -> console.log event
    
  canvasDragStart.withLatestFrom readyAdd
    .subscribe (arr) ->
      [ event, ready ] = arr
      if ready 
        console.info 'Adding object.'
        emitter.emit 'addObject', event
        emitter.emit 'cancelAdd'
      else
        console.info 'Not in add object mode.'
    
  panStart = canvasDragStart.map setPanStart
        
  canvasDragMove = canvasDrag
    .filter (event) -> event.type is 'drag'
    .map panCamera

  allModelUpdates = stream.merge(
    cameraModelUpdates
    panStart
    canvasDragMove
    emitter 'modelUpdate'
  )
  
  model = stream.just
    camera: getFirstCamera()
    room: roomObject
    scene: scene
    floor: scene.getObjectByName 'floor'
  .concat allModelUpdates
  .scan (o, fn) ->
    emitter.emit 'modelState', o
    return fn o
  
  camera = model.map (model) -> model.camera
    
  # ---------------------------------------------- Render   
  do ->
    onNext = (arr) ->
      [camera, renderer] = arr
      renderer.render scene, camera
    onError = (err) -> console.error(err.stack);
    camera.withLatestFrom renderer
      .subscribe onNext, onError
      
  #camera.connect()

# ------------------------------------------------------- Functions

getInitialScene = (roomObject) ->
  edges = new THREE.EdgesHelper roomObject, 0x00ff00 
  mainObject = getMainObject()
  mainObject.add roomObject
  mainObject.add edges
  scene = new THREE.Scene()
  scene.add mainObject
  return scene

isAbove = (camera) -> camera.position._polar.phi is MIN_PHI

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
  
fromD3drag = (selection) ->
  handler = d3.behavior.drag()
  selection.call handler
  return fromD3dragHandler handler

fromD3dragHandler = (drag) ->
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
    
getCameraButtonStreams = (cameraControls, emitter) ->
  stream.merge [
    [ 'north', goToNorth ]
    [ 'top', goToTop ]
    [ 'phi_45', -> phi: degToRad 45 ]
  ].map (arr) ->
    node = cameraControls.select("##{arr[0]}").node()
    endFunc = arr[1]
    return stream.fromEvent node, 'click'
      .map -> cameraPolarTween(endFunc, emitter)
      
goToTop = -> phi: MIN_PHI

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
  d3.select('html').style height: '100%'
  d3.select('body').style height: '100%'
  selection.append('main')
    .style
      width: "100%"
      height: "100%"
      position: 'relative'

addCone = (obj) ->
  i = obj.children.length
  console.log "cone#{i}"
  coneParent = new THREE.Object3D()
  coneParent.name = "cone#{i}"
  obj.add coneParent
  height = DEFAULT_OBJECT_VOLUME
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
    
cameraPolarTween = (endFunc, emitter) ->
  (camera) ->
    polarStart = camera.position._polar
    end = endFunc camera
    interpolator = d3.interpolate polarStart, end
    update = (t) -> (c) ->
      c.position._polar = interpolator t
      c.position._relative = polarToVector c.position._polar
      c.position.addVectors c.position._relative, c._lookAt
      c.lookAt c._lookAt
      return c
    emitter.emit 'tweenCamera', { update: update, duration: 1000 }
    return camera

getCameraPositionStream = (selection, emitter) ->
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

updateCameraPosition = (event) ->
  (camera) ->
    e = event
    polar = camera.position._polar
    polar.phi += degToRad e.dy
    polar.theta += degToRad e.dx
    polar.phi = MIN_PHI if polar.phi < MIN_PHI
    polar.phi = MAX_PHI if polar.phi > MAX_PHI
    camera.position._relative = polarToVector camera.position._polar
    camera.position.addVectors camera.position._relative, camera._lookAt
    camera.lookAt camera._lookAt
    return camera

getCameraZoomStream = (emitter) ->
  ZOOM_AMOUNT = 2
  a = ZOOM_AMOUNT
  zooms = [['In',a],['Out',1/a]].map (a) ->
    node = d3.select("#zoom#{a[0]}").node()
    stream.fromEvent node, 'click'
      .map -> a[1]
  return stream.merge zooms
    .map (dz) ->
      (camera) ->
        z = camera.zoom
        interpolator = d3.interpolate z, z * dz
        update = (t) -> (c) ->
          c.zoom = interpolator t
          c.updateProjectionMatrix()
          return c
        emitter.emit 'tweenCamera', { update: update, duration: 500 }
        return camera
      
getTweenStream = (duration) -> (update) ->
  tweenStream(duration).map update

tweenStream = (duration) ->
  duration ?= 0
  Rx.Observable.create (observer) ->
    d3.transition()
      .duration duration
      .tween "tween", -> (t) -> observer.onNext t
      .each "end", -> observer.onCompleted()

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
    { name: 'object', html: 'add object' }
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
        #.property 'disabled', true
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
  d3.select('body').append('p').text(element.clientHeight);
  return {
    width: element.clientWidth
    height: element.clientHeight
  }

apply = (last, func) -> func last

degToRad = d3.scale.linear().domain([0,360]).range [0,2*Math.PI]

do start
