import { Node } from "../src";
import { mat4, vec3, quat, MathUtil } from "@alipay/o3-math";

describe("Node test", function() {
  const start = [
    -0.9509319067001343,
    -3.110358238220215,
    -0,
    0,
    3.1103549003601074,
    -0.9509308338165283,
    0,
    0,
    0,
    -0,
    2.999999761581421,
    0,
    0.1212138682603836,
    0.742961585521698,
    0.02145298570394516,
    1
  ];

  it("test", () => {
    const position = [];
    const rotation = [];
    const scale = [];
    mat4.decompose(start, position, rotation, scale);
    console.log("start position: ", position);
    console.log("start rotation: ", rotation);
    console.log("start scale: ", scale);

    const out = [];
    mat4.fromRotationTranslationScale(out, rotation, position, scale);
    mat4.decompose(out, position, rotation, scale);
    // console.log(position);
    // console.log(rotation);
    // console.log(scale);
    // console.log(model);
  });

  it("test node", () => {
    const node = new Node();
    node.setModelMatrix(start);
    const model = node.getModelMatrix();
    // console.log(model);
  });
});
