import {Util} from '../src/Util';

describe.only('Time', () => {

	it('isArray', () => {
		let aa = [22,33];
		expect(Util.isArray([])).to.be.true;
		expect(Util.isArray([1])).to.be.true;
		expect(Util.isArray(aa)).to.be.true;
		expect(Util.isArray(1)).to.be.false;
		expect(Util.isArray({})).to.be.false;
	});

	it('clone', () => {
		let aa = {
			bb: [12, 23, 12, {
				cc: 22
			}],
			dd: 33
		};

		let cloneAA = Util.clone(aa);

		expect(aa).to.not.equal(cloneAA);
		expect(aa).to.deep.equal(cloneAA);
	});
});
