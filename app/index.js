/* jshint esversion: 6 */
/* jshint unused: true */
/* jshint undef: true */
/* jshint -W087 */
/* global window, document */

import debug from 'debug';
import Rx, { Observable as stream } from 'rx';
import combineLatestObj from 'rx-combine-latest-obj';
import d3 from 'd3';
import THREE from 'three/three.js';
// import createVirtualAudioGraph from 'virtual-audio-graph';
import _ from 'underscore';

// import OBJLoader from './OBJLoader.js';
// import makeD3DomDriver from './d3DomDriver.js';
// import makeStateDriver from './stateDriver.js';

// import * as DOM from './dom.js';
// import * as Renderer from './renderer.js';
// import * as Camera from './camera.js';
// import * as Scene from './scene.js';

import log from './utilities/log.js';
import apply from './utilities/apply.js';
// import Selectable from './utilities/selectable.js';

selectableTHREEJS(THREE);
debug.enable('*,-reducer:*');
Rx.config.longStackSupport = true;

/** GLOBALS */
const MIN_VOLUME = 0.1;

const latitude_to_theta = d3.scaleLinear()
  .domain([90, 0, -90])
  .range([0, Math.PI/2, Math.PI])
  .clamp(true);
  
const latitudeToTheta = latitude_to_theta;
  
const longitude_to_phi = d3.scaleLinear()
  .domain([-180, 0, 180])
  .range([0, Math.PI, 2 * Math.PI]);
  
const longitudeToPhi = longitude_to_phi;
  
const degToRad = d3.scaleLinear()
  .domain([0, 360])
  .range([0, 2 * Math.PI]);

main();

function main() {
  const windowSize$ = windowSize();

  const key$ = stream
    .fromEvent(document, 'keydown')
    .pluck('code')
    .map(code => code.replace('Key', ''));

  const actionSubject = new Rx.ReplaySubject(1);

  const action$ = stream
    .merge(
      actionSubject
    );
    
  const updateSelectedConeVolume$ = action$
    .filter(d => d.actionType === 'update-selected-cone-volume')
    .map(({ dx }) => model => {
      const selectedObject = getSelected(model.objects.values());
      const selectedCone = getSelected(selectedObject.cones);
      if (typeof selectedCone !== 'undefined') {
        const DRAG_SENSITIVITY = 0.01;
        const newVolume = selectedCone.volume + dx * DRAG_SENSITIVITY;
        const MAX_VOLUME = 1;
        const MIN_VOLUME = 0.1;
        if (newVolume <= MAX_VOLUME && newVolume >= MIN_VOLUME)
          selectedCone.volume = newVolume;
      }
      return model;
    });

  const tweenObjectVolume$ = tweenObjectVolume({ action$ });
  
  const updateSelectedObjectVolume$ = updateSelectedObjectVolume({ action$ });

  const newObjectAction$ = key$
    .filter(code => code === 'O')
    .map(() => new THREE.Vector3(
      Math.random() * 10 - 5,
      1.5,
      Math.random() * 10 - 5
    ))
    .map(getAddObjectReducer(actionSubject))
    .map(compose(updateSelected));
    
  function compose(second) {
    return function(first) {
      return _.compose(second, first);
    };
  }
    
  function updateSelected(model) {
    const selectedArray = model.objects.values().filter(d => d.selected);
    model.selected = selectedArray[0];
    return model;
  }
  
  const addConeToSelected$ = action$
    .filter(d => d.actionType === 'add-cone-to-selected')
    .map(addConeToSelected);
    
  function addConeToSelected() {
    return function(model) {
      const { selected } = model;
      selected.cones = selected.cones || [];
      /** NOTE: Un-select all */
      selected.cones.forEach(d => d.selected = false);
      const maxKey = d3.max(selected.cones, d => d.key) || 0;
      const key = maxKey + 1;
      const newCone = {
        key,
        latitude: Math.random() * 180 - 90,
        longitude: Math.random() * 360 - 180,
        volume: 1,
        spread: 0.5,
        type: 'cone',
        selected: true
      };
      selected.cones.push(newCone);
      return model;
    };
  }
    
  const updateParentObjectPosition$ = action$
    .filter(d => d.actionType === 'update-selected-parent-object-position')
    .map(({ value }) => model => {
      const selected = getSelected(model.objects.values());
      if (selected.type === 'object-parent') {
        const DRAG_SENSITIVITY = 0.01;
        const delta = value.multiplyScalar(DRAG_SENSITIVITY);
        selected.position.add(delta);
      }
      return model;
    });

  const modelReducer$ = stream
    .merge(
      newObjectAction$,
      tweenObjectVolume$,
      updateSelectedObjectVolume$,
      updateParentObjectPosition$,
      addConeToSelected$,
      updateSelectedConeVolume$
    )
    .map(compose(model => {
      model.objects.values().forEach(object => {
        object.cones = object.cones || [];
        object.cones.forEach(setConeLookAt);
      });
      return model;
    }));
    
  function setConeLookAt(cone) {
    const { latitude, longitude } = cone;
    const theta = latitudeToTheta(latitude);
    const phi = longitudeToPhi(longitude);
    const radius = 1;
    const lookAt = polarToVector({ radius, theta, phi });
    cone.lookAt = lookAt;
    return cone;
  }

  const mainSceneModel$ = stream
    .just({ objects: d3.map() })
    .concat(modelReducer$)
    .scan(apply)
    .shareReplay(1);
    /** NOTE: shareReplay */
    
  const selected$ = mainSceneModel$
    .pluck('objects')
    .map(o => o.values())
    .map(getSelected);

  const editorDomModel$ = getEditorDomModel$(selected$);

  const updateRendererSize$ = windowSize$
    .map(size => renderer => {
      const currentSize = renderer.getSize();
      const diff = _.difference(_.values(currentSize), _.values(size));
      if (diff.length > 0) {
        debug('reducer:renderer')('update size');
        renderer.setSize(size.width, size.height);
      }
      return renderer;
    });

  const rendererUpdate$ = stream
    .merge(
      updateRendererSize$
    );

  const mainRenderer$ = stream
    .just(getFirstRenderer())
    .concat(rendererUpdate$)
    .scan(apply);
  
  const setMainCanvas$ = mainRenderer$
    .first()
    .pluck('domElement')
    .map(canvas => dom => {
      const canvasSelection = dom
        .select('main')
        .append(() => canvas)
        .attr('id', 'main-canvas');
      getMainDomAction$(canvasSelection).subscribe(actionSubject);
      return dom;
    });

  /** SCENE */
  const addLightsReducer$ = stream
    .just(scene => {
      scene.add(getSpotlight());
      scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
      return scene;
    });
  const addFloorReducer$ = getAddFloorReducer();
  const joinObjectsReducer$ = getJoinObjectsReducer(mainSceneModel$);
  const sceneReducer$ = stream
    .merge( 
      addLightsReducer$, 
      addFloorReducer$, 
      joinObjectsReducer$ 
    );
  const mainScene$ = stream
    .just(new THREE.Scene())
    .concat(sceneReducer$)
    .scan(apply);
  /** CAMERA */
  const mainCamera$ = mainCamera(windowSize$);
  /** RENDER */
  combineAndRender(mainRenderer$, mainScene$, mainCamera$);
  /** DOM */
  const editorDomReducer$ = getEditorDomReducer({ editorDomModel$, actionSubject });
  const domReducer$ = stream.merge(setMainCanvas$, editorDomReducer$);
  updateDom(domReducer$);
}

function getSelected(array) {
  return array.filter(d => d.selected)[0];
}

function getAddObjectReducer(actionSubject) {
  return position => model => {
    const { objects } = model;
    /** NOTE: Un-select all */
    objects.each(d => d.selected = false);
    model.maxId = d3.max(objects.values(), d => d.key) || 0;
    const key = model.maxId + 1;
    const newObject = {
      position,
      key,
      type: 'object-parent',
      selected: true,
      volume: 0.1,
      children: [
        {
          // type: 'object',
          // key,
          // volume: 0.1,
          // name: `object-${key}`
        }
      ],
      trajectoryPoints: [
				[+0,+0,+0], 
				[+2,+1,-2], 
				[+5,-1,-2], 
				[+8,+2,+3], 
				[+3,-1,+6]
			].map(([x,y,z]) => ({x,y,z})),
			closedTrajectory: true,
			velocity: 1
    };
    newObject.childObject = newObject.children[0];
    model.objects.set(key, newObject);
    actionSubject.onNext({
      actionType: 'tween-object-volume',
      key,
      destination: 1,
      duration: 200
    });
    return model;
  };
}

function getEditorDomModel$(selected$) {
  const editorDomModel$ = selected$
    .map(selected => {
      if (typeof selected === 'undefined') return { cards: [] };
      if (selected.type === 'object-parent') {
        const parentKey = selected.key;
        const { cones } = selected;
        const hasCones = cones.length > 0;
        let coneCardBlock = [];
        if (hasCones) {
          const selectedCone = cones.filter(d => d.selected)[0];
          if (selectedCone) {
            coneCardBlock = [
              {
                id: 'cone-info-card-block',
                header: `Cone ${parentKey}.${selectedCone.key}`,
                rows: getConeInfoRows(selectedCone)
              }
            ];
          }
        }
        const objectCardBlock = [
          {
            id: 'object-info-card-block',
            header: `Object ${parentKey}`,
            rows: getObjectInfoRows(selected)
          }
        ];
        
        const card_blocks = coneCardBlock.concat(objectCardBlock);
        
        return {
          cards: [
            {
              id: 'selected-info-card',
              card_blocks
            }
          ]
        };
      }
      /** TODO: If other type of object is selected... */
      debugger;
    });
  return editorDomModel$;
}

function column(klass, span_class, text, cursor, actionType, mapper) {
  return {
    class: klass,
    span_class,
    text,
    span_styles: cursor ? { cursor } : undefined,
    registerAction: actionType ? registerTextDragAction(actionType, mapper) : undefined
  };
}

function getConeInfoRows(selected) {
  const volumeText = `${d3.format(".1f")(selected.volume)} dB` || 'Error!';
  return [
    { /** New row */
      columns: [
        column('col-xs-3', 'key', 'File'),
        column('col-xs-3', 'value', selected.file || 'None', 'pointer'),
        column('col-xs-3', 'key', 'Volume'),
        column('col-xs-3', 'value', volumeText, 'ew-resize', 'update-selected-cone-volume')
      ]
    }
  ];
}

/**
 * Get all of the textual key and value rows and columns for an Object Parent.
 * TODO: Still needs a lot of DRY-ing
 */
function getObjectInfoRows(selected) {
  return [
    { /** New row */
      columns: [
        column('col-xs-3', 'key', 'File'),
        column('col-xs-3', 'value', selected.file || 'None', 'pointer'),
        column('col-xs-3', 'key', 'Volume'),
        {
          class: 'col-xs-3',
          span_class: 'value',
          span_styles: {
            cursor: 'ew-resize'
          },
          text: `${d3.format(".1f")(selected.volume)} dB` || 'Error!',
          registerAction: registerTextDragAction(
            'update-selected-object-volume',
            dx => model => {
              const object = getSelected(model.objects.values());
              if (object.type === 'object-parent') {
                const newVolume = object.volume + dx * 0.01;
                const MAX_VOLUME = 1;
                const MIN_VOLUME = 0.1;
                if (newVolume <= MAX_VOLUME && newVolume >= MIN_VOLUME)
                  object.volume = newVolume;
              }
              return model;
            }
          )
        }
      ]
    },
    { /** New row */
      columns: draggableKeyValue(
        'x', 
        d => d3.format(".1f")(d.position.x),
        'update-selected-parent-object-position',
        dx => new THREE.Vector3(dx, 0, 0)
      )(selected)
    },
    { /** New row */
      columns: draggableKeyValue(
        'y', 
        d => d3.format(".1f")(d.position.y),
        'update-selected-parent-object-position',
        dx => new THREE.Vector3(0, dx, 0)
      )(selected)
    },
    { /** New row */
      columns: draggableKeyValue(
        'z', 
        d => d3.format(".1f")(d.position.z),
        'update-selected-parent-object-position',
        dx => new THREE.Vector3(0, 0, dx)
      )(selected)
    },
    { /** New row */
      columns: [
        {
          class: 'col-xs-6',
          span_class: 'value',
          span_styles: {
            cursor: 'pointer'
          },
          text: 'Delete'
        }
      ]
    },
    { /** New row */
      columns: [
        {
          class: 'col-xs-6',
          span_class: 'value',
          span_styles: {
            cursor: 'pointer'
          },
          text: 'Add Cone',
          registerAction: ({ node, actionSubject }) => {
            observableFromD3Event(d3.select(node))('click')
              .map(() => ({
                actionType: 'add-cone-to-selected'
              }))
              .subscribe(actionSubject);
          }
        }
      ]
    }
  ];
}

function draggableKeyValue(keyText, valueText, actionType, actionMap) {
  return function(selected) {
    return [
      {
        class: 'col-xs-3',
        span_class: 'key',
        text: keyText
      },
      {
        class: 'col-xs-3',
        span_class: 'value',
        span_styles: {
          cursor: 'ew-resize'
        },
        text: valueText(selected),
        registerAction: registerTextDragAction2(
          actionType,
          actionMap
        )
      }
    ];
  };
}

function registerTextDragAction2(actionType, mapper) {
  return function({ node, actionSubject }) {
    const dragAction$ = getTextDragAction$(node)
      .map(mapper)
      .map(value => ({
        actionType,
        value
      }));
    dragAction$.subscribe(actionSubject);
  };
}

function registerTextDragAction(actionType, getModelReducer) {
  return function({ node, actionSubject }) {
    const dragAction$ = getTextDragAction$(node)
      .map(dx => ({
        actionType,
        dx,
        modelReducer: getModelReducer ? getModelReducer(dx) : undefined
      }));
    dragAction$.subscribe(actionSubject);
  };
}
  
function getTextDragAction$(node) {
  const dragHandler = getDragHandlerWithSubject();
  d3.select(node).call(dragHandler);
  const drag$ = observableFromDragEvent(dragHandler)('drag');
  const dragAction$ = drag$
    .pluck('event', 'x')
    .pairwise()
    .map(arr => arr.reduce((a,b) => b-a));
  return dragAction$;
}

function getMainDomAction$(canvasSelection) {
  const dragHandler = getDragHandler();
  canvasSelection.call(dragHandler);
  const drag$ = observableFromDragEvent(dragHandler)('drag');
  const dragStart$ = observableFromDragEvent(dragHandler)('start');
  const dragEnd$ = observableFromDragEvent(dragHandler)('end');
  const mousemove$ = observableFromD3Event(canvasSelection)('mousemove');
  const click$ = observableFromD3Event(canvasSelection)('click');
  const action$ = stream
    .merge(
      drag$,
      dragStart$,
      dragEnd$,
      mousemove$,
      click$
    )
    .map(eventObj => {
      const { event: { x, y }, node } = eventObj;
      const { width, height } = node;
      const mouse = d3.mouse(node);
      const ndcScale = {
        x: d3.scaleLinear().domain([0, width]).range([-1, +1]),
        y: d3.scaleLinear().domain([0, height]).range([+1, -1])
      };
      eventObj.ndc = {
        x: ndcScale.x(mouse[0]), 
        y: ndcScale.y(mouse[1]) 
      };
      eventObj.actionType = 'main-mouse-action';
      return eventObj;
    });
  return action$;
}

function getDragHandlerWithSubject() {
  const subject = { x: 0, y: 0 };
  return d3.drag()
    .subject(subject)
    .container(function() { return this; });
}

function getDragHandler() {
  return d3.drag()
    .subject(function() { return { x: d3.event.x, y: d3.event.y }; })
    .container(function() { return this; });
}

function observableFromD3Event(selection) {
  return function(type) {
    return stream
      .create(observer => {
        selection
          .on(type, function(d) {
            observer.onNext({
              datum: d,
              node: this,
              event: d3.event
            });
          });
      });
  };
}

function observableFromDragEvent(dragHandler) {
  return function(type) {
    return stream
      .create(observer => {
        dragHandler
          .on(type, function(d) {
            d3.event.subject.x = d3.event.x;
            d3.event.subject.y = d3.event.y;
            observer.onNext({
              datum: d,
              node: this,
              event: d3.event
            });
          });
      });
  };
}

function getAddFloorReducer() {
  return stream
    .just(scene => {
      const room_size = {
        width: 20,
        length: 18,
        height: 3
      };
      scene.add(getFloor(room_size));
      return scene;
    });
}

function updateDom(domUpdate$) {
  stream
    .just(getFirstDom())
    .concat(domUpdate$)
    .scan(apply)
    .subscribe();
}

function getEditorDomReducer({ editorDomModel$, actionSubject }) {
  return editorDomModel$
    .map(model => dom => {
      const cards = joinEditorCards(model.cards, dom);
      const cardBlocks = joinCardBlocks(cards);
      joinInfoRowsCols({ cardBlocks, actionSubject });
      return dom;
    });
}

/**
 * CAMERA
 * 
 * 
 */
 
function polarToVector({ radius, theta, phi }) {
  return {
    x: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi) * Math.sin(theta),
    y: radius * Math.cos(theta)
  };
}
 
function mainCamera(windowSize$) {
  const latitude$ = stream
    .just(45)
    .shareReplay(1);
  const longitude$ = stream
    .just(45)
    .shareReplay(1);
  const theta$ = latitude$
    .map(latitude_to_theta);
  const phi$ = longitude$
    .map(longitude_to_phi)
    .map(phi => phi % (2 * Math.PI))
    .map(phi => (phi < 0) ? (2 * Math.PI) + phi : phi);
  const polar_position$ = stream
    .combineLatest(
      stream.of(100),
      theta$,
      phi$,
      (radius, theta, phi) => ({ radius, theta, phi })
    );
  const relative_position$ = polar_position$
    .map(polarToVector)
    .scan((vector, position) => vector.copy(position), new THREE.Vector3());
  const lookAt$ = stream
    .just(new THREE.Vector3())
    .shareReplay(1);
  const position$ = stream
    .combineLatest(
      relative_position$,
      lookAt$,
      (rel, look) => rel.add(look)
    );
  const updateLookAt$ = lookAt$
    .map(lookAt => camera => {
      if (! _.isMatch(camera._lookAt, lookAt)) {
        debug('reducer:camera')('update lookAt', lookAt);
        camera._lookAt = lookAt;
        camera.lookAt(lookAt || new THREE.Vector3());
      }
      return camera;
    });
  const updatePosition$ = position$
    .map(position => camera => {
      if (! _.isMatch(camera.position, position)) {
        debug('reducer:camera')('update position', position);
        camera.position.copy(position);
      }
      return camera;
    });
  const updateSize$ = windowSize$
    .map(s => camera => {
      debug('reducer:camera')('update size', s);
      [ camera.left, camera.right ] = [-1,+1].map(d => d * s.width * 0.5);
      [ camera.bottom, camera.top ] = [-1,+1].map(d => d * s.height * 0.5);
      camera.updateProjectionMatrix();
      return camera;
    });
  const updateZoom$ = stream
    .just(50)
    .map(zoom => camera => {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      return camera;
    });
  const mainCameraUpdate$ = stream
    .merge(
      updateSize$,
      updatePosition$,
      updateLookAt$,
      updateZoom$
    );
  const mainCamera$ = stream
    .just(new THREE.OrthographicCamera())
    .concat(mainCameraUpdate$)
    .scan(apply);
  return mainCamera$;
}

function combineAndRender(renderer$, scene$, camera$) {
  combineLatestObj({
    renderer$,
    scene$,
    camera$
  })
  .map(({ renderer, scene, camera }) => () => {
    renderer.render(scene, camera);
  })
  .subscribe(fn => fn());
}

function updateSelectedObjectVolume({ action$ }) {
  return action$
    .filter(d => d.actionType === 'update-selected-object-volume')
    .pluck('modelReducer');
}

function tweenObjectVolume({ action$ }) {
  return action$
    .filter(({ actionType }) => actionType === 'tween-object-volume')
    .flatMap(({ destination, key, duration }) => {
      return d3TweenStream(duration)
        .scan((last, t) => ({ t: t, dt: t - last.t }), { t: 0, dt: 0 })
        .map(({ t, dt }) => model => {
          const object = model.objects.get(key);
          const { volume } = object;
          if (typeof volume === 'undefined') throw new Error('volume undefined');
          const current = volume;
          let speed = (1-t) === 0 ? 0 : (destination - current)/(1 - t);
          let step = current + dt * speed;
          let next = t === 1 || step > destination ? destination : step;
          object.volume = next;
          return model;
        });
    });
}

function d3TweenStream(duration, name) {
  return stream.create(function(observer) {
    return d3.transition()
      .duration(duration)
      .ease(d3.easeLinear)
      .tween(name, function() {
        return function(t) {
          return observer.onNext(t);
        };
      })
      .on("end", function() {
        return observer.onCompleted();
      });
  });
}

function windowSize() {
  return stream.fromEvent(window, 'resize')
    .pluck('target')
    .startWith(window)
    .map(element => ({
      width: element.innerWidth,
      height: element.innerHeight
    }));
}

/**
 * SCENE
 *
 *
 *
 */
 
function getJoinObjectsReducer(model$) {
  return model$
    .map(({ objects }) => objects.values())
    .map(objects => scene => {
      // objects.forEach(o => console.log(o.cones))
      const sceneSelection = d3.select(scene);
      const parents = joinObjectParents({ objects, sceneSelection });
      // const _objects = joinChildObjects(parents);
      // const cones = joinCones(parents);
      // parents.each(function(parent) {
      //   d3.select(this)
      //     .selectAll()
      // });
      return scene;
    });
}

function joinCones(objects) {
  let join = objects
		.selectAll()
		.data(function(d) { return d.cones || [] });
		// .data(function(d) { debugger })
	join
		.exit()
		.each(function(d) {
		  console.warn('exit');
			this.parent.remove(this);
		});
	const enter = join
	  .enter()
	  .append(getNewCone);
	const cones = enter
    .merge(join)
	  .each(updateOneCone);
}

function getNewCone(d) {
	let CONE_BOTTOM = 0.01;
	let CONE_RADIAL_SEGMENTS = 50;
	let params = {
		radiusBottom: CONE_BOTTOM,
		openEnded: true,
		radialSegments: CONE_RADIAL_SEGMENTS
	};
	let geometry = new THREE.CylinderGeometry(
		params.radiusTop,
		params.radiusBottom,
		params.height,
		params.radialSegments,
		params.heightSegments,
		params.openEnded
	);
	let material = new THREE.MeshPhongMaterial({
		transparent: true,
		opacity: 0.5,
		side: THREE.DoubleSide
	});
	let cone = new THREE.Mesh(geometry, material);
	cone.name = 'cone';
	cone._type = 'cone';
	cone.castShadow = true;
	cone.receiveShadow = true;
	d3.select(cone).datum(d);
	let coneParent = new THREE.Object3D();
	coneParent.name = 'cone_parent';
	coneParent.add(cone);
	return coneParent;	
}

function updateOneCone(d) {
	/** Update rotation */
	this.lookAt(d.lookAt || new THREE.Vector3());
	/** If params change, update geometry */
	let cone = this.children[0];
	let params = cone.geometry.parameters;
	let newParams = { height: d.volume, radiusTop: d.spread };
	if (! _.isMatch(params, newParams)) {
		debug('cone')('new geometry');
		Object.assign(params, newParams);
		let newGeom = cylinder_geometry_from_params(params);
		cone.geometry.dispose();
		cone.geometry = newGeom;
		cone.rotation.x = Math.PI/2;
		cone.position.z = cone.geometry.parameters.height / 2;
	}
	/** Update color */
	let SELECTED_COLOR = new THREE.Color("#66c2ff");
	if (d.selected === true) cone.material.color = SELECTED_COLOR;
	else cone.material.color = new THREE.Color('#ffffff');
	/** Update color */
// 	cone.material.color = new THREE.Color(`#${d.material.color}`);
}

function cylinder_geometry_from_params(params) {
	return new THREE.CylinderGeometry(
		params.radiusTop,
		params.radiusBottom,
		params.height,
		params.radialSegments,
		params.heightSegments,
		params.openEnded
	);
}
 
function joinObjectParents({ objects, sceneSelection }) {
  const join = sceneSelection
    .selectAll()
    .filter(function(d) {
      if (typeof d === 'undefined') return false;
      return d.type === 'object-parent';
    })
    .data(objects, d => d.key);
  const exit = join
    .exit()
    .remove();
  const enter = join
    .enter()
    .append(() => new THREE.Object3D());
  /** Add child object, i.e. the sphere */
  enter
    .append(getNewObject)
    .each(function(d) {
      this._type = 'object';
    });
  const parents = enter
    .merge(join)
    .each(function(parent) {
      this.position.copy(parent.position);
    });
  const childObjects = parents
    .select(function(d) {
      return this.getObjectByProperty('_type', 'object');
    })
    .each(updateObjectRadius)
    .each(updateObjectOpacity);
  joinCones(childObjects);
  return parents;
}
  
// function joinChildObjects(parents) {
//   const join = parents
//     .selectAll()
//     .filter(function(d) {
//       return d.type === 'object';
//     })
//     .data(d => d.children || [], d => d.key);
//   const enter = join
//     .enter()
//     .append(getNewObject);
//   const objects = enter
//     .merge(join)
//     .each(updateObjectRadius)
//     .each(updateObjectOpacity);
//     // .each(function(d) {
//     //   const object = this;
//     // });
//   return objects;
// }
  
function getNewObject() {
  const geometry = new THREE.SphereGeometry(0.1, 30, 30);
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(0, 0, 0),
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide
  });
  const newObject = new THREE.Mesh(geometry, material);
  newObject.castShadow = true;
  newObject.receiveShadow = true;
  return newObject;
}

function updateObjectOpacity({ selected }) {
  this.material.opacity = selected ? 0.3 : 0.1;
}
  
function updateObjectRadius(d) {
  const { volume } = d;
  const object = this;
  const params = object.geometry.parameters;
  if (! _.isMatch(params, { radius: volume })) {
    object.geometry.dispose();
    debug('reducer:sound-object')('set radius', volume);
    Object.assign(params, { radius: volume });
    const newGeom = new THREE.SphereGeometry(
      params.radius,
      params.widthSegments,
      params.heightSegments
    );
    object.geometry = newGeom;
  }
}

function getSpotlight() {
  var spotLight = new THREE.SpotLight(0xffffff, 0.95);
  spotLight.position.setY(100);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.width = 4000;
  spotLight.shadow.mapSize.height = 4000;
  spotLight.intensity = 1;
  spotLight.exponent = 1;
  return spotLight;
}

function getFloor(room_size) {
  var FLOOR_SIZE = 100;
  var floorGeom = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  var c = 0.46;
  var floorMat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(c, c, c),
    side: THREE.DoubleSide,
    depthWrite: false
  });
  var e = 0.5;
  floorMat.emissive = new THREE.Color(e, e, e);
  var floor = new THREE.Mesh(floorGeom, floorMat);
  floor.name = 'floor';
  floor.rotateX(Math.PI / 2);
  floor.position.setY(-room_size.height / 2);
  var grid = new THREE.GridHelper(FLOOR_SIZE / 2, 2);
  grid.rotateX(Math.PI / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  grid.material.linewidth = 2;
  grid.material.depthWrite = false;
  floor.add(grid);
  floor.receiveShadow = true;
  return floor;
}

/**
 * RENDERER
 *
 *
 *
 */

function getFirstRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xf0f0f0);
  return renderer;
}

/**
 * DOM
 *
 *
 *
 */
 
function joinInfoRowsCols({ cardBlocks, actionSubject }) {
  const rowsJoin = cardBlocks
    .selectAll('.row')
    .data(d => d.rows || []); /** NOTE: Rows don't have a key */
  const rowsEnter = rowsJoin
    .enter()
    .append('div')
    .classed('row parameter', true);
  const rows = rowsJoin.merge(rowsEnter);
  const colsJoin = rows
    .selectAll('.column')
    .data(d => d.columns || []); /** NOTE: Cols don't have a key */
  const colsEnter = colsJoin
    .enter()
    .append('div')
    .attr('class', d => d.class)
    .classed('column', true)
    .attr('id', d => d.id);
  colsEnter
    .append('span')
    .attr('class', d => d.span_class)
    .each(setStyles(d => d.span_styles))
    .each(function(d) {
      if (d.registerAction) d.registerAction({
        node: this,
        datum: d,
        actionSubject: actionSubject
      });
    });
  colsEnter
    .merge(colsJoin)
    .select('span')
    .text(d => d.text);
  const columns = colsEnter.merge(colsJoin);
  return columns;
}

function joinCardBlocks(editor_cards) {
  const join = editor_cards
    .selectAll('.card-block')
    .data(d => d.card_blocks || [], d => d.id);
  join
    .exit()
    .remove();
  const enter = join
    .enter()
    .append('div')
    .classed('card-block', true);
  enter
    .append('h6')
    .classed('card-title', true);
  const cardBlocks = enter
    .merge(join);
  cardBlocks
    .select('.card-title')
    .attr('id', d => d.id)
    .text(d => d.header);
  return cardBlocks;
}

function joinEditorCards(cards, dom) {
  const join = dom
    .select('#scene-controls')
    .selectAll('.card')
    .data(cards, d => d.key);
  join
    .exit()
    .remove();
  const enter = join
    .enter()
    .append('div')
    .classed('card', true);
  return enter.merge(join);
}

function getFirstDom() {
  const dom = d3.select('#app');
  const main = dom.append('main');
  const controls_join = main
    .selectAll('.controls')
    .data(getControlsData());
  const controls_enter = controls_join
    .enter()
    .append('div')
    .attr('class', d => d.class)
    .classed('controls', true)
    .attr('id', d => d.id)
    .style('position', 'absolute')
    .each(setStyles(d => d.styles));
  addControlButtons(controls_enter);
  addObjectButton(controls_enter);
  return dom;
}

function setStyles(accessor) {
  return function(d) {
    const s = d3.select(this);
    const styles = accessor(d);
    for (let key in styles) {
      s.style(key, styles[key]);
    }
  };
}

function addControlButtons(controls_enter) {
  controls_enter
    .selectAll('button')
    .data(d => d.buttons || [])
    .enter()
    .append('button')
    .style('background', 'none')
    .style('border', 'none')
    .classed('btn btn-lg btn-secondary', true)
    .append('i')
    .classed('material-icons', true)
    .style('display', 'block')
    .text(d => d.text);
}

function addObjectButton(controls_enter) {
  controls_enter
    .filter('#scene-controls')
    .selectAll('.add-buttons')
    .data(['add-object'])
    .enter()
    .append('div')
    .classed('row add-buttons', true)
    .append('div')
    .classed('col-xs-12', true)
    .style('margin-top', '-5px')
    .append('button')
    .classed('btn btn-lg btn-primary', true)
    .attr('id', d => d)
    .append('i')
    .classed('material-icons', true)
    .style('display', 'block')
    .text('add');
}

function getControlsData() {
  const SCENE_CONTROLS_WIDTH = '40vw';
  return [
    {
      id: 'file-controls',
      styles: {
        left: 0,
        top: 0
      },
      buttons: [
        'volume_up', "save", "open_in_browser"
      ].map(text => ({ text }))
    },
    {
      id: 'scene-controls',
      class: 'container',
      styles: {
        right: 0,
        top: 0,
        width: SCENE_CONTROLS_WIDTH
      }
    },
    {
      id: 'zoom-controls',
      styles: {
        right: 0,
        bottom: '1%'
      },
      buttons: [
        ['zoom-in','zoom_in'],
        ['zoom-out','zoom_out']
      ].map(([id,text]) => ({id,text}))
    },
    {
      id: 'dev-controls',
      styles: {
        left: 0,
        bottom: 0
      }
    }
  ];
}

function selectableTHREEJS(THREE) {
  THREE.Object3D.prototype.appendChild = function (c) {
    this.add(c);
    return c;
  };
  THREE.Object3D.prototype.insertBefore = THREE.Object3D.prototype.appendChild;
  THREE.Object3D.prototype.querySelector = function(query) {
    let key = Object.keys(query)[0];
    return this.getObjectByProperty(key, query[key]);
  };
  THREE.Object3D.prototype.querySelectorAll = function (query) {
    if (typeof query === 'undefined') return this.children;
    return this.children.filter(d => _.isMatch(d, query));
  };
}