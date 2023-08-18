import { BlendShape, BlendShapeFrame, PrimitiveMesh } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("BlendShape", () => {
  let engine: WebGLEngine;

  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.canvas.resizeByClientSize();

    engine.run();
  });

  it("constructor", () => {
    // Test that constructor works correctly.
    const blendShape = new BlendShape("Test Object of BlendShape");
    expect(blendShape.name).to.be.eq("Test Object of BlendShape");
  });

  it("addFrame", () => {
    const blendShape = new BlendShape("BlendShape");

    const deltaPositions = [new Vector3(1, 0, -1), new Vector3(0, 2, 7)];
    const deltaNormals = [new Vector3(3, 3, 3), new Vector3(0, 1, 2)];
    const deltaTangents = [new Vector3(0, 1, 0), new Vector3(1, 1, 1)];

    // Test that addFrame works correctly while typeof weight is number.
    blendShape.addFrame(0.1, deltaPositions, deltaNormals, deltaTangents);
    expect(blendShape.frames.length).to.be.eq(1);
    expect(blendShape["_useBlendShapeNormal"]).to.be.eq(true);
    expect(blendShape["_useBlendShapeTangent"]).to.be.eq(true);
    expect(blendShape.frames[0].deltaPositions[0]).to.deep.include({ x: 1, y: 0, z: -1 });
    expect(blendShape.frames[0].deltaPositions[1]).to.deep.include({ x: 0, y: 2, z: 7 });
    expect(blendShape.frames[0].deltaNormals[0]).to.deep.include({ x: 3, y: 3, z: 3 });
    expect(blendShape.frames[0].deltaNormals[1]).to.deep.include({ x: 0, y: 1, z: 2 });
    expect(blendShape.frames[0].deltaTangents[0]).to.deep.include({ x: 0, y: 1, z: 0 });
    expect(blendShape.frames[0].deltaTangents[1]).to.deep.include({ x: 1, y: 1, z: 1 });

    // Test that addFrame works correctly while typeof weight is BlendShapeFrame.
    const blendShapeFrame = new BlendShapeFrame(1, deltaPositions, deltaNormals, deltaTangents);
    blendShape.addFrame(blendShapeFrame);
    expect(blendShape["_useBlendShapeNormal"]).to.be.eq(true);
    expect(blendShape["_useBlendShapeTangent"]).to.be.eq(true);
    expect(blendShape.frames.length).to.be.eq(2);
    expect(blendShape.frames[1].deltaPositions[0]).to.deep.include({ x: 1, y: 0, z: -1 });
    expect(blendShape.frames[1].deltaPositions[1]).to.deep.include({ x: 0, y: 2, z: 7 });
    expect(blendShape.frames[1].deltaNormals[0]).to.deep.include({ x: 3, y: 3, z: 3 });
    expect(blendShape.frames[1].deltaNormals[1]).to.deep.include({ x: 0, y: 1, z: 2 });
    expect(blendShape.frames[1].deltaTangents[0]).to.deep.include({ x: 0, y: 1, z: 0 });
    expect(blendShape.frames[1].deltaTangents[1]).to.deep.include({ x: 1, y: 1, z: 1 });

    // Test that addFrame throw error while deltaPositions not have same length with before frame deltaPositions.
    const blendShapeFrameLessLength = new BlendShapeFrame(1, [new Vector3(1, 0, -1)]);
    expect(() => {
      blendShape.addFrame(blendShapeFrameLessLength);
    }).to.throw("Frame's deltaPositions length must same with before frame deltaPositions length.");
    expect(blendShape.frames.length).to.be.eq(2);
    expect(blendShape["_useBlendShapeNormal"]).to.be.eq(true);
    expect(blendShape["_useBlendShapeTangent"]).to.be.eq(true);

    const blendSHapeFrameBiggerLength = new BlendShapeFrame(0, [
      ...deltaPositions,
      new Vector3(3, 3, 0),
      new Vector3(-1, 2, -1)
    ]);
    expect(() => {
      blendShape.addFrame(blendSHapeFrameBiggerLength);
    }).to.throw("Frame's deltaPositions length must same with before frame deltaPositions length.");
    expect(blendShape.frames.length).to.be.eq(2);
    expect(blendShape["_useBlendShapeNormal"]).to.be.eq(true);
    expect(blendShape["_useBlendShapeTangent"]).to.be.eq(true);

    // Test that _userBlendShapeNormal and _useBlendShapeTangent change to false.
    blendShape.addFrame(0.3, deltaPositions);
    expect(blendShape.frames.length).to.be.eq(3);
    expect(blendShape["_useBlendShapeNormal"]).to.be.eq(false);
    expect(blendShape["_useBlendShapeTangent"]).to.be.eq(false);
  });

  it("clearFrames", () => {
    const blendShape = new BlendShape("BlendShape");

    const deltaPositions = [new Vector3(1, 0, -1), new Vector3(0, 2, 7)];
    const deltaNormals = [new Vector3(3, 3, 3), new Vector3(0, 1, 2)];
    const deltaTangents = [new Vector3(0, 1, 0), new Vector3(1, 1, 1)];

    const blendShapeFrame = new BlendShapeFrame(0.5, deltaPositions, deltaNormals, deltaTangents);
    blendShape.addFrame(blendShapeFrame);
    blendShape.addFrame(0.4, deltaPositions, deltaNormals, undefined);
    blendShape.addFrame(0.7, deltaPositions, undefined, deltaTangents);

    // Test that clearFrames works correctly.
    blendShape.clearFrames();

    // Test that blendShapeFrame not be released.
    expect(blendShape.frames.length).to.be.eq(0);
    expect(blendShapeFrame.weight).to.be.eq(0.5);
    expect(blendShapeFrame.deltaPositions[0]).to.deep.include({ x: 1, y: 0, z: -1 });
    expect(blendShapeFrame.deltaPositions[1]).to.deep.include({ x: 0, y: 2, z: 7 });
    expect(blendShapeFrame.deltaNormals[0]).to.deep.include({ x: 3, y: 3, z: 3 });
    expect(blendShapeFrame.deltaNormals[1]).to.deep.include({ x: 0, y: 1, z: 2 });
    expect(blendShapeFrame.deltaTangents[0]).to.deep.include({ x: 0, y: 1, z: 0 });
    expect(blendShapeFrame.deltaTangents[1]).to.deep.include({ x: 1, y: 1, z: 1 });
  });

  it("_releaseData", () => {
    const blendShape = new BlendShape("BlendShape");

    const deltaPositions = [new Vector3(1, 0, -1), new Vector3(0, 2, 7), new Vector3(3, 0, 2), new Vector3(-1, 2, -3)];
    const deltaNormals = [new Vector3(3, 3, 3), new Vector3(0, 1, 2), new Vector3(-1, -2, 1), new Vector3(-2, 0, 0)];
    const deltaTangents = [new Vector3(0, 1, 0), new Vector3(1, 1, 1), new Vector3(3, 2, 3), new Vector3(0, 2, 0)];

    const blendShapeFrame = new BlendShapeFrame(0.5, deltaPositions, deltaNormals, deltaTangents);
    blendShape.addFrame(blendShapeFrame);
    blendShape.addFrame(0.4, deltaPositions, deltaNormals, null);
    blendShape.addFrame(0.7, deltaPositions, null, deltaTangents);

    const modelMesh = PrimitiveMesh.createPlane(engine, 1, 1, 1, 1);
    modelMesh.addBlendShape(blendShape);
    modelMesh.uploadData(true);

    // Test that the frames add to blendShape not decrease.
    expect(blendShape.frames.length).to.be.eq(3);

    // Test that frames data released.
    expect(blendShape.frames[0].deltaPositions).to.be.null;
    expect(blendShape.frames[0].deltaNormals).to.be.null;
    expect(blendShape.frames[0].deltaTangents).to.be.null;
    expect(blendShape.frames[1].deltaPositions).to.be.null;
    expect(blendShape.frames[1].deltaPositions).to.be.null;
    expect(blendShape.frames[1].deltaNormals).to.be.null;
    expect(blendShape.frames[2].deltaTangents).to.be.null;
    expect(blendShape.frames[2].deltaNormals).to.be.null;
    expect(blendShape.frames[2].deltaTangents).to.be.null;
  });
});
