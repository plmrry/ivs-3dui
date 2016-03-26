import Cycle from '@cycle/core';
import CycleDOM from '@cycle/dom';
import debug from 'debug';
import d3 from 'd3';
import d3_selection from 'd3-selection';
import Rx from 'rx';
import THREE from 'three/three.js';
import _ from 'underscore';
import combineLatestObj from 'rx-combine-latest-obj';

debug.enable('*');
const stream = Rx.Observable;
Rx.config.longStackSupport = true;

THREE.Object3D.prototype.appendChild = function (c) { 
	this.add(c); 
	return c; 
};

THREE.Object3D.prototype.querySelector = function(query) {
	let key = Object.keys(query)[0];
	return this.getObjectByProperty(key, query[key]);
};

THREE.Object3D.prototype.querySelectorAll = function (query) { 
	if (typeof query === 'undefined') return this.children;
	return this.children.filter(d => _.isMatch(d, query));
};

function Selectable(array) {
	this.children = array || [];
	this.querySelector = function(query) {
		return this.children.filter(d => _.isMatch(d, query))[0];
	};
	this.querySelectorAll = function(query) {
		if (typeof query === 'undefined') return this.children;
		return this.children.filter(d => _.isMatch(d, query));
	};
	this.appendChild = function(child) {
		this.children.push(child);
		return child;
	};
	this.insertBefore = this.appendChild;
}

selectable_example()

/** Just an example! */
function selectable_example() {
	var bar = new Selectable([]);

	var foo = d3_selection
		.select(bar)
		.selectAll()
	
	var entered1 = foo
		.data([{id: 1}, {id: 2}])
		.enter()
		.append(function(d) { return d })
		
	console.log(entered1.nodes());
	console.log(bar.children);
	
	var entered2 = foo
		.data([{id: 1}, {id: 56}, {id: 45}], d => d.id)
		.enter()
		.append(d => d);
		
	console.log(entered2.nodes());
	console.log(bar.children);
	
	var battt = new Selectable(bar.children);
	
	var entered3 = d3_selection
		.select(battt)
		.selectAll()
		.data([{ id: 235 }], d => d.id)
		.enter()
		.append(d => d);
		
	console.log(battt.children);
}