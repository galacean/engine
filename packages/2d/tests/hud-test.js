import {Event, EventDispatcher} from '../src';

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

		expect(node._listeners).to.be.a(Object);
		expect(node.parent).to.be(undefined);
	});

	it('addEventListener & trigger', (done) => {
		let node = new Node();
		let i = 0;
		node.addEventListener('test', function(e) {
			expect(i).to.be(1);
			expect(this).to.be(node);
			expect(e.type).to.be('test');
			expect(e.target).to.be(node);
			expect(e.bubbles).to.be(true);
			done();
		});
		i = 1;
		var e = new Event('test', node);
		node.trigger(e);
	});
});
