import { Node } from "../src/Node";

describe("Transform", () => {
  let node = new Node();

  it("constructor", () => {
    expect(node.transform.position[0]).toEqual(0);
  });
});
