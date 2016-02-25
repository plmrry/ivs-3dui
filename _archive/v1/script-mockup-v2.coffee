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
EDIT_MODE_ZOOM = 90
EDIT_MODE_PHI = 85
ZOOM_AMOUNT = 2
DEFAULT_OBJECT_HEIGHT = 0
PARENT_SPHERE_COLOR = new THREE.Color 0, 0, 0

ROOM_SIZE =
  width: 20
  length: 18
  height: 3

DEFAULT_OBJECT_VOLUME = 1
DEFAULT_CONE_SPREAD = 0.3
MAX_CONE_SPREAD = 2
MAX_CONE_VOLUME = 2
CONE_BOTTOM = 0.01

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

ndc = emitter 'start'
  .flatMap ->
    size.map updateNdcDomain
      .scan apply, firstNdcScales()

cameraSize = size.map (size) ->
  return (model) ->
    model.camera = setCameraSize(size)(model.camera)
    return model

renderer = dom
  .flatMap (dom) ->
    first = new THREE.WebGLRenderer
      canvas: dom.canvas
      antialias: true
    first.shadowMap.enabled = true
    first.shadowMap.type = THREE.PCFSoftShadowMap
    # first.setClearColor 0xff0000
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
# ------------------------------------ Canvas Drag
canvasDrag = dom
  .flatMap (dom) ->
    canvas = dom.canvas
    fromD3drag d3.select canvas
      .map getMouseFrom canvas
  .withLatestFrom ndc, (a, b) -> getNdcFromMouse a, b
  .withLatestFrom emitter 'modelState'
  .do (arr) ->
    [event, model] = arr
    raycaster.setFromCamera event.ndc, model.camera
    # console.log model.room.children
    # console.log raycaster.intersectObjects model.room.children, false
    # console.log raycaster.intersectObjects model.room.children, true
    # console.log raycaster.intersectObject model.room, true
    roomIntersects = raycaster.intersectObjects model.room.children, true
    floorIntersects = raycaster.intersectObject model.floor, false
    emitter.emit 'roomIntersects', roomIntersects
    emitter.emit 'floorIntersects', floorIntersects
  .map (arr) -> arr[0]
  .subscribe (d) -> emitter.emit 'canvasDrag', d

r = emitter('roomIntersects')
f = emitter('floorIntersects')
allIntersects = stream.combineLatest r, f, ((r, f) -> room: r, floor: f)

_canvasDragStart = emitter 'canvasDrag'
  .filter (e) -> e.type is 'dragstart'

_canvasDragEnd = emitter 'canvasDrag'
  .filter (e) -> e.type is 'dragend'

canvasDragStart = emitter 'canvasDrag'
  .filter (e) -> e.type is 'dragstart'
  .withLatestFrom allIntersects, (e, i) -> i

canvasDragMove = emitter 'canvasDrag'
  .filter (e) -> e.type is 'drag'
  .withLatestFrom allIntersects, (e, i) -> i

canvasDragEnd = emitter 'canvasDrag'
  .filter (e) -> e.type is 'dragend'
  .withLatestFrom allIntersects, (e, i) -> i

# ------------------------------------------------------- Emitters
# ------------------------------------ Add Object Mode
addObjectMode = dom
  .flatMap (dom) ->
    addObject = dom.modeButtons.select('#object').node()
    return stream.fromEvent addObject, 'click'

readyAdd = addObjectMode.map -> true
  .merge emitter('cancelAdd').map -> false
  .startWith false
  .do (d) -> log "readyAdd #{d}"

# ------------------------------------------------------- Emitters
# ------------------------------------ Add Object
canvasDragStart
  .withLatestFrom readyAdd
  .filter (arr) -> arr[1] is true
  .subscribe (arr) ->
    [ event, ready ] = arr
    console.info 'Adding object.'
    emitter.emit 'addObject', event

canvasDragEnd
  .withLatestFrom readyAdd
  .filter (arr) -> arr[1] is true
  .subscribe (arr) -> emitter.emit 'cancelAdd'

_canvasDragEnd
  .withLatestFrom _canvasDragStart
  .filter (arr) ->
    xEqual = arr[0].mouse[0] is arr[1].mouse[0]
    yEqual = arr[0].mouse[1] is arr[1].mouse[1]
    return xEqual and yEqual
  .map (arr) -> arr[0]
  .subscribe (event) -> emitter.emit 'click', event

# ------------------------------------------------------- Emitters
# ------------------------------------ Unselect Others
# canvasDragStart
#   .withLatestFrom readyAdd
#   .filter (arr) -> arr[1] is false # Not in object-add mode
#   .map (arr) -> arr[0]
#   .filter (i) -> i.room.length is 0 # Didn't click an object
#   .subscribe -> emitter.emit 'unselectOthers', {}

# ------------------------------------------------------- Emitters
# ------------------------------------ Select Object
#.withLatestFrom allIntersects, (e, i) -> i
# canvasDragStart
emitter 'click'
  .withLatestFrom allIntersects, (e, i) -> i
  .withLatestFrom readyAdd
  .filter (arr) -> arr[1] is false # Not in object-add mode
  .map (arr) -> arr[0]
  .filter (i) -> i.room.length > 0 # Did click an object
  .subscribe (i) ->
    # emitter.emit 'selectObject', i.room[0].object

emitter 'click'
  .withLatestFrom allIntersects, (e, i) -> i
  .pausable readyAdd.map (d) -> not d # Not in object-add mode
  .filter (i) -> i.room.length is 0 # Did not click an object
  .do -> console.log 'clicked floor'
  .subscribe ->
    emitter.emit 'unselectAll'

emitter 'unselectAll'
  .subscribe (i) ->
    emitter.emit 'unselectOthers', {}

# ------------------------------------------------------- Emitters
# ------------------------------------ Camera Pan
canvasDragMove
  .withLatestFrom readyAdd
  .filter (arr) -> arr[1] is false # Not in object add move
  .map (arr) -> arr[0]
  .withLatestFrom canvasDragStart
  .filter (arr) -> not arr[1].room[0]? # Didn't start with an object
  .map (arr) ->
    [current, start] = arr
    _current = current.floor[0]?.point or (new THREE.Vector3())
    _start = start.floor[0]?.point or _current
    delta = (new THREE.Vector3()).subVectors _start, _current
    update = (model) ->
      model.camera._lookAt.add delta
      model.camera.position.add delta
      return model
    return update
  .subscribe (update) -> emitter.emit 'modelUpdate', update

# ------------------------------------------------------- Emitters
# ------------------------------------ Object Move
canvasDragStart
  .withLatestFrom readyAdd
  .filter (arr) -> arr[1] is false # Not in object add move
  .map (arr) -> arr[0]
  .filter (start) -> start.room[0]? # Started on an object
  .flatMap (start) ->
    canvasDragMove.startWith start
      .filter (ints) -> ints.floor[0]? # Ignore non-floor drags
      .map (ints) -> ints.floor[0]?.point
      .bufferWithCount 2, 1
      .takeUntil canvasDragEnd
  .map (arr) ->
    return (new THREE.Vector3())
      .subVectors arr[1], arr[0]
  .withLatestFrom canvasDragStart
  .map (arr) ->
    [delta, int] = arr
    delta.setY 0
    obj = int.room[0].object
    return (model) ->
      obj.position.add delta
      console.log obj.position
      return model
  .subscribe (update) ->
    emitter.emit 'modelUpdate', update

# ------------------------------------------------------- Emitters
# ------------------------------------ Camera Position
dom
  .flatMap (dom) ->
    # cameraMove = dom.cameraControls.select '#camera'
    cameraMove = dom.miniCube
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
    zooms = [['Out',1/a],['In',a]].map (arr) ->
      node = dom.cameraControls.select("#zoom#{arr[0]}").node()
      stream.fromEvent node, 'click'
        .map -> arr[1]
    return stream.merge zooms
  .subscribe (dz) ->
    emitter.emit 'zoom', dz

emitter 'zoom'
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

addObjectMode
  .withLatestFrom emitter('modelState'), (a, b) -> b
  .subscribe (model) ->
    camera = model.camera
    currentPhi = camera.position._polar.phi
    maxPhi = degToRad EDIT_MODE_PHI

    if currentPhi > maxPhi
      endFunc = -> phi: maxPhi
      updatePhi = cameraPolarTweenFunc(endFunc)(camera)
      emitter.emit 'tweenCamera', { update: updatePhi, duration: 500 }

    if camera.zoom isnt INITIAL_ZOOM
      i = d3.interpolate camera.zoom, INITIAL_ZOOM
      updateZoom = (t) -> (c) ->
        c.zoom = i t
        c.updateProjectionMatrix()
        return c
      emitter.emit 'tweenCamera', { update: updateZoom, duration: 500 }

emitter 'addObject'
  .withLatestFrom emitter 'floorIntersects'
  .subscribe (arr) ->
    [ event, intersects ] = arr
    p = intersects[0]?.point
    addObjectAtPoint p

addObjectAtPoint = (p, volume) ->
  console.info "Add object at", p

  geometry = new THREE.SphereGeometry 0.1, 30, 30

  material = new THREE.MeshPhongMaterial(
    color: PARENT_SPHERE_COLOR
    transparent: true
    opacity: 0.3
    # shading: THREE.FlatShading
    side: THREE.DoubleSide
  )

  sphere = new THREE.Mesh geometry, material
  sphere.castShadow = true
  sphere.receiveShadow = true
  sphere.name = 'parentSphere'
  sphere._volume = volume or 1
  sphere.renderOrder = 10
  
  lineGeom = new THREE.Geometry()
  _lineBottom = -p.y + (-ROOM_SIZE.height/2)
  lineGeom.vertices.push new THREE.Vector3 0, _lineBottom, 0
  lineGeom.vertices.push new THREE.Vector3 0, 100, 0
  lineGeom.computeLineDistances()
      
  s = 0.3
  mat = new THREE.LineDashedMaterial
    color: 0, linewidth: 1, dashSize: s, gapSize: s,
    transparent: true, opacity: 0.2
        
  line = new THREE.Line(lineGeom, mat)
  
  sphere.add line

  object = sphere
  DEFAULT_OBJECT_HEIGHT = 1
  y = DEFAULT_OBJECT_HEIGHT
  # object.position.set p.x, p.y, p.z
  object.position.copy p
  update = (model) ->
    i = model.room.children.length
    object.name = "object#{i}"
    object._id = i
    model.room.add object
    return model
  emitter.emit 'modelUpdate', update
  emitter.emit 'tweenInSphere', sphere
  # emitter.emit 'tweenSphereVolume', sphere
  emitter.emit 'objectAdded', object
  return object

emitter 'objectAdded'
  .subscribe (o) ->
    # emitter.emit 'selectObject', o
    # emitter.emit 'editSelected'

# ------------------------------------------------------- Emitters
# ------------------------------------ Object Selected
highlightObject = (o) ->
  # color = new THREE.Color 0, 0, 1
  color = new THREE.Color "#99ebff"
  color = new THREE.Color "#66c2ff"
  tweenColor(color) o
    .subscribe (up) -> emitter.emit 'modelUpdate', (m) -> m
  
emitter('selectObject')
  .do (o) -> emitter.emit 'unselectOthers', o
  .flatMap (o) ->
    # red = new THREE.Color 1, 0, 0
    color = new THREE.Color 0, 0, 1
    return tweenColor(color) o
  .subscribe (update) -> emitter.emit 'modelUpdate', update

emitter('selectObject')
  .withLatestFrom dom
  .subscribe (arr) ->
    [object, dom] = arr
    updateObjectControls(dom) [object]
    # emitter.emit 'domUpdated', dom

emitter 'unselectAll'
  .withLatestFrom dom, (a, b) -> b
  .subscribe (dom) ->
    updateObjectControls(dom) []
    # emitter.emit 'domUpdated', dom

addCone = emitter 'domAdded'
  .map (dom) -> dom.sceneControls.select('#add-cone').node()
  .filter (node) -> node?
  .flatMap (node) -> stream.fromEvent node, 'click'
  .do -> console.info 'Add cone.'
  .subscribe (event) ->
    obj = d3.select(event.target).datum()
    console.log obj
    emitter.emit 'addCone', obj

emitter 'coneAdded'
  .subscribe (coneParent) ->
    emitter.emit 'selectCone', coneParent

emitter 'selectCone'
  .withLatestFrom dom
  .subscribe (arr) ->
    [object, dom] = arr
    updateConeControls(dom) [object]
    # emitter.emit 'domUpdated', dom
    
getConeParentWithParams = (params) ->
  coneParent = new THREE.Object3D()
  Object.assign coneParent, params
  coneParent.castShadow = true
  coneParent.receiveShadow = true
  CONE_RADIAL_SEGMENTS = 50
  geometry = new THREE.CylinderGeometry()
  geometry.parameters =
    radiusBottom: CONE_BOTTOM
    openEnded: true
    radialSegments: CONE_RADIAL_SEGMENTS
  geometry = geometry.clone()
  material = new THREE.MeshPhongMaterial(
    transparent: true
    opacity: 0.5
    side: THREE.DoubleSide
    # depthWrite: false
  )
  cone = new THREE.Mesh geometry, material
  cone.name = 'cone'
  cone.castShadow = true
  cone.renderOrder = 1
  cone.receiveShadow = true
  coneParent.add cone
  return coneParent
  
addConeParentWithParams = (params) ->
  (obj) ->
    coneParent = getConeParentWithParams params
    updateConeParent coneParent
    i = obj.children.length
    coneParent.name = "cone#{i}"
    obj.add coneParent
    
emitter 'addCone'
  .subscribe (obj) ->
    params =
      _theta: Math.random() * (Math.PI * 2)
      _phi: Math.random() * (Math.PI * 2)
      _volume: DEFAULT_OBJECT_VOLUME
      _spread: DEFAULT_CONE_SPREAD
      
    addConeParentWithParams(params) obj
      
    # coneParent = getConeParentWithParams params
    
    # i = obj.children.length
    # coneParent.name = "cone#{i}"
    # obj.add coneParent
    
    # updateConeParent coneParent

    emitter.emit 'modelUpdate', (m) -> m
    # emitter.emit 'coneAdded', coneParent
    # emitter.emit 'coneParentUpdate', coneParent
    
updateConeParent = (coneParent) ->
  coneParent.rotation.x = coneParent._phi
  coneParent.rotation.z = coneParent._theta
  cone = coneParent.getObjectByName 'cone'
  geom = cone.geometry
  params = geom.parameters
  params.height = coneParent._volume
  params.radiusTop = coneParent._spread
  newGeom = geom.clone()
  cone.geometry.dispose()
  cone.geometry = newGeom
  cone.position.y = cone.geometry.parameters.height/2

emitter 'coneParentUpdate'
  .subscribe (coneParent) ->

    updateConeParent coneParent
    
    emitter.emit 'modelUpdate', (m) -> m

window.emitter = emitter

updateConeControls = (dom) ->
  (data) ->
    coneControls = dom.sceneControls
      .select("#objectControls")
      .select(".card")
      .selectAll("#coneControls")
      .data data
    coneControls.enter()
      .append('div').attr({ id: "coneControls" })
      .call (card) ->
        card.append('div').classed('card-block', true)
          .append('h4').classed('card-title', true)
          .text('Cone')
          .append('button')
          .classed('btn btn-secondary pull-right', true)
          .text 'add file'

    coneControls.exit().remove()

updateObjectControls = (dom) ->
  (data) ->
    objectControls = dom.sceneControls
      .selectAll("#objectControls")
      .data data
    objectControls.enter()
      .append('div').classed('row', true)
        .attr id: 'objectControls'
      .append('div').classed('col-xs-12', true)
      .append('div').classed('card', true)
      .call (card) ->
        card.append('div').classed('card-block', true)
          .append('h4').classed('card-title', true)
          .text('Object')
          .append('button')
          .classed('btn btn-secondary pull-right', true)
          .text 'add cone'
          .attr { id: 'add-cone' }
      .each ->
        emitter.emit 'domAdded', dom
    objectControls.exit().remove()

emitter('unselectObject')
  .flatMap (o) ->
    color = PARENT_SPHERE_COLOR
    return tweenColor(color) o
  .subscribe (update) -> emitter.emit 'modelUpdate', update

tweenColor = (color) -> (o) ->
  # sphere = o.getObjectByName 'parentSphere'
  sphere = o
  start = sphere.material.color
  end = color
  i = d3.interpolate start, end
  tweenStream 500, 'color'
    .map (t) ->
      sphere.material.color = i t
      return (model) -> model

emitter('unselectOthers')
  .withLatestFrom emitter('modelState')
  .subscribe (arr) ->
    [obj, model] = arr
    chil = model.room.children
    _.without chil, obj
      .forEach (o) -> emitter.emit 'unselectObject', o

# ------------------------------------------------------- Emitters
# ------------------------------------ Unselect Others



# ------------------------------------------------------- Emitters
# ------------------------------------ Edit Selected Object
o = emitter('selectObject')
m = emitter('modelState')
emitter 'editSelected'
  .withLatestFrom( o, m, (e, o, m) -> [o, m] )
  .map (arr) ->
    [object, model] = arr
    camera = model.camera
    i =
      lookAt: d3.interpolate camera._lookAt, object.position
      zoom: d3.interpolate camera.zoom, EDIT_MODE_ZOOM
      phi: d3.interpolate camera.position._polar.phi, degToRad EDIT_MODE_PHI

    update = (t) -> (c) ->
      position = c.position
      polar = position._polar
      polar.phi = i.phi t
      position._relative = polarToVector polar
      c._lookAt.copy i.lookAt t
      position.addVectors position._relative, c._lookAt
      c.zoom = i.zoom t
      c.lookAt c._lookAt
      c.updateProjectionMatrix()
      return c
    return update
  .subscribe (update) ->
    emitter.emit 'tweenCamera', { update, duration: 500 }

# ------------------------------------------------------- Emitters
# ------------------------------------ Tween Sphere Volume
# emitter 'tweenSphereVolume'
#   .subscribe (sphere) ->
#     end = DEFAULT_OBJECT_VOLUME
#     i =
#       volume: d3.interpolate sphere._volume, end
#     tweenStream 500, 'sphere'
#       .map (t) ->
#         sphere._volume = i.volume t
#       .subscribe(
#         () -> emitter.emit 'sphereUpdate', sphere
#         (err) ->
#         (done) -> emitter.emit 'sphereAdded'
#       )

emitter 'tweenInSphere'
  .subscribe (sphere) ->
    currentGeom = sphere.geometry
    geomType = currentGeom.type
    params = currentGeom.parameters
    start = params.radius
    # end = DEFAULT_OBJECT_VOLUME
    console.log sphere._volume
    end = sphere._volume
    i =
      radius: d3.interpolate start, end
    tweenStream 500, 'sphere'
      .map (t) ->
        params.radius = i.radius t
        # Calling clone will use the new parameters, man
        newGeom = currentGeom.clone()
        sphere.geometry.dispose()
        sphere.geometry = newGeom
        return (model) -> model
      .subscribe(
        (update) -> emitter.emit 'modelUpdate', update
        (err) ->
        (done) -> emitter.emit 'sphereAdded'
      )

# ------------------------------------------------------- Functions
getMouseFrom = (node) ->
  (event) ->
    event.mouse = d3.mouse node
    return event

getNdcFromMouse = (event, ndc) ->
  event.ndc =
    x: ndc.x event.mouse[0]
    y: ndc.y event.mouse[1]
  return event

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
  selection.append 'div'
    .classed 'container', true
    .attr id: 'fileControls'
    .style
      position: 'absolute'
      left: 0
      top: '1%'
    .append('div').classed 'row', true
    .append('div').classed 'col-xs-12', true
      .style 'margin-top': '-12px'
    .append('div').classed 'btn-group file', true
    .call (group) ->
      btns = [
        '<i class="material-icons" style="display: block">volume_up</i>'
        '<i class="material-icons" style="display: block">save</i>'
        '<i class="material-icons" style="display: block">open_in_browser</i>'
      ]
      group.selectAll('button').data btns
        .enter().append 'button'
        .classed 'btn btn-lg btn-secondary', true
        .html (d) -> d
      
  selection.append('div')
    .classed 'container', true
    .attr id: 'sceneControls'
    .style
      position: 'absolute'
      right: '0'
      top: '1%'

getModeButtons = (sceneControls) ->
  butts = [
    { name: 'object', html: '<i class="material-icons" style="display: block">add</i>' }
  ]
  return sceneControls
    .append('div').classed 'row', true
    .append('div').classed 'col-xs-12', true
      .style 'margin-top': '-12px'
    .append('div').classed 'btn-group modes pull-right', true
    .call (group) ->
      group.selectAll('button').data butts
        .enter().append('button')
        .classed 'btn btn-lg btn-primary', true
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
    # { name: "camera", html: materialIcon '3d_rotation' }
    { name: "zoomOut", html: materialIcon 'zoom_out' }
    { name: "zoomIn", html: materialIcon 'zoom_in' }
  ]
  butts = cameraControls.selectAll("button").data(buttons)
  butts.enter().append("button")
    .classed("btn btn-secondary", true)
    .attr "id", (d) -> d.name
    .html (d) -> d.html ? d.name
  return cameraControls

materialIcon = (text) ->
  "<i class='material-icons' style='display: block'>#{text}</i>"

updateNdcDomain = (s) ->
  (d) ->
    d.x.domain [0, s.width]
    d.y.domain [0, s.height]
    return d

firstNdcScales = ->
  x: d3.scale.linear().range [-1, 1]
  y: d3.scale.linear().range [1, -1]

getRoomObject = (room) ->
  # geometry = new THREE.BoxGeometry room.width, room.height, room.length
  # material = new THREE.MeshBasicMaterial
  #   color: 0x00ff00, transparent: true, opacity: 0.1
  # roomObject = new THREE.Mesh( geometry, material );
  roomObject = new THREE.Object3D()
  roomObject.name = 'room'
  return roomObject

getInitialScene = (roomObject) ->
  # edges = new THREE.EdgesHelper roomObject, 0x00ff00
  mainObject = getMainObject()
  floor = getFloor()
  mainObject.add floor
  mainObject.add roomObject
  # mainObject.add edges
  scene = new THREE.Scene()
  scene.add mainObject
  return scene

getMainObject = ->
  mainObject = new THREE.Object3D()
  # floor = getFloor()
  # mainObject.add floor
  # axisHelper = new THREE.AxisHelper 5
  # mainObject.add axisHelper
  return mainObject

getFloor = ->
  FLOOR_SIZE = 100
  # FLOOR_GRID_COLOR = new THREE.Color 0.9, 0.9, 0.9
  FLOOR_GRID_COLOR = new THREE.Color 0, 0, 0
  floorGeom = new THREE.PlaneGeometry FLOOR_SIZE, FLOOR_SIZE

  # floorMat = new THREE.MeshBasicMaterial
  #   # color: (new THREE.Color(0.1,0.2,0.1)),
  #   side: THREE.DoubleSide,
  #   depthWrite: false
  #   # wireframe: true

  c = 0.46
  floorMat = new THREE.MeshPhongMaterial(
    color: (new THREE.Color c,c,c)
    side: THREE.DoubleSide
    depthWrite: false
  )
  e = 0.5
  floorMat.emissive = new THREE.Color e,e,e
  # floorMat.emissive = new THREE.Color 0, 0, 0
  floor = new THREE.Mesh floorGeom, floorMat
  floor.name = 'floor'
  floor.rotateX Math.PI/2
  floor.position.setY -ROOM_SIZE.height/2

  grid = new THREE.GridHelper FLOOR_SIZE/2, 2
  # grid.setColors FLOOR_GRID_COLOR, FLOOR_GRID_COLOR
  grid.rotateX Math.PI/2
  grid.material.transparent = true
  grid.material.opacity = 0.2
  grid.material.linewidth = 2
  grid.material.depthWrite = false
  floor.add grid

  return floor

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

firstModel = ->
  m = {}
  m.camera = getFirstCamera()
  m.room = getRoomObject ROOM_SIZE
  m.scene = getInitialScene m.room
  m.floor = m.scene.getObjectByName 'floor'

  # directional = new THREE.DirectionalLight 0xffffff, 0.95
  # directional.position.setY 100
  # directional.castShadow = true
  # directional.near = 0.1
  # f = 10
  # directional.shadowCameraLeft = -f
  # directional.shadowCameraRight = f
  # directional.shadowCameraTop = f
  # directional.shadowCameraBottom = -f
  # directional.shadowDarkness = 0.2
  # # directional.shadowCameraVisible = true

  # m.scene.add directional
  
  # ambient = new THREE.AmbientLight "#777"
  # m.scene.add ambient

  spotLight = new THREE.SpotLight 0xffffff, 0.95
  spotLight.position.setY 100
  spotLight.castShadow = true
  spotLight.shadowMapWidth = 4000
  spotLight.shadowMapHeight = 4000
  # spotLight.shadowBias = 0.0001
  spotLight.shadowDarkness = 0.2
  spotLight.intensity = 1
  spotLight.exponent = 1

  # spotLight.shadowCameraVisible = true
  m.scene.add spotLight

  m.floor.receiveShadow = true

  hemisphere = new THREE.HemisphereLight( 0, 0xffffff, 0.8 );
  m.scene.add hemisphere

  return m

firstDom = ->
  dom = {}
  dom.main = main = addMain d3.select 'body'
  dom.miniCube = dom.main.append("canvas")
    .attr 'id', 'miniCube'
    .style(
      position: 'absolute'
      bottom: '31px', right: '21px'
    )
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

# emitter 'addTrajectory'
#   .subscribe (object) ->
#     console.log object

emitter 'mockup'
  .withLatestFrom emitter('modelState'), (a,b) -> b
  .withLatestFrom dom
  .subscribe (arr) ->
    [model, dom] = arr
    console.info 'Start mockup.'
    # console.log model
    

    
    do ->
      p = new THREE.Vector3 4, 2, 16
      sphere = addObjectAtPoint p, 0.6
      
    big = do ->
      p = new THREE.Vector3 -3, 2.5, -4
      sphere = addObjectAtPoint p, 1.2
      
      addConeParentWithParams({
        _volume: 2
        _spread: 0.2
        _theta: degToRad -60
        _phi: degToRad 10
      })(sphere)
      
      addConeParentWithParams({
        _volume: 2
        _spread: 0.3
        _theta: degToRad -90
        _phi: degToRad -70
      })(sphere)
      
      addConeParentWithParams({
        _volume: 3
        _spread: 1.2
        _theta: degToRad 40
        _phi: degToRad 0
      })(sphere)
      
      addConeParentWithParams({
        _volume: 2
        _spread: 0.3
        _theta: degToRad -120
        _phi: degToRad -90
      })(sphere)
      
      return sphere
      
    isIpad = navigator.userAgent.match(/iPad/i) isnt null
    
    if (isIpad is true)
      highlightObject big
      
    
    do ->
      p = new THREE.Vector3 4, 4, -2
      sphere = addObjectAtPoint p
      
      [0,90,180,270].map (t) ->
        [0,90,180,270].map (p) ->
          addConeParentWithParams(
            _volume: 1.5
            _spread: 0.5
            _theta: degToRad t
            _phi: degToRad p
          )(sphere)
          
      _trajectory = do ->
        sampleClosedSpline = new THREE.ClosedSplineCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(2, 1, -2),
          new THREE.Vector3(2, -1, -2),
          new THREE.Vector3(3, 2, 3),
          new THREE.Vector3(3, -1, 6)
        ]);
        geometry = new THREE.TubeGeometry(
          sampleClosedSpline, 100, 0.05, 8, true
        );
        mat = new THREE.MeshPhongMaterial(
          color: 0x000000
          # shading: THREE.FlatShading
          transparent: true
          opacity: 0.5
          # side: THREE.DoubleSide
        )
        obj = new THREE.Mesh geometry, mat
        obj.castShadow = true
        return obj
  
      sphere.add _trajectory
      sphere.position.copy new THREE.Vector3 2, 4, -10
    
    _spoof = do ->
      p = new THREE.Vector3 -7, -0.5, 3
      sphere = addObjectAtPoint p, 0.7
      
      # lineGeom = new THREE.Geometry()
      # _lineBottom = -sphere.position.y + (-ROOM_SIZE.height/2)
      # lineGeom.vertices.push new THREE.Vector3 0, _lineBottom, 0
      # lineGeom.vertices.push new THREE.Vector3 0, 100, 0
      # lineGeom.computeLineDistances()
        
      addConeParentWithParams({
        _volume: 2
        _spread: 0.5
        _theta: 0
        _phi: Math.PI/2
      })(sphere)
      
      addConeParentWithParams({
        _volume: 1.2
        _spread: 0.7
        _theta: Math.PI * 0.3
        _phi: - Math.PI * 0.1
      })(sphere)
      
      _trajectory = do ->
        sampleClosedSpline = new THREE.ClosedSplineCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(4, -1, -4),
          new THREE.Vector3(9, 1, -4),
          new THREE.Vector3(4, 2, 4),
          new THREE.Vector3(-4, -1, 4)
        ]);
        geometry = new THREE.TubeGeometry(
          sampleClosedSpline, 100, 0.05, 8, true
        );
        mat = new THREE.MeshPhongMaterial(
          color: 0x000000
          # shading: THREE.FlatShading
          transparent: true
          opacity: 0.5
          # side: THREE.DoubleSide
        )
        obj = new THREE.Mesh geometry, mat
        obj.castShadow = true
        if (not isIpad)
          sampleClosedSpline.points.forEach (p) ->
            geometry = new THREE.SphereGeometry 0.2, 30, 30
            material = new THREE.MeshPhongMaterial(
              color: PARENT_SPHERE_COLOR
              transparent: true
              opacity: 0.5
            )
            controlPoint = new THREE.Mesh geometry, material
            controlPoint.castShadow = true
            controlPoint.receiveShadow = true
            controlPoint.name = 'parentSphere'
            controlPoint._volume = 0
            controlPoint.renderOrder = 10
            controlPoint.position.copy p
            obj.add controlPoint
          
        sphere.add obj
      
      # lineGeom = new THREE.Geometry()
      # _lineBottom = -sphere.position.y + (-ROOM_SIZE.height/2)
      # lineGeom.vertices.push new THREE.Vector3 0, _lineBottom, 0
      # lineGeom.vertices.push new THREE.Vector3 0, 100, 0
      # lineGeom.computeLineDistances()
      
      # s = 0.3
      # mat = new THREE.LineDashedMaterial
      #   color: 0, linewidth: 1, dashSize: s, gapSize: s,
      #   transparent: true, opacity: 0.2
        
      # line = new THREE.Line(lineGeom, mat)
  
      # sphere.add line
      
      return sphere
    
    coneParent = _spoof.children[1]
    
    isIpad = navigator.userAgent.match(/iPad/i) isnt null
    
    if (not isIpad)
      highlightObject coneParent.getObjectByName 'cone'
      
    if (isIpad is true)
      _spoof = big
    
    
    wid = dom.sceneControls.node().clientWidth * 0.6
    
    
    
    # console.info "isipad", isIpad
    
    if (not isIpad)
      (
        port = dom.sceneControls
          .append('div')
          .classed 'card', true
          .style 'height', "#{wid}px"
        _canv = port.append "canvas"
        _rend = new THREE.WebGLRenderer(
          canvas: _canv.node()
          antialias: true
        )
        _rend.setClearColor 'white'
        _scene = new THREE.Scene()
        _rend.setSize port.node().clientWidth, port.node().clientHeight
        cloned = _spoof.clone()
        spotLight = new THREE.SpotLight 0xffffff, 0.95
        spotLight.position.setY 100
        spotLight.castShadow = true
        spotLight.shadowMapWidth = 4000
        spotLight.shadowMapHeight = 4000
        spotLight.shadowDarkness = 0.001
        hemisphere = new THREE.HemisphereLight( 0, 0xffffff, 0.8 );
        _scene.add hemisphere
        _scene.add spotLight
        c = new THREE.OrthographicCamera()
        c.zoom = INITIAL_ZOOM * 1.5
        c._lookAt = new THREE.Vector3()
        c.position._polar =
          radius: CAMERA_RADIUS
          theta: degToRad INITIAL_THETA
          phi: degToRad INITIAL_PHI
        c.position._relative = polarToVector c.position._polar
        c.position.addVectors c.position._relative, c._lookAt
        c.lookAt cloned.position
        c.up.copy new THREE.Vector3 0, 1, 0
        s = { width: port.node().clientWidth, height: port.node().clientHeight }
        [ c.left, c.right ] = [-1, 1].map (d) -> d * s.width/2
        [ c.bottom, c.top ] = [-1, 1].map (d) -> d * s.height/2
        c.updateProjectionMatrix()
        camera = c
        _scene.add cloned
        i = 0
        d3.timer ->
          i++
          sc = new THREE.Scene()
          sc.add spotLight
          cloned = _spoof.clone()
          cloned.remove( cloned.children[0] )
          cloned.remove( cloned.children[2] )
          cloned.rotateY degToRad 45
          sc.add cloned
          _rend.render sc, camera
          if i is 40
            return true
          return false
      )
    
    # port = dom.sceneControls
    #   .append('div')
    #   .classed 'card', true
    #   .style 'height', "#{wid}px"
    # _canv = port.append "canvas"
    # _rend = new THREE.WebGLRenderer(
    #   canvas: _canv.node()
    #   antialias: true
    # )
    # _rend.setClearColor 'white'
    # _scene = new THREE.Scene()
    # _rend.setSize port.node().clientWidth, port.node().clientHeight
    # cloned = _spoof.clone()
    # spotLight = new THREE.SpotLight 0xffffff, 0.95
    # spotLight.position.setY 100
    # spotLight.castShadow = true
    # spotLight.shadowMapWidth = 4000
    # spotLight.shadowMapHeight = 4000
    # spotLight.shadowDarkness = 0.001
    # hemisphere = new THREE.HemisphereLight( 0, 0xffffff, 0.8 );
    # _scene.add hemisphere
    # _scene.add spotLight
    # c = new THREE.OrthographicCamera()
    # c.zoom = INITIAL_ZOOM * 1.5
    # c._lookAt = new THREE.Vector3()
    # c.position._polar =
    #   radius: CAMERA_RADIUS
    #   theta: degToRad INITIAL_THETA
    #   phi: degToRad INITIAL_PHI
    # c.position._relative = polarToVector c.position._polar
    # c.position.addVectors c.position._relative, c._lookAt
    # c.lookAt cloned.position
    # c.up.copy new THREE.Vector3 0, 1, 0
    # s = { width: port.node().clientWidth, height: port.node().clientHeight }
    # [ c.left, c.right ] = [-1, 1].map (d) -> d * s.width/2
    # [ c.bottom, c.top ] = [-1, 1].map (d) -> d * s.height/2
    # c.updateProjectionMatrix()
    # camera = c
    # _scene.add cloned
    # i = 0
    # d3.timer ->
    #   i++
    #   sc = new THREE.Scene()
    #   sc.add spotLight
    #   cloned = _spoof.clone()
    #   cloned.remove( cloned.children[0] )
    #   cloned.remove( cloned.children[2] )
    #   cloned.rotateY degToRad 45
    #   sc.add cloned
    #   _rend.render sc, camera
    #   if i is 40
    #     return true
    #   return false
      
    dom.sceneControls
      .append('div')
      .classed 'card', true
      .call (card) ->
        card.append('div').classed('card-block', true)
          .attr 'id', 'cone-card'
          .style
            'border-top': 'none'
          .call (block) ->
            block.append('h6')
              .classed('card-title', true)
              .text('Cone 1.2')
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'File'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .append('span')
                  .text('cone.wav')
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Volume'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .append('span')
                  .text("#{coneParent._volume} dB")
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Spread'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .append('span')
                  .append('span').text(coneParent._spread)
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Pitch'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .append('span')
                  .append('span').text (degToRad.invert coneParent._phi) + "°"
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-6', true
                  .append 'span'
                  .classed 'value', true
                  .text 'Delete'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Yaw'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .append('span').text (degToRad.invert coneParent._theta) + "°"
        card.append('div').classed('card-block', true)
          .attr 'id', 'object-card'
          .call (block) ->
            block.append('h6').classed('card-title', true)
              .text -> if isIpad then 'Object 2' else 'Object 1'
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'File'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text 'None'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Volume'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text "95%"
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'x'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text "#{_spoof.position.x} m"
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Cones'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text -> if isIpad then 4 else 2
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'y'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text "#{_spoof.position.y} m"
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Pitch'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text "#{degToRad.invert(_spoof.rotation.x)}°"
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'z'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text "#{_spoof.position.z} m"
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Yaw'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text "#{degToRad.invert(_spoof.rotation.z)}°"
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'value', true
                  .text 'Delete'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'value', true
                  .text 'Duplicate'
                row.append 'div'
                  .classed 'col-xs-6', true
                  .append('span')
                  .classed 'value', true
                  .attr 'id', 'add-trajectory'
                  .style(
                    'border-bottom': 'none'
                    # color: "#333"
                    opacity: 0.4
                  )
                  .text('Add Trajectory')
        card.append('div').classed('card-block', true)
          .attr 'id', 'trajectory-card'
          .call (block) ->
            block.append('h6').classed('card-title', true)
              .text('Trajectory')
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Speed'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text '0.5 m/s'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'value', true
                  .text 'Pause'
            block.append('div')
              .classed 'row parameter', true
              .call (row) ->
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'key', true
                  .text 'Resolution'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed('value', true)
                  .text '4'
                row.append 'div'
                  .classed 'col-xs-3', true
                  .append 'span'
                  .classed 'value', true
                  .text 'Delete'
                   
    if (isIpad is true)
      d3.select('#trajectory-card').remove()
      d3.select('#cone-card').remove()
      d3.select('#object-card').style 'border', 'none'
      d3.select('#add-trajectory')
        .style
          'border-bottom': '1px dotted #333'
          opacity: 1
        

    _room = do ->
      w = ROOM_SIZE.width
      l = ROOM_SIZE.length
      geom = new THREE.PlaneGeometry w, l
      mat = new THREE.LineBasicMaterial({
        color: "#000"
        depthWrite: false
        side: THREE.DoubleSide
        transparent: true
        opacity: 0.05
      })
      obj = new THREE.Mesh geom, mat
      obj.rotateX Math.PI/2
      obj.position.setY -ROOM_SIZE.height/2
      obj.receiveShadow = true
      obj.updateMatrixWorld()
      return obj
      # line = new THREE.EdgesHelper obj, 0
      # line.material.linewidth = 5
      # line.material.transparent = true
      # line.material.opacity = 0.3
      # line.receiveShadow = true
      # return line

    model.scene.add _room

    _zone = do ->
      curve = new THREE.ClosedSplineCurve3([
        new THREE.Vector2 5, -2
        new THREE.Vector2 8, 6
        new THREE.Vector2 1, 3
        new THREE.Vector2 -2, 7
        new THREE.Vector2 -5, 0
        new THREE.Vector2 -2, -2
      ]);
      
      shape = new THREE.Shape()
      shape.fromPoints curve.getPoints 50
      
      geometry = new THREE.ShapeGeometry shape
      
      material = new THREE.MeshPhongMaterial(
        color: 0xff0000
        # shading: THREE.FlatShading
        transparent: true
        opacity: 0.2
        side: THREE.DoubleSide
        depthWrite: false
      )
      obj = new THREE.Mesh geometry, material
      obj.rotateX Math.PI/2
      
      # if (isIpad is true)
        # obj.rotateY Math.PI * 1.2
        # obj.position.z += 3
        
      obj.position.setY -ROOM_SIZE.height/2
      return obj

    model.scene.add _zone
    
    do ->
      curve = new THREE.ClosedSplineCurve3([
        new THREE.Vector2 0, 0
        new THREE.Vector2 0, 2
        new THREE.Vector2 2, 6
        new THREE.Vector2 5, 0
      ]);
      
      shape = new THREE.Shape()
      shape.fromPoints curve.getPoints 50
      
      geometry = new THREE.ShapeGeometry shape
      
      material = new THREE.MeshPhongMaterial(
        color: 0xff0000
        # shading: THREE.FlatShading
        transparent: true
        opacity: 0.2
        side: THREE.DoubleSide
        depthWrite: false
      )
      obj = new THREE.Mesh geometry, material
      obj.rotateX Math.PI/2
      obj.position.setY -ROOM_SIZE.height/2
      obj.position.setX -4
      obj.position.setZ -4
      obj.rotateZ degToRad 45
      
      if (not isIpad)
        model.scene.add obj

    do ->
      geometry = new THREE.SphereGeometry 0.5, 30, 30

      material = new THREE.MeshPhongMaterial(
        # color: PARENT_SPHERE_COLOR
        color: new THREE.Color "#00ffcc"
        transparent: true
        opacity: 0.5
        # wireframe: true
        # shading: THREE.FlatShading
        # side: THREE.DoubleSide
      )
    
      sphere = new THREE.Mesh geometry, material
      sphere.castShadow = true
      sphere.receiveShadow = true
      sphere.name = 'parentSphere'
      sphere._volume = 0
      sphere.renderOrder = 10
      
      _neck = new THREE.CylinderGeometry(0.2, 0.2, 0.5)
      neck = new THREE.Mesh _neck, material
      neck.position.y = -0.7
      neck.castShadow = true
      
      sphere.add neck
      
      _nose = new THREE.TetrahedronGeometry(0.3)
      # _nose = new THREE.CylinderGeometry(0.2, 0.2, 0.5)
      nose = new THREE.Mesh _nose, material
      nose.castShadow = true
      # nose.rotateX degToRad 90
      # nose.rotateZ degToRad 90
      # nose.position.setX -0.7
      nose.rotateY degToRad 0
      nose.rotateZ degToRad -45
      nose.rotateX degToRad -45
      nose.rotateX degToRad 90
      nose.position.setX -0.5
      
      # sphere = new THREE.Object3D()
      sphere.add nose
      
      isIpad = navigator.userAgent.match(/iPad/i) isnt null
      
      if (not isIpad)
        sphere.position.copy new THREE.Vector3 5, 2, 1
        sphere.rotateY degToRad 90
        
        
      if isIpad is true
        (
          sphere.position.copy new THREE.Vector3 0, 2, -4
          sphere.rotateY degToRad -50
        )
      
      sphere.scale = 0.5
      
      model.scene.add sphere

    emitter.emit 'modelUpdate', (m) -> m

    isIpad = navigator.userAgent.match(/iPad/i) isnt null
    
    if (not isIpad)
    # if (true)
      canvas = dom.miniCube.node()
      ss = 100
      __camera = new THREE.PerspectiveCamera( 75, ss/ss, 0.1, 1000 );
      __camera.position.z = 2;
      __renderer = new THREE.WebGLRenderer(
        canvas: canvas
        antialias: true
        alpha: true
      );
      __renderer.setSize( ss, ss );
      __geometry = new THREE.BoxGeometry( 1, 1, 1 );
      __material = new THREE.MeshBasicMaterial( { color: 0, wireframe: true } );
      __cube = new THREE.Mesh( __geometry, __material );
      __cube.updateMatrix()
      lines = new THREE.EdgesHelper __cube, 0
      lines.matrixAutoUpdate = true
      little = new THREE.Object3D()
      little.add lines
      x = 0.3
      grid = new THREE.GridHelper x*2 + 0.31, x
      grid.rotateZ degToRad 90
      little.add grid
      offsetZ = 0.1
      __scene = new THREE.Scene()
      __scene.add little
      foo = () ->
        requestAnimationFrame foo
        little.rotation.y = -model.camera.position._polar.theta
        little.rotation.z = model.camera.position._polar.phi
        little.rotation.x = 0.5
        __renderer.render __scene, __camera
      foo()
      
    dom.main.append 'div'
      .attr 'id', 'mode-text'
      .style(
        position: 'absolute'
        'font-size': '0.6rem'
        right: '128px'
        bottom: '65px'
      )
      .append 'span'
      .style(
        'border-bottom': '1px dotted #333'
        'font-size': '0.8rem'
      )
      .text 'Altitude Mode'
    
    if (isIpad is true)  
      dom.main.select '.cameraControls'
        .remove()
        
      d3.select('#mode-text')
        .style
          right: '10px'
          bottom: '10px'
        .select 'span'
        .text 'Lateral Mode'
      
      dom.main.select '#sceneControls'
        .style 'width', '35vw'
        
      d3.selectAll('.parameter span')
        .style 'font-size', '0.8rem'
        
      d3.selectAll('.row.parameter')
        .style 'line-height', '2'
		  
	console.log 'test'
		



emitter.emit 'start'
emitter.emit 'mockup'