
setTimeout (-> do go), 0

go = ->
  do startRenderLoop
  #socket.on 'new packets', newData
  dispatch.on 'render.draw', ->
    renderer.render scene, camera
  d3.select(window).on 'resize', onResize
  do onResize
  d3.select('canvas').on 'click', onClick()

dispatch = d3.dispatch 'render'

gridHelper = new THREE.GridHelper(10, 1)
axisHelper = new THREE.AxisHelper( 100 )

mainObject = new THREE.Object3D()
mainObject.add gridHelper
mainObject.add axisHelper

camera = new THREE.PerspectiveCamera()
camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10e3)
initialPosition = new THREE.Vector3 100, 100, 1500
camera.position.copy initialPosition
center = new THREE.Vector3()
camera.lookAt center

scene = new THREE.Scene()
scene.add mainObject

renderer = new THREE.WebGLRenderer()
renderer.setPixelRatio window.devicePixelRatio
renderer.setClearColor "white"

main = d3.select('body').append('main')

addCone = ->
  coneParent = new THREE.Object3D()
  coneParent.name = 'coneParent'
  mainObject.add coneParent
  d3.select('input#z').property 'value', coneParent.rotation.z
  d3.select('input#y').property 'value', coneParent.rotation.y
  height = 500
  geometry = new THREE.CylinderGeometry 1, 100, height
  material = new THREE.MeshBasicMaterial
    color: 0x0000ff, wireframe: true
  cone = new THREE.Mesh geometry, material
  cone.name = 'cone'
  cone.position.y = -cone.geometry.parameters.height/2
  d3.select('input#height').property 'value', cone.geometry.parameters.height
  d3.select('input#radius').property 'value', cone.geometry.parameters.radiusBottom
  coneParent.add cone

buttons = [
  { name: "up", func: -> tempMoveTo ((r) -> new THREE.Vector3(0, r, 1)), "add" }
  { name: "down", func: -> tempMoveTo (r) -> initialPosition }
  { name: "addCone", func: -> addCone() }
]

controls = main.append("div").classed("controls", true)
butts = controls.selectAll("button").data(buttons)
butts.enter().append("button").classed("btn btn-secondary", true)
  .text (d) -> d.name
  .on "click", (d) -> do d.func

setY = ->
  cone = mainObject.getObjectByName 'coneParent'
  if cone
    cone.rotation.y = this.value

setZ = ->
  cone = mainObject.getObjectByName 'coneParent'
  if cone
    cone.rotation.z = this.value

setHeight = ->
  cone = mainObject.getObjectByName 'cone'
  currentGeom = cone.geometry
  p = currentGeom.parameters
  newHeight = this.value
  newGeom = new THREE.CylinderGeometry(
    p.radiusTop,
    p.radiusBottom,
    newHeight
  )
  cone.geometry.dispose()
  cone.geometry = newGeom
  cone.position.y = -cone.geometry.parameters.height/2
  return true

setRadius = ->
  cone = mainObject.getObjectByName 'cone'
  currentGeom = cone.geometry
  p = currentGeom.parameters
  newRadius = this.value
  newGeom = new THREE.CylinderGeometry(
    p.radiusTop,
    newRadius,
    p.height
  )
  cone.geometry.dispose()
  cone.geometry = newGeom
  return true


addSlider = (container, func, id, min, max, step) ->
  container.append('label').text id
  return container.append 'input'
    .attr
      type: "range", id: id
      min: min, max: max
      step: step
    .on 'change', func
    .on 'mousedown', ->
      that = d3.select this
      that.on 'mousemove', func
      that.on 'mouseup', ->
        that.on 'mousemove', null

addSlider controls, setZ, 'z', 0, Math.PI, 0.01
addSlider controls, setY, 'y', 0, Math.PI * 2, 0.01
addSlider controls, setHeight, 'height', 1, 800, 1
addSlider controls, setRadius, 'radius', 1, 1000, 1

canvasContainer = main.append("div").classed("vis", true)
canvasContainer.append -> renderer.domElement

getLatitude = (position, radius) -> Math.acos position.y / radius

tempMoveTo = (targetFunc, newMode) ->
  current = camera.position
  middle = new THREE.Vector3()
  radius = current.distanceTo middle
  #target = new THREE.Vector3 0, radius, 1
  target = targetFunc radius

  transitionCamera current, target, middle
    .then ->
      console.log "camera done moving"
      d3.select('canvas').on 'click', onClick("add")

transitionCamera = (current, target, lookAt) ->
  i = {}
  [ 'x', 'y', 'z' ].forEach (key) ->
    i[key] = d3.interpolate current[key], target[key]

  return new Promise (resolve) ->
    d3.transition()
      .duration 1000
      .tween "moveCamera", ->
        return (t) ->
          #camera.lookAt lookAt
          [ 'x', 'y', 'z' ].forEach (key) ->
            camera.position[key] = i[key] t
          camera.lookAt lookAt
      .each "end", resolve

startRenderLoop = ->
  render = ->
    requestAnimationFrame render
    dispatch.render()
  render()

box = new THREE.BoxGeometry 100, 100, 100
material = new THREE.MeshBasicMaterial color: 0x000000
material.transparent = true
material.opacity = 0
room = new THREE.Mesh box, material
room.name = "room"
mainObject.add room
bounding = new THREE.BoxHelper room
mainObject.add bounding

raycaster = new THREE.Raycaster()

_x = d3.scale.linear().range [-1, 1]
_y = d3.scale.linear().range [1, -1]

MODE = undefined

onClick = (mode) ->
  return ->
    console.log mode
    return if not mode
    canvas = this
    size = getSizeFrom canvas
    _x.domain [0, size.width]
    _y.domain [0, size.height]
    mouse = {}
    [ x, y ] = d3.mouse canvas
    [ mouse.x, mouse.y ] = [ _x(x), _y(y) ]
    raycaster.setFromCamera mouse, camera
    intersection = raycaster.intersectObject(room)[0]
    console.log intersection
    addSphere(intersection.point)

addSphere = (point) ->
  sphere = new THREE.SphereGeometry()
  material = new THREE.MeshBasicMaterial()
  object = new THREE.Mesh( sphere, material )
  object.position.x = point.x
  object.position.z = point.z
  edges = new THREE.EdgesHelper( object, 0x00ff00 )
  room.add object
  room.add edges


onMouseMove = () ->
  d3.event.preventDefault()
  canvas = d3.select('canvas').node()
  size = getSizeFrom canvas
  _x.domain [0, size.width]
  _y.domain [0, size.height]
  mouse = {}
  [ x, y ] = d3.mouse canvas
  [ mouse.x, mouse.y ] = [ _x(x), _y(y) ]
  #console.log mouse
  raycaster.setFromCamera mouse, camera

  raycaster.intersectObjects(scene.children, true).forEach (intersection) ->
    console.log intersection.point

onResize = ->
  #size = do getWindowSize
  #size = getSizeFrom canvasContainer.node()
  size = getSizeFrom main.node()
  size.height *= 0.8
  size.x = size.width
  size.y = size.height
  size.z = size.width # I dunno

  box = new THREE.BoxGeometry size.x, size.y, size.z
  room.geometry = box
  mainObject.remove bounding
  bounding = new THREE.BoxHelper room
  mainObject.add bounding

  #setScaleRanges size
  camera.aspect = size.width / size.height

  camera.left = 1.5 * size.width / -2
  camera.right = 1.5 * size.width / 2
  camera.top = 1.5 * size.height / 2
  camera.bottom = 1.5 * size.height / -2
  camera.updateProjectionMatrix()

  renderer.setSize size.width, size.height
  mainObject.remove gridHelper
  gridHelper = new THREE.GridHelper size.width/2, 100
  mainObject.add gridHelper

setScaleRanges = (size) ->
  scale.x.range [-size.x/2, size.x/2]
  scale.y.range [-size.y/2, size.y/2]
  scale.z.range [0, size.z]

getSizeFrom = (element) ->
  size =
    width: element.clientWidth
    height: element.clientHeight
  return size

getWindowSize = ->
  size =
    width: window.innerWidth
    height: window.innerHeight
  size.x = size.width
  size.y = size.height
  size.z = size.width # I dunno
  return size

# This is how three.js updates geometry in the geometry browser
# function updateGroupGeometry( mesh, geometry ) {
# 	mesh.children[0].geometry.dispose();
# 	mesh.children[1].geometry.dispose();
# 	mesh.children[0].geometry = new THREE.WireframeGeometry( geometry );
# 	mesh.children[1].geometry = geometry;
# 	//these do not update nicely together if shared
# }
