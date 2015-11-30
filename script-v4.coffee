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
DEFAULT_OBJECT_VOLUME = 0.1
DEFAULT_CONE_SPREAD = 0.3
MAX_CONE_SPREAD = 2
MAX_CONE_VOLUME = 2
CONE_TOP = 0.01

emitter = do ->
  subject = new Rx.Subject()
  _emitter = (e) ->
    return subject.filter((o) -> o.event is e).pluck 'data'
  _emitter.emit = (event, data) -> subject.onNext { event, data }
  return _emitter

emitter 'start'
  .flatMap ->
    stream.just firstDom()
  .subscribe (dom) ->
    emitter.emit 'dom', dom

stream.fromEvent window, 'resize'
  .startWith 'first resize'


addMain = (selection) ->
  selection.append 'div'
    # .classed 'container-fluid', true
    .style
      # height: '100vh',
      border: '5px solid red'

firstDom = ->
  dom = {}
  dom.main = addMain d3.select 'body'
  dom.canvas = dom.main.append 'canvas'
    .style border: '5px solid blue'
  # dom.main = main = addMain d3.select 'body'
  # dom.canvas = main.append('canvas').node()
  # dom.sceneControls = addSceneControls main
  # dom.modeButtons = getModeButtons dom.sceneControls
  # dom.cameraControls = addCameraControls main
  return dom

emitter.emit 'start'
