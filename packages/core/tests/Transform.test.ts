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

  it("set position", () => {
    transform.position = [10, 20, 30];
    console.log(transform.position);
    console.log(transform.worldPosition);
    console.log(transform.localMatrix);
    console.log(transform.worldMatrix);
  });

  it("set rotation", () => {
    transform.rotation = [10, 20, 30];
  });
});
