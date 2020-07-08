import { Node } from "../src/Node";
import { Component } from "../src/Component";

describe("Component", () => {
  describe("Component base class", () => {
    it("constructor()", () => {
      let ability = new Component(new Node());
      expect(ability.node).is.instanceof(Node);
    });

    it("update() trigger start/enabled event", () => {
      let ability = new Component(new Node());
      let onstart = sinon.spy();
      let onenabled = sinon.spy();
      ability.addEventListener("start", onstart);
      ability.addEventListener("enabled", onenabled);
      ability.update();
      expect(onstart).is.called;
      expect(onenabled).is.called;
    });
  });
});
