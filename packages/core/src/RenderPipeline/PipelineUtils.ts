import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Buffer, BufferBindFlag, BufferUsage, VertexElement, VertexElementFormat } from "../graphic";
import { Material } from "../material";
import { ModelMesh } from "../mesh/ModelMesh";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { RenderTarget, Texture2D, TextureFormat } from "../texture";

/**
 * @internal
 */
export class PipelineUtils {
  private static _blitMesh: ModelMesh;
  private static _rendererShaderData = new ShaderData(ShaderDataGroup.Renderer);

  static initialize(engine: Engine) {
    const mesh = new ModelMesh(engine);
    mesh._addReferCount(1);

    mesh.setVertexElements([
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
    ]);

    // prettier-ignore
    const vertices = new Float32Array([
      -1, -1, 1, 0, 1, 
      1, -1, 1, 1, 1, 
      -1, 1, 1, 0, 0, 
      1, 1, 1, 1, 0]);

    const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static);
    mesh.setVertexBufferBinding(buffer, 20);

    const indices = new Uint8Array([1, 2, 0, 1, 3, 2]);
    mesh.setIndices(indices);

    mesh.uploadData(false);
    mesh.addSubMesh(0, indices.length);
    PipelineUtils._blitMesh = mesh;
  }

  /**
   * Recreate texture if needed.
   * @param engine - Engine
   * @param currentTexture - Current texture
   * @param width - Need texture width
   * @param height - Need texture height
   * @param format - Need texture format
   * @param mipmap - Need texture mipmap
   * @returns Texture
   */
  static recreateTextureIfNeeded(
    engine: Engine,
    currentTexture: Texture2D | null,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean
  ): Texture2D {
    if (currentTexture) {
      if (
        currentTexture.width !== width ||
        currentTexture.height !== height ||
        currentTexture.format !== format ||
        currentTexture.mipmapCount > 1 !== mipmap
      ) {
        currentTexture.destroy();
        const texture = new Texture2D(engine, width, height, format, mipmap);
        texture.isGCIgnored = true;
        return texture;
      } else {
        return currentTexture;
      }
    } else {
      const texture = new Texture2D(engine, width, height, format, mipmap);
      texture.isGCIgnored = true;
      return texture;
    }
  }

  /**
   * Recreate render target if needed.
   * @param engine - Engine
   * @param currentRenderTarget - Current render target
   * @param width - Need render target width
   * @param height - Need render target height
   * @param colorFormat - Need render target color format
   * @param depthFormat - Need render target depth format
   * @param mipmap - Need render target mipmap
   * @returns Render target
   */
  static recreateRenderTargetIfNeeded(
    engine: Engine,
    currentRenderTarget: RenderTarget | null,
    width: number,
    height: number,
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    mipmap: boolean
  ): RenderTarget {
    const currentColorTexture = <Texture2D>currentRenderTarget?.getColorTexture(0);
    const currentDepthTexture = <Texture2D>currentRenderTarget?.depthTexture;
    const colorTexture = colorFormat
      ? PipelineUtils.recreateTextureIfNeeded(engine, currentColorTexture, width, height, colorFormat, mipmap)
      : null;

    const depthTexture = depthFormat
      ? PipelineUtils.recreateTextureIfNeeded(engine, currentDepthTexture, width, height, depthFormat, mipmap)
      : null;

    if (currentColorTexture !== colorTexture || currentDepthTexture !== depthTexture) {
      currentRenderTarget?.destroy();
      currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, depthTexture);
      currentRenderTarget.isGCIgnored = true;
    }

    return currentRenderTarget;
  }

  /**
   * Blit texture
   * @param engine
   * @param source
   * @param destination
   * @param material
   * @param passIndex
   */
  static blitTexture(
    engine: Engine,
    source: Texture2D,
    destination: RenderTarget | null,
    material: Material,
    passIndex: number
  ): void {
    const rhi = engine._hardwareRenderer;

    // @todo: 重复设置
    rhi.activeRenderTargetX(destination);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, null);

    rhi.viewport(0, 0, destination.width, destination.height);
    rhi.scissor(0, 0, destination.width, destination.height);

    const rendererShaderData = PipelineUtils._rendererShaderData;
    rendererShaderData.setTexture("renderer_BlitTexture", source);
    const mesh = PipelineUtils._blitMesh;
    const pass = material.shader.subShaders[0].passes[passIndex];

    const program = pass._getShaderProgram(engine, Shader._compileMacros);
    program.bind();
    program.uploadAll(program.rendererUniformBlock, rendererShaderData);
    program.uploadAll(program.materialUniformBlock, material.shaderData);
    program.uploadUnGroupTextures();

    (pass._renderState || material.renderState)._apply(engine, false, pass._renderStateDataMap, material.shaderData);

    rhi.drawPrimitive(mesh._primitive, mesh.subMesh, program);
  }
}
