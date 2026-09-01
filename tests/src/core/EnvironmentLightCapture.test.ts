import {
  BackgroundMode,
  Camera,
  DiffuseMode,
  DirectLight,
  EnvironmentLightCapture,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Shader,
  SkyEnvironmentCaptureMacro,
  SkyProceduralMaterial
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, expect, it } from "vitest";

describe("EnvironmentLightCapture", () => {
  it("captures an arbitrary sky material and atomically publishes diffuse and specular IBL", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const engine = await WebGLEngine.create({ canvas });
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("Environment");
    scene.sun = root.createChild("Sun").addComponent(DirectLight);

    const proceduralMaterial = new SkyProceduralMaterial(engine);
    const customMaterial = new Material(engine, Shader.find("Sky/SkyProcedural"));
    proceduralMaterial.cloneTo(customMaterial);
    proceduralMaterial.destroy();
    scene.background.mode = BackgroundMode.Sky;
    scene.background.sky.material = customMaterial;
    scene.background.sky.mesh = PrimitiveMesh.createSphere(engine, 1);

    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.setPosition(0, 0, 3);
    cameraEntity.addComponent(Camera);
    const sphere = root.createChild("Sphere");
    const renderer = sphere.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5);
    renderer.setMaterial(new PBRMaterial(engine));

    const initialDiffuseMode = scene.ambientLight.diffuseMode;
    const capture = new EnvironmentLightCapture(scene, { resolution: 16, sampleCount: 32 });
    expect(() => new EnvironmentLightCapture(scene, { resolution: 16, sampleCount: 32 })).toThrow(
      "exclusive ownership"
    );
    expect(capture.includeSun).toBe(false);
    expect(capture.requestUpdate()).toBe(1);

    for (let frame = 0; frame < 64 && capture.getSnapshot().publishedRevision === 0; frame++) {
      capture.update();
    }

    expect(capture.getSnapshot().publishedRevision).toBe(1);
    expect(scene.ambientLight.diffuseMode).toBe(DiffuseMode.SphericalHarmonics);
    expect(scene.ambientLight.specularTexture).toBeTruthy();
    expect(SkyEnvironmentCaptureMacro.Capture).toBe("SCENE_ENVIRONMENT_CAPTURE");
    expect(SkyEnvironmentCaptureMacro.IncludeSun).toBe("SCENE_ENVIRONMENT_CAPTURE_INCLUDE_SUN");
    expect(() => engine.update()).not.toThrow();

    capture.destroy();
    expect(scene.ambientLight.diffuseMode).toBe(initialDiffuseMode);
    engine.destroy();
  });
});
