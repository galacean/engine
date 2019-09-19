describe("Oasis Base Util Test", () => {
  const func = Array.isArray;
  describe("Utils.isArray is not Array.isArray", () => {
    beforeEach(()=>{
      delete Array.isArray;
    });

    it("Float32Array is not Array if Array.isArray is undefined", function() {
      const { Util } = require("../src/Util");
      expect("isArray" in Array).toBeFalsy();
      const result = Util.isArray(new Float32Array([1, 2, 3]));
      expect(result).toBeFalsy();
    });

    it("[] is Array if Array.isArray is undefined", function() {
      const { Util } = require("../src/Util");
      expect("isArray" in Array).toBeFalsy();
      const result = Util.isArray([]);
      expect(result).toBeTruthy();
    });
  });

  describe("Utils.isArray", () => {
    beforeEach(()=>{
      Array.isArray = func;
    });
    it("Float32Array is not Array", () => {
      const { Util } = require("../src/Util");
      const result = Util.isArray(new Float32Array([1, 2, 3]));
      expect(result).toBeFalsy();
    });

    it("[] is Array", () => {
      const { Util } = require("../src/Util");
      const result = Util.isArray([]);
      expect(result).toBeTruthy();
    });
  });

  describe("Utils.clone", () => {
    beforeEach(()=>{
      Array.isArray = func;
    });
    it("should null clone is null", function() {
      const { Util } = require("../src/Util");
      const n = null;
      expect(Util.clone(n)).toBeNull();
    });

    it("should number is number", function() {
      const { Util } = require("../src/Util");
      const n = 1;
      expect(Util.clone(n)).toEqual(n);
    });

    it("items of object are equals", function() {
      const { Util } = require("../src/Util");
      const obj = {
        a: 1,
        b: { c: 1 },
        c: [1, 2, 3]
      };

      expect(Util.clone(obj)).toEqual(obj);
    });

    it("items of array are equals", function() {
      const { Util } = require("../src/Util");
      const array = [{ a: 1 }, { b: 1 }];
      expect(Util.clone(array)).toEqual(array);
    });
  });
});
