import {
  Camera,
  Entity,
  BlendShape,
  SkinnedMeshRenderer,
  Shader,
  PrimitiveMesh,
  BlendShapeFrame,
  VertexBufferBinding,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  UnlitMaterial
} from "@galacean/engine-core";
import { WebGLEngine, WebGLMode } from "@galacean/engine-rhi-webgl";
import { Vector3 } from "@galacean/engine-math";
import { expect } from "chai";

describe("BlendShapeManager", () => {
  let engineWebGL2: WebGLEngine;
  let engineWebGL1: WebGLEngine;
  let rootEntity1: Entity;
  let rootEntity2: Entity;

  before(async () => {
    engineWebGL2 = await WebGLEngine.create({
      canvas: document.createElement("canvas")
    });
    engineWebGL2.canvas.resizeByClientSize();

    rootEntity1 = engineWebGL2.sceneManager.activeScene.createRootEntity("root");
    const cameraEntity = rootEntity1.createChild("camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);
    cameraEntity.transform.rotate(new Vector3(0, 0, 0));

    engineWebGL2.run();

    engineWebGL1 = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      graphicDeviceOptions: {
        webGLMode: WebGLMode.WebGL1
      }
    });
    engineWebGL1.canvas.resizeByClientSize();

    rootEntity2 = engineWebGL1.sceneManager.activeScene.createRootEntity("root");
    const cameraEntity2 = rootEntity2.createChild("camera");
    cameraEntity2.addComponent(Camera);
    cameraEntity2.transform.setPosition(0, 0, 10);
    cameraEntity2.transform.rotate(new Vector3(0, 0, 0));

    engineWebGL1.run();
  });

  it("_updateShaderData", () => {
    const skinnedMREntity = rootEntity1.createChild("skinnedMR");
    const meshRendererWebgl2 = skinnedMREntity.addComponent(SkinnedMeshRenderer);
    meshRendererWebgl2.setMaterial(new UnlitMaterial(meshRendererWebgl2.engine));
    const blendShapeWeights0_5 = new BlendShape("BlendShape1");
    blendShapeWeights0_5.addFrame(
      new BlendShapeFrame(
        0.5,
        [
          new Vector3(1, 0, 0),
          new Vector3(0, 1, 0),
          new Vector3(0, 0, 1),
          new Vector3(1, 0, 1),
          new Vector3(0, 1, 0),
          new Vector3(1, 0, 1),
          new Vector3(1, 1, 0),
          new Vector3(0, 1, 0),
          new Vector3(0, 1, 1),
          new Vector3(1, 1, 0),
          new Vector3(0, 1, 0),
          new Vector3(0, 0, 1),
          new Vector3(1, 0, 1),
          new Vector3(0, 1, 0),
          new Vector3(0, 1, 1),
          new Vector3(1, 1, 0),
          new Vector3(0, 1, 0),
          new Vector3(0, 1, 1),
          new Vector3(1, 0, 0),
          new Vector3(1, 1, 0),
          new Vector3(1, 0, 1),
          new Vector3(1, 1, 0),
          new Vector3(0, 1, 0),
          new Vector3(0, 1, 1)
        ],
        [
          new Vector3(0, 0, 1),
          new Vector3(1, 0, 0),
          new Vector3(0, 0.7, 0),
          new Vector3(-0.7, 0, 0.7),
          new Vector3(0.7, 0, -0.7),
          new Vector3(-0.5, 0.5, 0.5),
          new Vector3(0, 0, 0.7),
          new Vector3(0.7, 0, 0),
          new Vector3(-0.5, 0.5, -0.5),
          new Vector3(0, 0, 0.7),
          new Vector3(1, 0, 0),
          new Vector3(0, 0.7, 0),
          new Vector3(-0.7, 0, 0.7),
          new Vector3(0.7, 0, 0),
          new Vector3(-0.5, 0.5, -0.5),
          new Vector3(0, 0, 0.7),
          new Vector3(0.7, 0, 0),
          new Vector3(0, 0.7, -0.7),
          new Vector3(0, 0, 0.7),
          new Vector3(0.5, -0.5, -0.5),
          new Vector3(-0.5, 0.5, 0.5),
          new Vector3(0, 0, 0.7),
          new Vector3(0.7, 0, 0),
          new Vector3(-0.5, 0.5, -0.5)
        ],
        [
          new Vector3(0, 0, 1),
          new Vector3(1, 0, 0),
          new Vector3(0, 0.7, 0),
          new Vector3(-0.7, 0, 0.7),
          new Vector3(0.7, 0, -0.7),
          new Vector3(-0.5, 0.5, 0.5),
          new Vector3(0, 0, 0.7),
          new Vector3(0.7, 0, 0),
          new Vector3(-0.5, 0.5, -0.5),
          new Vector3(0, 0, 0.7),
          new Vector3(1, 0, 0),
          new Vector3(0, 0.7, 0),
          new Vector3(-0.7, 0, 0.7),
          new Vector3(0.7, 0, 0),
          new Vector3(-0.5, 0.5, -0.5),
          new Vector3(0, 0, 0.7),
          new Vector3(0.7, 0, 0),
          new Vector3(0, 0.7, -0.7),
          new Vector3(0, 0, 0.7),
          new Vector3(0.5, -0.5, -0.5),
          new Vector3(-0.5, 0.5, 0.5),
          new Vector3(0, 0, 0.7),
          new Vector3(0.7, 0, 0),
          new Vector3(-0.5, 0.5, -0.5)
        ]
      )
    );
    const blendShapeWeights0_7 = new BlendShape("BlendShape2");
    const frame = new BlendShapeFrame(
      0.7,
      [
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 1),
        new Vector3(1, 0, 1),
        new Vector3(0, 1, 0),
        new Vector3(1, 0, 1),
        new Vector3(1, 1, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 1, 1),
        new Vector3(1, 1, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 1),
        new Vector3(1, 0, 1),
        new Vector3(0, 1, 0),
        new Vector3(0, 1, 1),
        new Vector3(1, 1, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 1, 1),
        new Vector3(1, 0, 0),
        new Vector3(1, 1, 0),
        new Vector3(1, 0, 1),
        new Vector3(1, 1, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 1, 1)
      ],
      [
        new Vector3(0, 0, 1),
        new Vector3(1, 0, 0),
        new Vector3(0, 0.7, 0),
        new Vector3(-0.7, 0, 0.7),
        new Vector3(0.7, 0, -0.7),
        new Vector3(-0.5, 0.5, 0.5),
        new Vector3(0, 0, 0.7),
        new Vector3(0.7, 0, 0),
        new Vector3(-0.5, 0.5, -0.5),
        new Vector3(0, 0, 0.7),
        new Vector3(1, 0, 0),
        new Vector3(0, 0.7, 0),
        new Vector3(-0.7, 0, 0.7),
        new Vector3(0.7, 0, 0),
        new Vector3(-0.5, 0.5, -0.5),
        new Vector3(0, 0, 0.7),
        new Vector3(0.7, 0, 0),
        new Vector3(0, 0.7, -0.7),
        new Vector3(0, 0, 0.7),
        new Vector3(0.5, -0.5, -0.5),
        new Vector3(-0.5, 0.5, 0.5),
        new Vector3(0, 0, 0.7),
        new Vector3(0.7, 0, 0),
        new Vector3(-0.5, 0.5, -0.5)
      ],
      [
        new Vector3(0, 0, 1),
        new Vector3(1, 0, 0),
        new Vector3(0, 0.7, 0),
        new Vector3(-0.7, 0, 0.7),
        new Vector3(0.7, 0, -0.7),
        new Vector3(-0.5, 0.5, 0.5),
        new Vector3(0, 0, 0.7),
        new Vector3(0.7, 0, 0),
        new Vector3(-0.5, 0.5, -0.5),
        new Vector3(0, 0, 0.7),
        new Vector3(1, 0, 0),
        new Vector3(0, 0.7, 0),
        new Vector3(-0.7, 0, 0.7),
        new Vector3(0.7, 0, 0),
        new Vector3(-0.5, 0.5, -0.5),
        new Vector3(0, 0, 0.7),
        new Vector3(0.7, 0, 0),
        new Vector3(0, 0.7, -0.7),
        new Vector3(0, 0, 0.7),
        new Vector3(0.5, -0.5, -0.5),
        new Vector3(-0.5, 0.5, 0.5),
        new Vector3(0, 0, 0.7),
        new Vector3(0.7, 0, 0),
        new Vector3(-0.5, 0.5, -0.5)
      ]
    );
    blendShapeWeights0_7.addFrame(frame);
    const modelMeshWebgl2 = PrimitiveMesh.createCuboid(engineWebGL2, 1, 1, 1, false);
    modelMeshWebgl2.addBlendShape(blendShapeWeights0_5);
    modelMeshWebgl2.addBlendShape(blendShapeWeights0_7);
    modelMeshWebgl2.addBlendShape(blendShapeWeights0_7);
    modelMeshWebgl2.addBlendShape(blendShapeWeights0_5);
    modelMeshWebgl2.uploadData(false);
    meshRendererWebgl2.mesh = modelMeshWebgl2;

    engineWebGL2.update();

    // Test that shaderData contains the correct macros if useTextureMode.
    let macros = meshRendererWebgl2.shaderData.getMacros();
    expect(macros.find((macro) => macro.name === "RENDERER_HAS_BLENDSHAPE")).to.be.not.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_COUNT")).to.be.not.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_USE_TEXTURE")).to.be.not.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_HAS_NORMAL")).to.be.not.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_HAS_TANGENT")).to.be.not.undefined;

    const blendShapeWithoutNormalAndTangent = new BlendShape("BlendShape3");
    blendShapeWithoutNormalAndTangent.addFrame(0.7, [
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 0, 1),
      new Vector3(1, 0, 1),
      new Vector3(0, 1, 0),
      new Vector3(1, 0, 1),
      new Vector3(1, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 1),
      new Vector3(1, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 0, 1),
      new Vector3(1, 0, 1),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 1),
      new Vector3(1, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 1),
      new Vector3(1, 0, 0),
      new Vector3(1, 1, 0),
      new Vector3(1, 0, 1),
      new Vector3(1, 1, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 1)
    ]);
    modelMeshWebgl2.addBlendShape(blendShapeWithoutNormalAndTangent);
    modelMeshWebgl2.addBlendShape(new BlendShape("BlendShapeWithoutFrame"));
    engineWebGL2.update();

    // Test that shaderData contains the correct macros if BlendShapeFrame doesn't have normal and tangent.
    meshRendererWebgl2.shaderData.getMacros(macros);
    expect(macros.find((macro) => macro.name === "RENDERER_HAS_BLENDSHAPE")).to.be.not.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_COUNT")).to.be.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_USE_TEXTURE")).to.be.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_HAS_NORMAL")).to.be.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_HAS_TANGENT")).to.be.undefined;

    const skinnedMREntity2 = rootEntity2.createChild("skinnedMR");
    const meshRendererWebgl1 = skinnedMREntity2.addComponent(SkinnedMeshRenderer);
    const modelMeshWebgl1 = PrimitiveMesh.createCuboid(engineWebGL1, 0.5, 0.5, 0.5);
    modelMeshWebgl1.addBlendShape(blendShapeWeights0_5);
    modelMeshWebgl1.addBlendShape(blendShapeWeights0_7);
    modelMeshWebgl1.addBlendShape(blendShapeWeights0_7);
    modelMeshWebgl1.addBlendShape(blendShapeWeights0_5);
    modelMeshWebgl1.uploadData(false);
    meshRendererWebgl1.mesh = modelMeshWebgl1;
    engineWebGL1.update();

    // Test that shaderData contains the correct macros not useTextureMode.
    expect(macros.find((macro) => macro.name === "RENDERER_HAS_BLENDSHAPE")).to.be.not.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_COUNT")).to.be.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_USE_TEXTURE")).to.be.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_HAS_NORMAL")).to.be.undefined;
    expect(macros.find((macro) => macro.name === "RENDERER_BLENDSHAPE_HAS_TANGENT")).to.be.undefined;
  });

  it("_addBlendShape and _clearBlendShapes", () => {
    const modelMesh = PrimitiveMesh.createPlane(engineWebGL2, 1, 1, 1, 1);
    modelMesh.addBlendShape(new BlendShape("BlendShape1"));
    modelMesh.addBlendShape(new BlendShape("BlendShape2"));
    expect(modelMesh.blendShapeCount).to.be.equal(2);
    expect(modelMesh.blendShapes.length).to.be.equal(2);

    modelMesh.clearBlendShapes();
    expect(modelMesh.blendShapeCount).to.be.equal(0);
    expect(modelMesh.blendShapes.length).to.be.equal(0);
    expect(modelMesh["_blendShapeManager"]["_vertexElementCount"]).to.be.equal(0);
    expect(modelMesh["_blendShapeManager"]["_useBlendNormal"]).to.be.equal(false);
    expect(modelMesh["_blendShapeManager"]["_useBlendTangent"]).to.be.equal(false);
    expect(modelMesh["_blendShapeManager"]["_subDataDirtyFlags"].length).to.be.equal(0);
  });

  it("_update", () => {
    const modelMesh = PrimitiveMesh.createPlane(engineWebGL2, 1, 1, 1, 1);
    const blendShape = new BlendShape("BlendShape1");
    modelMesh.addBlendShape(blendShape);
    blendShape.addFrame(0.7, [new Vector3(1, 0, 0)], [new Vector3(0, 0, 1)], [new Vector3(1, 1, 1)]);

    // Test that _update throw deltaPositions length not same with mesh vertexCount.
    expect(() => {
      modelMesh.uploadData(true);
    }).to.throw("BlendShape frame deltaPositions length must same with mesh vertexCount");

    const modelMesh2 = PrimitiveMesh.createPlane(engineWebGL2, 1, 1, 1);
    blendShape.frames[0].deltaPositions = [
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 1),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 1)
    ];
    modelMesh2.addBlendShape(blendShape);
    modelMesh2.uploadData(true);

    const modelMesh3 = PrimitiveMesh.createCuboid(engineWebGL2, 1, 1, 1);
    modelMesh3.addBlendShape(blendShape);
    // Test that _update throw error if use released blendShape.
    expect(() => {
      modelMesh3.uploadData(false);
    }).to.throw();
  });
});
