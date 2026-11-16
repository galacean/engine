import {
  Camera,
  CascadedShadowCasterPass,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  ShadowType,
  TextureFormat,
  Vector3
} from "../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it.each([true, false])(
  "configures shadow storage with depth texture extension enabled=%s",
  async (withDepthTexture) => {
    const { engine, gl } = await createEngine(withDepthTexture ? [] : ["WEBGL_depth_texture"]);
    try {
      const camera = engine.sceneManager.activeScene!.createRootEntity().addComponent(Camera);
      const shadow = new CascadedShadowCasterPass(camera) as any;
      const shadowFormat = shadow._getShadowFormat();
      expect(shadowFormat).toBe(withDepthTexture ? TextureFormat.Depth16 : TextureFormat.R8G8B8A8);
      shadow._shadowMapFormat = shadowFormat;
      shadow._shadowMapSize.set(4, 4, 4, 4);
      const context = {
        setRenderTarget(target) {
          target._platformRenderTarget.activeRenderTarget(0, 0);
          gl.viewport(0, 0, 4, 4);
        }
      };
      shadow._prepareShadowMap(context);
      expect(shadow._depthTexture.format).toBe(withDepthTexture ? TextureFormat.Depth16 : TextureFormat.R8G8B8A8);
      if (!withDepthTexture) {
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        expect([...pixel]).toEqual([255, 255, 255, 255]);
      }
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      engine.destroy();
    }
  }
);

it("renders a visible shadow through the color map when depth textures are unavailable", async () => {
  const { engine, gl } = await createEngine(["WEBGL_depth_texture"]);
  try {
    const scene = engine.sceneManager.activeScene!;
    scene.shadowDistance = 20;
    const cameraEntity = scene.createRootEntity();
    cameraEntity.transform.setPosition(0, 4, 6);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = false;
    const lightEntity = scene.createRootEntity();
    lightEntity.transform.setPosition(-3, 6, 0);
    lightEntity.transform.lookAt(new Vector3());
    const light = lightEntity.addComponent(DirectLight);
    light.shadowType = ShadowType.Hard;

    const plane = scene.createRootEntity().addComponent(MeshRenderer);
    plane.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
    plane.castShadows = false;
    plane.setMaterial(new PBRMaterial(engine));
    const cubeEntity = scene.createRootEntity();
    cubeEntity.transform.setPosition(0, 0.5, 0);
    const cube = cubeEntity.addComponent(MeshRenderer);
    cube.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    cube.setMaterial(new PBRMaterial(engine));

    const unshadowed = new Uint8Array(16 * 16 * 4);
    const shadowed = new Uint8Array(unshadowed.length);
    cube.castShadows = false;
    scene._updateRendering(0);
    camera.render();
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, unshadowed);
    cube.castShadows = true;
    camera.render();
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, shadowed);
    expect(shadowed.some((value, i) => i % 4 !== 3 && value + 8 < unshadowed[i])).toBe(true);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
