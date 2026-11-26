import {
  Camera,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderQueue,
  Scene,
  ShadowCascadesMode,
  ShadowType,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  createFarShadowMeshProxy,
  createFarShadowRenderersProxy,
  setFarShadowCascadeProxy
} from "@galacean/engine-project/rendering/FarShadowCascadeProxy";
import { afterAll, beforeAll, expect, it } from "vitest";

let engine: WebGLEngine;

beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
});

afterAll(() => engine.destroy());

it("uses high-LOD geometry in cascade 0 and lowest-LOD proxies in cascade >= 1 without duplicate submission", () => {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.castShadows = true;
  scene.shadowCascades = ShadowCascadesMode.TwoCascades;
  scene.shadowDistance = 120;
  scene.shadowTwoCascadeSplits = 0.25;

  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(0, 6, 20);
  camera.entity.transform.lookAt(new Vector3(0, 0, 0));

  const lightEntity = scene.createRootEntity();
  lightEntity.transform.setRotation(-45, 30, 0);
  const light = lightEntity.addComponent(DirectLight);
  light.shadowType = ShadowType.SoftLow;

  const material = new PBRMaterial(engine);
  const highMesh = PrimitiveMesh.createSphere(engine, 2, 24);
  const lowMesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);

  // 1. Multi-renderer LOD group (e.g. tree / template model) placed inside both cascades.
  const treeRoot = scene.createRootEntity("Tree");
  treeRoot.transform.setPosition(0, 0, 8);
  const lod0A = treeRoot.createChild("LOD0-A").addComponent(MeshRenderer);
  const lod0B = treeRoot.createChild("LOD0-B").addComponent(MeshRenderer);
  const lod2 = treeRoot.createChild("LOD2").addComponent(MeshRenderer);
  for (const r of [lod0A, lod0B]) {
    r.mesh = highMesh;
    r.setMaterial(material);
    r.castShadows = true;
  }
  lod2.mesh = lowMesh;
  lod2.setMaterial(material);
  lod2.enabled = false;
  lod2.castShadows = false;
  const groupProxy = createFarShadowRenderersProxy([lod2]);
  setFarShadowCascadeProxy(lod0A, groupProxy);
  setFarShadowCascadeProxy(lod0B, groupProxy);
  setFarShadowCascadeProxy(lod2, groupProxy);

  // 2. Single-renderer mesh substitute (e.g. RockLodView).
  const rock = scene.createRootEntity("Rock").addComponent(MeshRenderer);
  rock.entity.transform.setPosition(3, 0, 8);
  rock.mesh = highMesh;
  rock.setMaterial(material);
  rock.castShadows = true;
  setFarShadowCascadeProxy(rock, createFarShadowMeshProxy(lowMesh));

  // 3. Non-shadow-casting model with proxy must still cast zero shadows in cascade 1.
  const noShadow = scene.createRootEntity("NoShadow").addComponent(MeshRenderer);
  noShadow.entity.transform.setPosition(-3, 0, 8);
  noShadow.mesh = highMesh;
  noShadow.setMaterial(material);
  noShadow.castShadows = false;
  setFarShadowCascadeProxy(noShadow, createFarShadowMeshProxy(lowMesh));

  const seenPrimitivesByCascade: Array<Array<unknown>> = [[], []];
  const origRender = RenderQueue.prototype.render;
  let shadowCallIndex = 0;
  RenderQueue.prototype.render = function (context, stage, ...rest) {
    if (String(stage) === "ShadowCaster") {
      // Two render calls per cascade (opaqueQueue then alphaTestQueue).
      const cascade = Math.floor(shadowCallIndex / 2);
      shadowCallIndex++;
      if (cascade < 2) {
        for (const el of this.elements) {
          seenPrimitivesByCascade[cascade].push(el.primitive);
        }
      }
    }
    return origRender.call(this, context, stage, ...rest);
  };

  try {
    engine.update();
    // Cascade 0: high-LOD meshes only (lod0A + lod0B + rock = 3 highMesh submissions, 0 lowMesh).
    expect(seenPrimitivesByCascade[0].filter((p) => p === highMesh._primitive)).toHaveLength(3);
    expect(seenPrimitivesByCascade[0].filter((p) => p === lowMesh._primitive)).toHaveLength(0);

    // Cascade 1: deduplicated low-LOD proxies only (1 for tree group + 1 for rock = 2 lowMesh, 0 highMesh).
    expect(seenPrimitivesByCascade[1].filter((p) => p === highMesh._primitive)).toHaveLength(0);
    expect(seenPrimitivesByCascade[1].filter((p) => p === lowMesh._primitive)).toHaveLength(2);
    // Rock renderer mesh must remain restored to highMesh for camera rendering.
    expect(rock.mesh).toBe(highMesh);
  } finally {
    RenderQueue.prototype.render = origRender;
    highMesh.destroy();
    lowMesh.destroy();
    material.destroy();
    scene.destroy();
  }
});
