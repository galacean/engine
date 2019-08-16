import {Event, EventDispatcher} from '../src/Event.js';

class Node extends EventDispatcher {
	constructor(parent) {
		super();
		this._parent = parent;
	}

	get parent() {
		return this._parent;
	}
}


describe('Event', function() {
	it('constructor', () => {
		let node = new Node();

		expect(node._listeners).to.be.an("object");
		expect(node.parent).to.be.undefined;
	});

	it('addEventListener & trigger', (done) => {
		let node = new Node();
		let i = 0;
		node.addEventListener('test', function(e) {
			expect(i).to.equal(1);
			expect(this).to.equal(node);
			expect(e.type).to.equal('test');
			expect(e.target).to.equal(node);
			expect(e.bubbles).to.be.true;
			done();
		});
		i = 1;
		var e = new Event('test', node);
		node.trigger(e);
	});

	it('hasEvent', () => {
		let node = new Node();

		expect(node.hasEvent('test')).to.be.false;

		function test() {}
		node.addEventListener('test', test);
		expect(node.hasEvent('test')).to.be.true;
		expect(node.hasEvent('test', test)).to.be.true;
	});

	it('removeEventListener', () => {
		let node = new Node();

		function test() {}
		node.addEventListener('test', test);
		node.addEventListener('test', test);
		expect(node._listeners['test'].length).to.equal(1);
		node.addEventListener('test', () => {});
		expect(node._listeners['test'].length).to.equal(2);
		node.removeEventListener('test', test);
		expect(node._listeners['test'].length).to.equal(1);
		node.removeEventListener('test');
		expect(node._listeners['test'].length).to.equal(0);
		expect(node.hasEvent('test')).to.be.false;
	});

	it('propagation', (done) => {
		let parent = new Node();
		let node = new Node(parent);

		parent.addEventListener('test', (e) => {
			expect(e.propagationStopped).to.be.false;
			done();
		});

		var e = new Event('test', node);
		node.addEventListener('test', (e) => {
			//e.stopPropagation();
			console.log(111);
		});
		node.trigger(e);
	});
});