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
import createVirtualAudioGraph from 'virtual-audio-graph';
import _ from 'underscore';

import OBJLoader from './OBJLoader.js';

import log from './utilities/log.js';
import apply from './utilities/apply.js';

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

main();

function main() {
  /** ACTIONS */
  const actionSubject = new Rx.ReplaySubject(1);
  const action$ = actionSubject;
  const windowSize$ = windowSize();
  const keyAction$ = getKeyAction$();
  const newObjectAction$ = keyAction$
    .filter(d => d.type === 'keydown')
    .pluck('code')
    .filter(code => code === 'o');
  const animation$ = getAnimation$()
		.shareReplay(1); /** NOTE: shareReplay */
		
	/** INTENT / REDUCERS */
  const velocityReducer$ = action$
    .filter(d => d.actionType === 'velocity')
    .map(velocityReducer);
  function velocityReducer({ value }) {
    return model => {
      const selectedObject = getSelectedObject(model);
      if (typeof selectedObject !== 'undefined') {
        const DRAG_SENSITIVITY = 0.01;
        const delta = value * DRAG_SENSITIVITY;
        const newVel = selectedObject.velocity + delta;
        selectedObject.velocity = newVel;
      }
      return model;
    };
  }
  const coneLatitudeReducer$ = action$
    .filter(d => d.actionType === 'update-cone-latitude')
    .map(coneLatitudeReducer);
  function coneLatitudeReducer({ value }) {
    return model => {
      const selectedCone = getSelectedCone(model);
      if (typeof selectedCone !== 'undefined') {
        const DRAG_SENSITIVITY = 1;
        const delta = value * DRAG_SENSITIVITY;
        const test = selectedCone.latitude + delta;
        const MAX_CONE_LATITUDE = 90;
        const MIN_CONE_LATITUDE = -90;
        const newLat = test > MAX_CONE_LATITUDE ? MAX_CONE_LATITUDE :
          test < MIN_CONE_LATITUDE ? MIN_CONE_LATITUDE :
          test;
        selectedCone.latitude = newLat;
      }
      return model;
    };
  }
  const coneLongitudeReducer$ = action$
    .filter(d => d.actionType === 'update-cone-longitude')
    .map(coneLongitudeReducer);
  function coneLongitudeReducer({ value }) {
    return model => {
      const selectedCone = getSelectedCone(model);
      if (typeof selectedCone !== 'undefined') {
        const DRAG_SENSITIVITY = 1;
        const delta = value * DRAG_SENSITIVITY;
        const newLong = (selectedCone.longitude + delta) % 360;
        selectedCone.longitude = newLong;
      }
      return model;
    };
  }
  const coneVolumeReducer$ = action$
    .filter(d => d.actionType === 'update-selected-cone-volume')
    .map(coneVolumeReducer);
  function coneVolumeReducer({ value }) {
    return model => {
      const selectedCone = getSelectedCone(model);
      if (typeof selectedCone !== 'undefined') {
        const DRAG_SENSITIVITY = 0.01;
        const newVolume = selectedCone.volume + value * DRAG_SENSITIVITY;
        const MAX_VOLUME = 1;
        const MIN_VOLUME = 0.1;
        if (newVolume <= MAX_VOLUME && newVolume >= MIN_VOLUME)
          selectedCone.volume = newVolume;
      }
      return model;
    };
  }
    
  const tweenObjectVolumeReducer$ = action$
    .filter(({ actionType }) => actionType === 'tween-object-volume')
    .flatMap(tweenObjectVolume);
  
  const objectVolumeReducer$ = action$
    .filter(d => d.actionType === 'update-selected-object-volume')
    .map(objectVolumeReducer);
  function objectVolumeReducer({ value }) {
    return model => {
      const object = getSelectedObject(model);
      if (object.type === 'object-parent') {
        const newVolume = object.volume + value * 0.01;
        const MAX_VOLUME = 1;
        const MIN_VOLUME = 0.1;
        if (newVolume <= MAX_VOLUME && newVolume >= MIN_VOLUME)
          object.volume = newVolume;
      }
      return model;
    };
  }
    
  const newObjectReducer$ = newObjectAction$
    .map(() => new THREE.Vector3(
      Math.random() * 10 - 5,
      1.5,
      Math.random() * 10 - 5
    ))
    .map(getAddObjectReducer(actionSubject));
    
  const addConeReducer$ = action$
    .filter(d => d.actionType === 'add-cone-to-selected')
    .map(addConeReducer);
    
  const objectPositionReducer$ = action$
    .filter(d => d.actionType === 'update-selected-parent-object-position')
    .map(objectPositionReducer);
    
  function objectPositionReducer({ value }) {
    return model => {
      const selectedObject = getSelectedObject(model);
      if (selectedObject.type === 'object-parent') {
        const DRAG_SENSITIVITY = 0.01;
        const delta = value.multiplyScalar(DRAG_SENSITIVITY);
        selectedObject.position.add(delta);
      }
      return model;
    };
  }
    
	const distanceReducer$ = getDistanceReducer$(animation$);
	
	const modelReducer$ = stream
    .merge(
      newObjectReducer$,
      tweenObjectVolumeReducer$,
      objectVolumeReducer$,
      objectPositionReducer$,
      velocityReducer$,
      addConeReducer$,
      coneVolumeReducer$,
      coneLatitudeReducer$,
      coneLongitudeReducer$,
      distanceReducer$
    );
	
  // const modelReducer$ = getModelReducer$({ animation$ });
    
  const mainSceneModel$ = getMainSceneModel$(modelReducer$)
    .shareReplay(1); /** NOTE: shareReplay */
  const files$ = stream.just(['wetShort.wav']);
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const theAudioContext = new AudioContext();
  const audioBuffers$ = getAudioBuffers$({ files$, theAudioContext });
  const headVelocityReducer$ = getHeadVelocityReducer$({ keyAction$ });
  const animateHeadReducer$ = getAnimateHeadReducer$(animation$);
	const headReducer$ = stream
	  .merge(
	     headVelocityReducer$,
	     animateHeadReducer$
	  );
	const head$ = getHeadModel$(headReducer$)
	  .shareReplay(1); /** NOTE: shareReplay */
	/** AUDIO GRAPH */
  const listenerReducer$ = getListenerReducer$(head$);
  const panners$ = getPanners$(mainSceneModel$);
  const graphReducer$ = getAudioGraphReducer$({ audioBuffers$, panners$ });
  const virtualAudioGraphReducer$ = stream
    .merge(
      listenerReducer$,
      graphReducer$
    );
  /** RENDERER */
  const rendererSizeReducer$ = getRendererSizeReducer$(windowSize$);
  const mainRenderer$ = getMainRenderer$(rendererSizeReducer$);
  /** SCENE */
  const addLightsReducer$ = getAddLightsReducer();
  const addFloorReducer$ = getAddFloorReducer();
  const joinObjectsReducer$ = getJoinObjectsReducer(mainSceneModel$);
  const joinHeadReducer$ = getJoinHeadReducer(head$);
  const sceneReducer$ = stream
    .merge( 
      addLightsReducer$, 
      addFloorReducer$, 
      joinObjectsReducer$,
      joinHeadReducer$
    );
  const mainScene$ = mainScene(sceneReducer$);
  /** CAMERA */
  const mainCamera$ = mainCamera(windowSize$);
  /** DOM */
  const setMainCanvas$ = setMainCanvas({ mainRenderer$, actionSubject });
  const selected$ = getSelected$(mainSceneModel$);
  const editorDomModel$ = getEditorDomModel$(selected$);
  const editorDomReducer$ = getEditorDomReducer({ editorDomModel$, actionSubject });
  const domReducer$ = stream.merge(setMainCanvas$, editorDomReducer$);
  /** SUBSCRIPTIONS */
  accumulateAudioGraph({ virtualAudioGraphReducer$, theAudioContext })
    .subscribe();
  combineAndRender(mainRenderer$, mainScene$, mainCamera$)
    .subscribe(fn => fn());
  accumulateDom(domReducer$)
    .subscribe();
}

function getModelReducer$({ animation$ }) {
  const distanceReducer$ = getDistanceReducer$(animation$);
  return stream
    .merge(
      newObjectReducer$,
      tweenObjectVolumeReducer$,
      objectVolumeReducer$,
      objectPositionReducer$,
      velocityReducer$,
      addConeReducer$,
      coneVolumeReducer$,
      coneLatitudeReducer$,
      coneLongitudeReducer$,
      distanceReducer$
    );
}

function getKeyAction$() {
  return ['keydown', 'keyup']
    .map(k => stream.fromEvent(document, k))
    .reduce((a,b) => a.merge(b))
    .map(({ code, type }) => {
      return {
        code: code.replace('Key', '').toLowerCase(),
        type
      };
    });
}

function getAnimation$() {
  return stream
    .create(observer => {
			d3.timer(() => observer.onNext());
		})
		.timestamp()
		.pluck('timestamp')
		.map(time => time / 1e3);
}

function getSelectedCone(model) {
  const selectedObject = getSelectedObject(model);
  if (typeof selectedObject === 'undefined')
    throw new Error('No object is selected.');
  const selectedCone = getSelected(selectedObject.cones);
  if (typeof selectedCone === 'undefined')
    throw new Error('No cone is selected.');
  return selectedCone;
}

function getSelectedObject(model) {
  return getSelected(model.objects.values());
}

function getDistanceReducer$(animation$) {
  return animation$
    .map(() => model => {
      model.objects.values()
        .filter(d => d.velocity !== 0)
        .forEach(object => {
          object.distance += object.velocity;
        });
      return model;
    });
}

function getMainSceneModel$(modelReducer$) {
  return stream
    .just({ objects: d3.map() })
    .concat(modelReducer$)
    .scan(apply)
    .map(model => {
      /** NOTE: This happens every time a model is emitted */
      model.objects.values().forEach(object => {
        setConesLookAt(object);
        setTrajectoryOffset(object);
      });
      return model;
    });
}

function setTrajectoryOffset(object) {
  const { curve, distance } = object;
  const t = (distance / curve.getLength()) % 1
  const trajectoryOffset = curve.getPoint(t);
  object.trajectoryOffset = trajectoryOffset;
  return object;
}

function setConesLookAt(object) {
  object.cones = object.cones || [];
  object.cones.forEach(setConeLookAt);
  return object;
}

function getAudioBuffers$({ files$, theAudioContext }) {
  return files$
    .flatMap(arr => arr)
    .flatMap(fileName => {
			var request = new XMLHttpRequest();
			request.open("GET", `assets/${fileName}`, true);
      request.responseType = "arraybuffer";
      const response$ = stream.create(observer => {
      	request.onload = function() {
      		observer.onNext({
      			fileName,
      			arrayBuffer: request.response
      		});
      	};
      });
      request.send();
			return response$;
		})
		.flatMap(({ fileName, arrayBuffer }) => {
		  return stream.create(observer => {
				theAudioContext.decodeAudioData(arrayBuffer, function(audioBuffer) {
					observer.onNext({
					  fileName,
					  audioBuffer
					});
				});
			});
		})
		.scan((a,b) => a.concat(b), []);
}

function getAnimateHeadReducer$(animation$) {
  return animation$
    .map(() => head => {
      head.object3D.translateZ(head.velocity.z);
      head.object3D.rotation.y += head.rotationVelocity;
      return head;
    });
}
function getHeadVelocityReducer$({ keyAction$ }) {
  const HEAD_VELOCITY = 0.1;
  return keyAction$
    .distinctUntilChanged()
    .map(({ type, code }) => head => {
      const value = type === 'keydown' ? HEAD_VELOCITY : 0;
      if (code === 'w') {
        head.velocity.setZ(+value);
      }
      if (code === 's') {
        head.velocity.setZ(-value);
      }
      if (code === 'a') {
        head.rotationVelocity = +value;
      }
      if (code === 'd') {
        head.rotationVelocity = -value;
      }
      return head;
    });
}

function getHeadModel$(headReducer$) {
  return head({ headMesh$: getHeadMesh$() })
    .concat(headReducer$)
    .scan(apply);
}

function getListenerReducer$(head$) {
  return head$
    .map(({ object3D }) => {
      const orientation = object3D.getWorldDirection();
      return { orientation, position: object3D.position };
    })
    .distinctUntilChanged(({ orientation, position }) => {
      const { x: ox, y: oy, z: oz } = orientation;
      const { x: px, y: py, z: pz } = position;
      const string = `${ox}${oy}${oz}${px}${py}${pz}`;
      return string;
    })
    .map(({ orientation, position }) => virtualAudioGraph => {
      const { audioContext: { listener } } = virtualAudioGraph;
      const { x: ox, y: oy, z: oz } = orientation;
      const { x: px, y: py, z: pz } = position;
      listener.setOrientation(ox, oy, oz, 0, 1, 0);
      listener.setPosition(px, py, pz);
      return virtualAudioGraph;
    });
}

function getPanners$(mainSceneModel$) {
  return mainSceneModel$
    .flatMap(model => {
      const objects = model.objects.values();
      return stream
        .from(objects)
        .flatMap(parent => {
          return stream
            .from(parent.cones)
            .map(cone => {
              const { position, trajectoryOffset } = parent;
              const pannerPosition = position.clone().add(trajectoryOffset);
              const orientation = new THREE.Vector3();
  						orientation.copy(cone.lookAt);
  						orientation.normalize();
              return {
                file: cone.file,
                position: pannerPosition.toArray(),
                orientation: orientation.toArray()
              };
            });
        })
        .map((obj, index) => {
          obj.key = `panner${index}`;
          return obj;
        })
        .toArray();
    });
}

function getAudioGraphReducer$({ audioBuffers$, panners$ }) {
  return combineLatestObj({
      audioBuffers$,
      panners$: panners$.startWith({})
    })
    .map(({ audioBuffers, panners }) => virtualAudioGraph => {
      const bufferGraph = getBufferGraph({ audioBuffers, panners });
      const pannerGraph = getPannerGraph(panners);
      const baseGraph = { 0: ['gain', 'output', { gain: 1 }] };
      const graph = Object.assign(baseGraph, pannerGraph, bufferGraph);
      virtualAudioGraph.update(graph);
      return virtualAudioGraph;
    });
}

function getPannerGraph(panners) {
  return panners
    .map(panner => {
      const value = ['panner', 0, {
        position: panner.position,
        orientation: panner.orientation,
        panningModel: 'HRTF',
		  	coneInnerAngle: 0.01*180/Math.PI,
		  	coneOuterAngle: 1*180/Math.PI,
		  	coneOuterGain: 0.03
      }];
      return {
        key: panner.key,
        value
      };
    })
    .reduce((a, { key, value }) => {
      a[key] = value;
      return a;
    }, {});
}

function getBufferGraph({ audioBuffers, panners }) {
  return audioBuffers
    .map((bufferObj, index) => {
      const outputKeys = panners
        .filter(panner => panner.file === bufferObj.fileName)
        .map(panner => panner.key);
      const value = ['bufferSource', outputKeys, { 
        buffer: bufferObj.audioBuffer, 
        loop: true
      }];
      return {
        key: `buffer${index}`,
        value
      };
    })
    .reduce((a, { key, value }) => {
      a[key] = value;
      return a;
    }, {});
}

function accumulateAudioGraph({ virtualAudioGraphReducer$, theAudioContext }) {
  return stream
    .just(createVirtualAudioGraph({ theAudioContext }))
    .concat(virtualAudioGraphReducer$)
    .scan(apply);
}

function getRendererSizeReducer$(windowSize$) {
  return windowSize$
    .map(size => renderer => {
      const currentSize = renderer.getSize();
      const diff = _.difference(_.values(currentSize), _.values(size));
      if (diff.length > 0) {
        debug('reducer:renderer')('update size');
        renderer.setSize(size.width, size.height);
      }
      return renderer;
    });
}

function getMainRenderer$(rendererUpdate$) {
  return stream
    .just(getFirstRenderer())
    .concat(rendererUpdate$)
    .scan(apply);
}

function getAddLightsReducer() {
  return stream
    .just(scene => {
      scene.add(getSpotlight());
      scene.add(new THREE.HemisphereLight(0, 0xffffff, 0.8));
      return scene;
    });
}

function getJoinHeadReducer(head$) {
  return head$
    .map(h => [h])
    .startWith([])
    .map(heads => scene => {
      const sceneSelection = d3.select(scene);
      const join = sceneSelection
        .selectAll()
        .filter(function(d) {
          if (typeof d === 'undefined') return false;
          return d.type === 'head';
        })
        .data(heads, d => d.type);
      join
        .enter()
        .append(d => {
          const head = d.object3D;
          head.rotation.y -= Math.PI;
          const HEAD_SCALE = 0.5;
          head.children[0].castShadow = true;
          head.scale.set(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE);
          return head;
        });
      return scene;
    });
}

function mainScene(sceneReducer$) {
  return stream
    .just(new THREE.Scene())
    .concat(sceneReducer$)
    .scan(apply);
}

function getSelected$(mainSceneModel$) {
  return mainSceneModel$
    .pluck('objects')
    .map(o => o.values())
    .map(getSelected);
}

function setMainCanvas({ mainRenderer$, actionSubject }) {
  return mainRenderer$
    .first()
    .pluck('domElement')
    .map(canvas => dom => {
      const canvasSelection = dom
        .select('main')
        .append(() => canvas)
        .attr('id', 'main-canvas');
      getMainDomAction$(canvasSelection)
        .subscribe(actionSubject);
      return dom;
    });
}

function head({ headMesh$ }) {
	const heads$ = headMesh$
		.map(object3D => {
		  object3D.position.copy({ x: 5, y: 1, z: 4 });
		  return {
  			type: 'head',
  			velocity: new THREE.Vector3(),
  			rotationVelocity: 0,
  			object3D
  		};
		});
	return heads$;
}

function getHeadMesh$() {
	OBJLoader(THREE);
	const loader = new THREE.OBJLoader();
	return stream.create(observer => {
		loader.load('assets/head.obj', d => {
		  observer.onNext(d);
		  observer.onCompleted();
		});
	});
}

function addConeReducer() {
  return function(model) {
    const selected = getSelectedObject(model);
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
      file: 'wetShort.wav',
      selected: true
    };
    selected.cones.push(newCone);
    return model;
  };
}

function setConeLookAt(cone) {
  const { latitude, longitude } = cone;
  const theta = latitudeToTheta(latitude);
  const phi = longitudeToPhi(longitude);
  const radius = 1;
  const lookAt = polarToVector({ radius, theta, phi });
  cone.lookAt = lookAt;
  return cone;
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
    const splineType = 'CatmullRomCurve3';
    const vectors = [
      [+0,+0,+0],
			[+2,+1,-2],
			[+5,-1,-2]
		].map(([x,y,z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE[splineType](vectors);
    curve.closed = true;
    const newObject = {
      position,
      key,
      type: 'object-parent',
      selected: true,
      volume: 0.1,
      curve,
			velocity: 0.05, /** NOTE: per tick */
		  // velocity: 0, /** NOTE: per tick */
			distance: 0
    };
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
      throw new Error('not implemented');
    });
  return editorDomModel$;
}

function getConeInfoRows(selected) {
  const volumeText = `${d3.format(".1f")(selected.volume)} dB` || 'Error!';
  function degreesText(d) {
    return `${d3.format(".1f")(d)}°`;
  }
  const rows = [
    { /** row */
      columns: [
        column('col-xs-3', 'key', 'File'),
        column('col-xs-3', 'value', selected.file || 'None', 'pointer'),
        column('col-xs-3', 'key', 'Volume'),
        column('col-xs-3', 'value', volumeText, 'ew-resize', 'update-selected-cone-volume')
      ]
    },
    { /** row */
      columns: [
        column('col-xs-3', 'key', 'Spread'),
        column('col-xs-3', 'value', selected.spread),
        column('col-xs-3', 'key', 'Latitude'),
        column('col-xs-3', 'value', degreesText(selected.latitude), 'ew-resize', 'update-cone-latitude'),
      ]
    },
    { /** row */
      columns: [
        column('col-xs-6', 'value', 'Delete'),
        column('col-xs-3', 'key', 'Longitude'),
        column('col-xs-3', 'value', degreesText(selected.longitude), 'ew-resize', 'update-cone-longitude'),
      ]
    }
  ];
  return rows;
}

/**
 * Get all of the textual key and value rows and columns for an Object Parent.
 * TODO: Still needs a lot of DRY-ing
 */
function getObjectInfoRows(selected) {
  const { position, cones, velocity } = selected;
  const fmtNum = d3.format(".1f");
  return [
    { /** New row */
      columns: [
        column('col-xs-3', 'key', 'File'),
        column('col-xs-3', 'value', selected.file || 'None', 'pointer')
      ].concat(draggableKeyValue(
        'Volume', 
        d => `${d3.format(".1f")(d.volume)} dB` || 'Error!',
        'update-selected-object-volume'
      )(selected))
    },
    { /** row */
      columns: [
        column('col-xs-3', 'key', 'x'),
        column(
          'col-xs-3', 'value', fmtNum(position.x), 'ew-resize', 
          'update-selected-parent-object-position', 
          dx => new THREE.Vector3(dx, 0, 0)
        ),
        column('col-xs-3', 'key', 'Cones'),
        column('col-xs-3', '', cones.length)
      ]
    },
    { /** row */
      columns: [
        column('col-xs-3', 'key', 'y'),
        column(
          'col-xs-3', 'value', fmtNum(position.y), 'ew-resize', 
          'update-selected-parent-object-position', 
          dx => new THREE.Vector3(0, dx, 0)
        ),
        column('col-xs-3', 'key', 'Velocity'),
        column('col-xs-3', 'value', d3.format(".2f")(velocity), 'ew-resize', 'velocity')
      ]
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
          class: 'col-xs-3',
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
        },
        {
          class: 'col-xs-3',
          span_class: 'value',
          span_styles: {
            cursor: 'pointer'
          },
          text: 'Add Trajectory',
          registerAction: ({ node, actionSubject }) => {
            observableFromD3Event(d3.select(node))('click')
              .map(() => ({
                actionType: 'add-trajectory'
              }))
              .subscribe(actionSubject);
          }
        },
      ]
    }
  ];
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

function draggableKeyValue(keyText, valueText, actionType, actionMap) {
  return function(selected) {
    return [
      column('col-xs-3', 'key', keyText),
      column('col-xs-3', 'value', valueText(selected), 'ew-resize', actionType, actionMap)
    ];
  };
}

function registerTextDragAction(actionType, mapper) {
  return function({ node, actionSubject }) {
    const dragAction$ = getTextDragAction$(node)
      .map(mapper ? mapper : x => x)
      .map(value => ({
        actionType,
        value
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
      const { node } = eventObj;
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

function accumulateDom(domUpdate$) {
  return stream
    .just(getFirstDom())
    .concat(domUpdate$)
    .scan(apply);
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
    .just(45);
  const longitude$ = stream
    .just(-135);
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
  return combineLatestObj({
    renderer$,
    scene$,
    camera$
  })
  .map(({ renderer, scene, camera }) => () => {
    renderer.render(scene, camera);
  });
}

function tweenObjectVolume({ destination, key, duration }) {
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
      const sceneSelection = d3.select(scene);
      const parents = joinObjectParents({ objects, sceneSelection });
      const trajectories = joinTrajectories(parents);
      // console.log(scene.children);
      // const _objects = joinChildObjects(parents);
      // const cones = joinCones(parents);
      // parents.each(function(parent) {
      //   d3.select(this)
      //     .selectAll()
      // });
      return scene;
    });
}

function joinTrajectories(parents) {
  if (parents.size() > 0) {
    const join = parents
      .selectAll()
      .filter(function(d) {
        return d.type === 'trajectory';
      })
      /** NOTE: Key function is very important! */
      .data(({ curve }) => [{ type: 'trajectory', curve }], d => d.type); 
    const enter = join
      .enter()
      .append(function({ curve }) {
        debug('reducer:curve')('enter curve');
        const geometry = new THREE.TubeGeometry(curve, 100, 0.05, 8, curve.closed);
  			const material = new THREE.MeshPhongMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.5
        });
        const trajectory = new THREE.Mesh(geometry, material);
        trajectory.castShadow = true;
        return trajectory;
      });
  }
}

function joinCones(objects) {
  let join = objects
		.selectAll()
		.filter(function(d) {
		  return d.type === 'cone_parent';
		})
		.data(function(d) { return d.cones || [] });
	join
		.exit()
		.each(function(d) {
		  console.warn('exit');
			this.parent.remove(this);
		});
	const enter = join
	  .enter()
	  .append(getNewCone)
	  .each(d => d.type = 'cone_parent');
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
	coneParent._type = 'cone_parent';
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
  join
    .exit()
    .remove();
  const enter = join
    .enter()
    .append(() => new THREE.Object3D());
  /** Add child object, i.e. the sphere */
  enter
    .append(getNewObject)
    .each(function() {
      this._type = 'object';
    });
  const parents = enter
    .merge(join)
    .each(function(parent) {
      this.position.copy(parent.position);
    });
  const childObjects = parents
    .select(function() {
      return this.getObjectByProperty('_type', 'object');
    })
    .each(updateObjectRadius)
    .each(updateObjectOpacity)
    .each(updateObjectPosition);
  joinCones(childObjects);
  return parents;
}

function updateObjectPosition(d) {
  this.position.copy(d.trajectoryOffset);
}
  
function getNewObject() {
  const geometry = new THREE.SphereGeometry(0.1, 30, 30);
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(0, 0, 0),
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide
  });
  // material.depthTest = false;
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