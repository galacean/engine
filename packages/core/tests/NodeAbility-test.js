import { Entity } from "../src/Entity";
import { Component } from "../src/Component";

describe("Component", () => {
  describe("Component base class", () => {
    it("constructor()", () => {
      let ability = new Component(new Entity());
      expect(ability.node).is.instanceof(Entity);
    });

    it("update() trigger start/enabled event", () => {
      let ability = new Component(new Entity());
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
