import { Node, Transform } from "../src/index";
import { vec3, quat, mat4 } from "@alipay/o3-math";

describe("Transform", () => {
  const node = new Node();
  const transform = node.transform;

  it("constructor", () => {
    expect(transform.position).toEqual(vec3.create());
    expect(transform.rotation).toEqual(vec3.create());
    expect(transform.rotationQuaternion).toEqual(quat.create());
    expect(transform.worldMatrix).toEqual(mat4.create());
    expect(transform.worldPosition).toEqual(vec3.create());
    expect(transform.worldRotation).toEqual(vec3.create());
  });

  describe("single node", () => {
    it("set position", () => {});

    it("set rotation", () => {});

    it("set rotation quat", () => {});

    it("set scale", () => {});

    it("set local matrix", () => {});

    it("set world matrix", () => {});

    it("set world postion", () => {});

    it("set world rotation", () => {});

    it("set world rotation quat", () => {});

    it("rotate", () => {});

    it("rotate by axis", () => {});

    it("lookat", () => {});
  });

  describe("has parent node", () => {
    it("set position", () => {});

    it("set rotation", () => {});

    it("set rotation quat", () => {});

    it("set scale", () => {});

    it("set local matrix", () => {});

    it("set world matrix", () => {});

    it("set world postion", () => {});

    it("set world rotation", () => {});

    it("set world rotation quat", () => {});

    it("rotate", () => {});

    it("rotate by axis", () => {});

    it("lookat", () => {});
  });
});
