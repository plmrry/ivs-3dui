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
  width: 15
  length: 10
  height: 3
  
DEFAULT_OBJECT_VOLUME = ROOM_SIZE.width * 0.1
DEFAULT_CONE_SPREAD = 0.3
MAX_CONE_SPREAD = 2
MAX_CONE_VOLUME = 2
CONE_TOP = 0.01

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
    first = new THREE.WebGLRenderer canvas: dom.canvas
    first.shadowMapEnabled = true
    first.shadowMapType = THREE.PCFSoftShadowMap
    # first.setClearColor 'white'
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
    emitter.emit 'selectObject', i.room[0].object
    
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
      return model
  .subscribe (update) ->
    emitter.emit 'modelUpdate', update
    
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
    # geometry = new THREE.SphereGeometry 0.1, 30, 30
    # # material = new THREE.MeshBasicMaterial(
    # #   color: PARENT_SPHERE_COLOR, 
    # #   # wireframe: true
    # # )
    # material = new THREE.MeshPhongMaterial(
    #   color: PARENT_SPHERE_COLOR
    #   transparent: true
    #   opacity: 0.5
    #   # wireframe: true
    #   shading: THREE.FlatShading
    # )
    
    # sphere = new THREE.Mesh geometry, material
    # sphere.castShadow = true
    # sphere.name = 'parentSphere'
    # sphere._volume = 0
    # # object = new THREE.Object3D()
    # # object.add sphere
    # object = sphere
    # y = DEFAULT_OBJECT_HEIGHT
    # object.position.set p.x, y, p.z
    # update = (model) ->
    #   i = model.room.children.length
    #   object.name = "object#{i}"
    #   model.room.add object
    #   return model
    # emitter.emit 'modelUpdate', update
    # emitter.emit 'tweenInSphere', sphere
    # # emitter.emit 'tweenSphereVolume', sphere
    # emitter.emit 'objectAdded', object
    
addObjectAtPoint = (p) ->
  geometry = new THREE.SphereGeometry 0.1, 30, 30
  # material = new THREE.MeshBasicMaterial(
  #   color: PARENT_SPHERE_COLOR, 
  #   # wireframe: true
  # )
  material = new THREE.MeshPhongMaterial(
    color: PARENT_SPHERE_COLOR
    transparent: true
    opacity: 0.3
    # wireframe: true
    shading: THREE.FlatShading
  )
  
  sphere = new THREE.Mesh geometry, material
  sphere.castShadow = true
  sphere.name = 'parentSphere'
  sphere._volume = 0
  # object = new THREE.Object3D()
  # object.add sphere
  object = sphere
  # y = DEFAULT_OBJECT_HEIGHT
  y = 1
  object.position.set p.x, y, p.z
  update = (model) ->
    i = model.room.children.length
    object.name = "object#{i}"
    model.room.add object
    return model
  emitter.emit 'modelUpdate', update
  emitter.emit 'tweenInSphere', sphere
  # emitter.emit 'tweenSphereVolume', sphere
  emitter.emit 'objectAdded', object
  return object
    
emitter 'objectAdded'
  .subscribe (o) ->
    emitter.emit 'selectObject', o
    # emitter.emit 'editSelected'
    
# ------------------------------------------------------- Emitters 
# ------------------------------------ Object Selected
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
    
emitter 'addCone'
  .subscribe (obj) ->
    i = obj.children.length
    coneParent = new THREE.Object3D()
    coneParent._theta = 0
    coneParent._phi = 0
    coneParent._volume = DEFAULT_OBJECT_VOLUME
    coneParent._spread = DEFAULT_CONE_SPREAD
    coneParent.rotateX Math.random() * (Math.PI * 2)
    coneParent.rotateZ Math.random() * (Math.PI * 2)
    obj.add coneParent
    top = CONE_TOP
    # bottom = DEFAULT_CONE_SPREAD 
    s = DEFAULT_CONE_SPREAD 
    bottom = d3.random.normal(s, 0.08)()
    # bottom = MAX_CONE_SPREAD * Math.random()
    # height = DEFAULT_OBJECT_VOLUME
    h = DEFAULT_OBJECT_VOLUME
    height = d3.random.normal(h, 0.2)()
    # height = MAX_CONE_VOLUME * Math.random()
    geometry = new THREE.CylinderGeometry top, bottom, height
    geometry.parameters.openEnded = true
    geometry = geometry.clone()
    # geometry.
    # geometry = new THREE.CylinderGeometry CONE_TOP
    # material = new THREE.MeshBasicMaterial
    #   color: 0xff0000
    material = new THREE.MeshPhongMaterial(
      color: 0xff0000
      shading: THREE.FlatShading
      side: THREE.DoubleSide
    )
    # material = new THREE.MeshPhongMaterial(
    #   color: new THREE.Color 0, 0, 0
    #   transparent: true
    #   opacity: 0.4
    #   # wireframe: true
    #   shading: THREE.FlatShading
    # )
    
    cone = new THREE.Mesh geometry, material
    cone.position.y = -cone.geometry.parameters.height/2
    coneParent.add cone
    emitter.emit 'modelUpdate', (m) -> m
    emitter.emit 'coneAdded', coneParent
    
window.emitter = emitter
  # obj = addObjectAtPoint new THREE.Vector3()
  
# dom.subscribe (d) -> 
#   hammertime = new Hammer(d.canvas);
#   hammertime.on 'pinchin', (ev) ->
#     alert('pinch') 
  
    
# addCone = dom
#   .flatMap (dom) ->
#     node = dom.sceneControls.select('add-cone').node()
#     return stream.fromEvent node, 'click'
#   .subscribe -> console.log 'add cone'

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
        # console.log 'added cone controls'
        # emitter.emit 'domAdded', dom
      #   butts = [{ name: 'add-file', html: 'add file' }]
      #   card.append('div').classed('card-block', true)
      #     .append('div').classed('btn-group', true)
      #     .selectAll('button').data(butts)
      #     .enter().append('button')
      #     .classed('btn btn-secondary', true)
      #     .attr { id: (d) -> d.name }
      #     .html (d) -> d.html
      #     .data data # re-set button data to object
    # objectControls.select '.card-title'
    #   .text (d) -> d.name
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
        # butts = [{ name: 'add-cone', html: 'add cone' }]
        # card.append('div').classed('card-block', true)
        #   .append('div').classed('btn-group', true)
        #   .selectAll('button').data(butts)
        #   .enter().append('button')
        #   .classed('btn btn-secondary', true)
        #   .attr { id: (d) -> d.name }
        #   .html (d) -> d.html
        #   .data data # re-set button data to THREE Object
    # objectControls.select '.card-title'
    #   .text (d) -> d.name
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
    end = DEFAULT_OBJECT_VOLUME
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
  FLOOR_GRID_COLOR = new THREE.Color 0.9, 0.9, 0.9
  floorGeom = new THREE.PlaneGeometry FLOOR_SIZE, FLOOR_SIZE
  floorMat = new THREE.MeshBasicMaterial
    # color: (new THREE.Color(0.1,0.2,0.1)), 
    side: THREE.DoubleSide, 
    depthWrite: false
    # wireframe: true
  floorMat = new THREE.MeshPhongMaterial(
    # color: (new THREE.Color(0.1,0.2,0.1))
    side: THREE.DoubleSide
  )
  floor = new THREE.Mesh floorGeom, floorMat 
  floor.name = 'floor'
  floor.rotateX Math.PI/2
  floor.position.setY -ROOM_SIZE.height/2
  
  # grid = new THREE.GridHelper FLOOR_SIZE/2, 2
  # grid.setColors FLOOR_GRID_COLOR, FLOOR_GRID_COLOR
  # grid.rotateX Math.PI/2
  # grid.material.depthWrite = false
  # floor.add grid
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
  
  # light = new THREE.PointLight 0xffffff
  # light = new THREE.DirectionalLight 0xffffff, 0.5
  spotLight = light = new THREE.SpotLight 0xffffff, 1
  light.position.setY 50
  light.castShadow = true
  
  spotLight.shadowMapWidth = 2000;
  spotLight.shadowMapHeight = 2000;
  # # spotLight.shadowCameraNear = 30;
  # spotLight.shadowCameraFar = 200;
  # spotLight.exponent = 2
  # spotLight.shadowCameraFov = 30;
  
  spotLight.shadowBias = 0.0001;
  spotLight.shadowDarkness = 0.2;
  
  # light.shadowCameraVisible = true
  m.scene.add light
  
  m.floor.receiveShadow = true
  
  hemisphere = new THREE.HemisphereLight( 0, 0xffffff, 0.8 );
  m.scene.add hemisphere
  
  return m
  
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