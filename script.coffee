MIN_PHI = 0.01
MAX_PHI = Math.PI * 0.5

stream = Rx.Observable

# phi = latitude
# theta = longitude

degToRad = d3.scale.linear()
  .domain [0, 360]
  .range [0, 2*Math.PI]

polarToVector = (o) ->
  { radius, theta, phi } = o
  x = radius * Math.cos(theta) * Math.sin(phi)
  y = radius * Math.sin(theta) * Math.sin(phi)
  z = radius * Math.cos(phi)
  return new THREE.Vector3 y, z, x

vectorToPolar = (vector) ->
  radius = vector.length()
  _x = vector.z
  _y = vector.x
  _z = vector.y
  phi = Math.acos _z/radius
  theta	= Math.atan _y/_x
  return { radius, theta, phi }

room =
  width: 15
  length: 10
  height: 3

main = d3.select('body').append('main')
canvasContainer = main.append("div")
  .classed("vis", true)
  .style
    width: "100%"
    height: "80vh"

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

buttons = [
  { name: "up" }
  { name: "down"  }
  { name: "camera" }
  { name: "zoomIn" }
  { name: "zoomOut" }
]

controls = main.append("div").classed("controls", true)
butts = controls.selectAll("button").data(buttons)
butts.enter().append("button")
  .classed("btn btn-secondary", true)
  .attr "id", (d) -> d.name
  .text (d) -> d.name

getClientSize = (element) ->
  width: element.clientWidth
  height: element.clientHeight

# ---------------------------------------------- streams

animation = Rx.Observable.create (observer) ->
  d3.timer -> observer.onNext()
.timestamp()

resize = Rx.Observable.fromEvent window, 'resize'
  .startWith target: window
  .map (e) -> e.target
  .map -> getClientSize canvasContainer.node()

renderer = do ->
  firstRenderer = new THREE.WebGLRenderer()
  firstRenderer.setPixelRatio window.devicePixelRatio
  firstRenderer.setClearColor "white"
  updateRenderer = (renderer, r) ->
    renderer.setSize r.width, r.height
    return renderer
  return resize.scan updateRenderer, firstRenderer

renderer.first().subscribe (renderer) ->
  canvasContainer.append -> renderer.domElement

tweenUpdateStream = (duration) ->
  tweenStream(duration).map (time) ->
    (cam) -> cam._update(time)(cam)

up = Rx.Observable.fromEvent d3.select('#up').node(), 'click'
  .flatMap ->
    Rx.Observable.just (cam) ->
      end = new THREE.Vector3 0, cam.position.y, 0
      cam._interpolator =
        position: d3.interpolate cam.position, end
        up: d3.interpolate cam.up, new THREE.Vector3(0, 0, -1)
      cam._update = (t) -> (c) ->
        c.position.copy c._interpolator.position t
        c.up.copy c._interpolator.up t
        c.lookAt new THREE.Vector3()
        return c
      return cam
    .concat tweenUpdateStream(1000)

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

zoomIn = Rx.Observable.fromEvent d3.select('#zoomIn').node(), 'click'
  .map -> return -100
  .map (dr) ->
    (camera) ->
      polar = camera.position._polar
      polar.radius += dr
      camera.position.copy polarToVector polar
      camera

zoomIn.subscribe -> console.log 'zoom'


# NOTE: See http://mathworld.wolfram.com/SphericalCoordinates.html
# phi = latitude
# theta = longitude
radius = 1000
theta = degToRad 80 # longitude
phi = degToRad 45 # 90 - latitude

initialCamera = (c) ->
  width = height = 20
  [ c.left, c.right ] = [-1, 1].map (d) -> d * width/2
  [ c.bottom, c.top ] = [-1, 1].map (d) -> d * height/2
  c.position._polar = { radius, theta, phi }
  c.position.copy polarToVector c.position._polar
  c.lookAt new THREE.Vector3()
  c.up.copy new THREE.Vector3 0, 1, 0
  c.updateProjectionMatrix()
  return c

# This is an event stream that spits out (camera) => camera functions
cameraUpdates = stream.merge up, cameraPosition, zoomIn
  .startWith initialCamera

# Scan over the camera update functions
apply = (last, func) -> func last
camera = cameraUpdates
  .scan apply, new THREE.OrthographicCamera()
  .share()

tweenStream = (duration) ->
  duration = duration or 0
  Rx.Observable.create (observer) ->
    d3.transition()
      .duration duration
      .tween "tween", -> (t) -> observer.onNext t
      .each "end", -> observer.onCompleted()

animation.withLatestFrom renderer, camera
  .subscribe (arr) ->
    [time, renderer, camera] = arr
    renderer.render scene, camera

isAbove = camera
  .map (c) -> c.position._polar.phi is MIN_PHI
  .subscribe (a) -> console.log a
