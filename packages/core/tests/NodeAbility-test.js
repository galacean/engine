import { Node } from "../src/Node";
import { NodeAbility } from "../src/NodeAbility";

describe("NodeAbility", () => {
  describe("NodeAbility base class", () => {
    it("constructor()", () => {
      let ability = new NodeAbility(new Node());
      expect(ability.node).is.instanceof(Node);
    });

    it("update() trigger start/enabled event", () => {
      let ability = new NodeAbility(new Node());
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
