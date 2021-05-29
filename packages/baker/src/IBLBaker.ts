import {
  Camera,
  GLCapabilityType,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderBufferColorFormat,
  RenderBufferDepthFormat,
  RenderColorTexture,
  RenderTarget,
  Scene,
  Shader,
  TextureCubeFace,
  TextureCubeMap,
  TextureFilterMode,
  Vector2
} from "oasis-engine";
import frag from "./shader/ibl_frag";
import vertex from "./shader/vertex";

const SHADER_NAME = "Oasis-IBL-baker";
Shader.create(SHADER_NAME, vertex, frag);

/**
 * Prefilterd, Mipmaped Environment map.
 */
export class IBLBaker {
  /**
   * Bake from Cube texture.
   * @param texture - Cube texture
   */
  static fromTextureCubeMap(texture: TextureCubeMap): RenderColorTexture {
    const engine = texture.engine;
    const originalScene = engine.sceneManager.activeScene;
    const isPaused = engine.isPaused;
    const bakerSize = texture.width;
    const bakerMipmapCount = texture.mipmapCount;
    const isHDR = texture._isHDR;
    const supportFloatTexture = engine._hardwareRenderer.canIUse(GLCapabilityType.textureFloat);

    engine.pause();

    // prepare baker scene
    const bakerScene = new Scene(engine);
    engine.sceneManager.activeScene = bakerScene;
    const bakerEntity = bakerScene.createRootEntity("IBL Baker Entity");
    const bakerCamera = bakerEntity.addComponent(Camera);
    bakerCamera.enableFrustumCulling = false;
    const bakerMaterial = new Material(engine, Shader.find(SHADER_NAME));
    const bakerRenderer = bakerEntity.addComponent(MeshRenderer);
    const bakerShaderData = bakerMaterial.shaderData;
    bakerRenderer.mesh = PrimitiveMesh.createPlane(engine, 2, 2);
    bakerRenderer.setMaterial(bakerMaterial);

    const renderColorTexture = new RenderColorTexture(
      engine,
      bakerSize,
      bakerSize,
      isHDR && supportFloatTexture ? RenderBufferColorFormat.R32G32B32A32 : undefined,
      true,
      true
    );
    renderColorTexture.filterMode = TextureFilterMode.Trilinear;
    renderColorTexture._isHDR = isHDR;

    const renderTarget = new RenderTarget(
      engine,
      bakerSize,
      bakerSize,
      renderColorTexture,
      RenderBufferDepthFormat.Depth
    );
    bakerCamera.renderTarget = renderTarget;

    // render
    bakerShaderData.setTexture("environmentMap", texture);
    bakerShaderData.setVector2("textureInfo", new Vector2(bakerSize, bakerMipmapCount - 1));
    // downgrade to RGBE if float texture not supported
    if (isHDR && !supportFloatTexture) {
      bakerShaderData.enableMacro("RGBE");
    }

    for (let face = 0; face < 6; face++) {
      for (let lod = 0; lod < bakerMipmapCount; lod++) {
        bakerShaderData.setFloat("face", face);
        const lodRoughness = lod / (bakerMipmapCount - 1); // linear
        // let lodRoughness = Math.pow(2, lod) / bakerSize;
        // if (lod === 0) {
        //   lodRoughness = 0;
        // }
        bakerShaderData.setFloat("lodRoughness", lodRoughness);

        bakerCamera.render(TextureCubeFace.PositiveX + face, lod);
      }
    }

    // destroy
    bakerCamera.renderTarget = null;
    bakerScene.destroy();
    renderTarget.destroy();

    // revert
    engine.sceneManager.activeScene = originalScene;
    !isPaused && engine.resume();

    return renderColorTexture;
  }
}
