Rx.config.longStackSupport = true
stream = Rx.Observable
raycaster = new THREE.Raycaster()

log = console.log.bind console

CAMERA_RADIUS = 100
INITIAL_THETA = 80
INITIAL_PHI = 45
INITIAL_ZOOM = 40
MIN_PHI = 0.01
MAX_PHI = Math.PI * 0.5
EDIT_MODE_PHI = 85
ZOOM_AMOUNT = 2

ROOM_SIZE =
  width: 15
  length: 10
  height: 3

emitter = do ->
  subject = new Rx.Subject()
  _emitter = (event) ->
    return subject.filter (o) -> o.event is event
      .map (o) -> o.data
  _emitter.emit = (event, data) -> subject.onNext { event, data }
  return _emitter
  
dom = emitter 'start'
  .flatMap ->
    stream.just firstDom()
  .shareReplay()

size = stream.fromEvent window, 'resize'
  .startWith 'first resize'
  .combineLatest dom, (a, b) -> b
  .map (dom) -> getClientSize dom.main.node()

cameraSize = size.map (size) ->
  return (model) ->
    model.camera = setCameraSize(size)(model.camera)
    return model

renderer = dom
  .flatMap (dom) ->
    first = new THREE.WebGLRenderer canvas: dom.canvas
    first.setClearColor 'white'
    return size.scan (r, s) ->
      r.setSize s.width, s.height
      return r
    , first
    
emitter 'tweenCamera'
  .flatMap (o) ->
    tweenStream o.duration
      .map o.update
  .map (update) ->
    return (model) ->
      model.camera = update model.camera
      return model
  .subscribe (update) -> 
    emitter.emit 'modelUpdate', update

modelUpdates = stream.merge cameraSize, emitter 'modelUpdate'

model = emitter 'start'
  .flatMap ->
    modelUpdates.scan (o, fn) ->
      emitter.emit 'modelState', o
      return fn o
    , firstModel()

# ------------------------------------------------------- Render 
do ->
  onNext = (arr) ->
    [model, renderer] = arr
    renderer.render model.scene, model.camera
  onError = (err) -> console.error(err.stack);
  model.combineLatest renderer
    .subscribe onNext, onError
    
# ------------------------------------------------------- Emitters 
# ------------------------------------ Camera Position
dom
  .flatMap (dom) ->
    cameraMove = dom.cameraControls.select '#camera'
    fromD3drag cameraMove
  .filter (e) -> e.type is 'drag'
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
  .subscribe (camUpdate) -> 
    update = (model) ->
      model.camera = camUpdate model.camera
      return model
    emitter.emit 'modelUpdate', update
    
# ------------------------------------------------------- Emitters 
# ------------------------------------ Camera Zoom
dom
  .flatMap (dom) ->
    a = ZOOM_AMOUNT
    zooms = [['In',a],['Out',1/a]].map (arr) ->
      node = dom.cameraControls.select("#zoom#{arr[0]}").node()
      stream.fromEvent node, 'click'
        .map -> arr[1]
    return stream.merge zooms
  .withLatestFrom emitter 'modelState'
  .map (arr) -> 
    [ dz, model ] = arr
    camera = model.camera
    z = camera.zoom
    interpolator = d3.interpolate z, z * dz
    update = (t) -> (c) ->
      c.zoom = interpolator t
      c.updateProjectionMatrix()
      return c
    return update
  .subscribe (update) -> 
    emitter.emit 'tweenCamera', { update: update, duration: 500 }
    
# ------------------------------------------------------- Emitters 
# ------------------------------------ Add Object
addObjectMode = dom
  .flatMap (dom) ->
    addObject = dom.modeButtons.select('#object').node()
    return stream.fromEvent addObject, 'click'
readyAdd = addObjectMode.map -> true
  .merge emitter('cancelAdd').map -> false
  .startWith false
  .do (d) -> log "readyAdd #{d}"
  .subscribe()
addObjectMode
  .withLatestFrom emitter('modelState'), (a, b) -> b
  .subscribe (model) ->
    camera = model.camera
    maxPhi = degToRad EDIT_MODE_PHI
    if camera.position._polar.phi > maxPhi
      endFunc = -> phi: maxPhi
      update = cameraPolarTweenFunc(endFunc)(camera)
      emitter.emit 'tweenCamera', { update: update, duration: 1000 }
  
# ------------------------------------------------------- Functions

cameraPolarTweenFunc = (endFunc) -> (camera) ->
  polarStart = camera.position._polar
  end = endFunc camera
  interpolator = d3.interpolate polarStart, end
  update = (t) -> (c) ->
    c.position._polar = interpolator t
    c.position._relative = polarToVector c.position._polar
    c.position.addVectors c.position._relative, c._lookAt
    c.lookAt c._lookAt
    return c
  return update

addMain = (selection) ->
  d3.select('html').style height: '100%'
  d3.select('body').style height: '100%'
  selection.append('main')
    .style
      width: "100%"
      height: "100%"
      position: 'relative'

getClientSize = (element) ->
  width: element.clientWidth
  height: element.clientHeight
  
addSceneControls = (selection) ->
  selection.append('div')
    .classed 'container', true
    .attr id: 'sceneControls'
    .style
      position: 'absolute'
      right: '0'
      top: '1%'
      
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
        .attr 'id', (d) -> d.name
        .html (d) -> d.html ? d.name
        
addCameraControls = (main) ->
  cameraControls = main
    .append('div').classed 'container', true
    .style(
      position: 'absolute'
      right: '0'
      bottom: '1%'
    )
    .append('div').classed 'row', true
    .append('div').classed 'col-xs-12', true
    .append('div').classed "cameraControls", true
  buttons = [
    { name: "north" }, { name: "top" }
    { name: "phi_45", html: '45' }
    { name: "camera", html: materialIcon '3d_rotation' }
    { name: "zoomIn", html: materialIcon 'zoom_in' }
    { name: "zoomOut", html: materialIcon 'zoom_out' }
  ]
  butts = cameraControls.selectAll("button").data(buttons)
  butts.enter().append("button")
    .classed("btn btn-secondary", true)
    .attr "id", (d) -> d.name
    .html (d) -> d.html ? d.name
  return cameraControls
  
materialIcon = (text) ->
  "<i class='material-icons' style='display: block'>#{text}</i>"
  
getRoomObject = (room) ->
  geometry = new THREE.BoxGeometry room.width, room.height, room.length
  material = new THREE.MeshBasicMaterial
    color: 0x00ff00, transparent: true, opacity: 0.1
  roomObject = new THREE.Mesh( geometry, material );
  roomObject.name = 'room'
  return roomObject
  
getInitialScene = (roomObject) ->
  edges = new THREE.EdgesHelper roomObject, 0x00ff00 
  mainObject = getMainObject()
  mainObject.add roomObject
  mainObject.add edges
  scene = new THREE.Scene()
  scene.add mainObject
  return scene
  
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
  
# NOTE: See http://mathworld.wolfram.com/SphericalCoordinates.html
polarToVector = (o) ->
  { radius, theta, phi } = o
  x = radius * Math.cos(theta) * Math.sin(phi)
  y = radius * Math.sin(theta) * Math.sin(phi)
  z = radius * Math.cos(phi)
  return new THREE.Vector3 y, z, x
  
setCameraSize = (s) ->
  (c) ->
    [ c.left, c.right ] = [-1, 1].map (d) -> d * s.width/2
    [ c.bottom, c.top ] = [-1, 1].map (d) -> d * s.height/2
    c.updateProjectionMatrix()
    return c

tweenStream = (duration, name) ->
  duration ?= 0
  name ?= 'tween'
  Rx.Observable.create (observer) ->
    d3.select({}).transition()
      .duration duration
      .tween name, -> (t) -> observer.onNext t
      .each "end", -> observer.onCompleted()
    
firstModelUpdate = (model) ->
  model.camera = getFirstCamera()
  model.room = getRoomObject model.roomSize
  model.scene = getInitialScene model.room
  return model
  
firstModel = ->
  _model = {}
  _model.camera = getFirstCamera()
  _model.room = getRoomObject ROOM_SIZE
  _model.scene = getInitialScene _model.room
  return _model
  
firstDom = ->
  dom = {}
  dom.main = main = addMain d3.select 'body'
  dom.canvas = main.append('canvas').node()
  dom.sceneControls = addSceneControls main
  dom.modeButtons = getModeButtons dom.sceneControls
  dom.cameraControls = addCameraControls main
  return dom
  
fromD3drag = (selection) ->
  handler = d3.behavior.drag()
  selection.call handler
  return fromD3dragHandler handler

fromD3dragHandler = (drag) ->
  return stream.create (observer) ->
    drag.on 'dragstart', -> observer.onNext d3.event
      .on 'drag', -> observer.onNext d3.event
      .on 'dragend', -> observer.onNext d3.event
      
apply = (o, fn) -> fn o

degToRad = d3.scale.linear().domain([0,360]).range [0,2*Math.PI]
    
emitter.emit 'start'