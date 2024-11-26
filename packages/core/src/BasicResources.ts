import { Engine } from "./Engine";
import { ContentRestorer } from "./asset/ContentRestorer";
import { Buffer } from "./graphic/Buffer";
import { VertexElement } from "./graphic/VertexElement";
import { BufferBindFlag } from "./graphic/enums/BufferBindFlag";
import { BufferUsage } from "./graphic/enums/BufferUsage";
import { MeshTopology } from "./graphic/enums/MeshTopology";
import { VertexElementFormat } from "./graphic/enums/VertexElementFormat";
import { Material } from "./material";
import { ModelMesh } from "./mesh";
import { BlendFactor, BlendOperation } from "./shader";
import { Shader } from "./shader/Shader";
import { Texture, Texture2D, TextureCube, TextureCubeFace } from "./texture";
import { Texture2DArray } from "./texture/Texture2DArray";
import { TextureFormat } from "./texture/enums/TextureFormat";

/**
 * @internal
 */
export class BasicResources {
  /**
   * Use triangle to blit texture, ref: https://michaldrobot.com/2014/04/01/gcn-execution-patterns-in-full-screen-passes/ .
   */
  readonly blitMesh: ModelMesh;
  readonly flipYBlitMesh: ModelMesh;
  readonly blitMaterial: Material;

  readonly whiteTexture2D: Texture2D;
  readonly whiteTextureCube: TextureCube;
  readonly whiteTexture2DArray: Texture2DArray;
  readonly uintWhiteTexture2D: Texture2D;

  constructor(engine: Engine) {
    // prettier-ignore
    const vertices = new Float32Array([
      -1, -1, 0, 1, // left-bottom
      3, -1, 2, 1,  // right-bottom
      -1, 3, 0, -1 ]); // left-top

    // prettier-ignore
    const flipYVertices = new Float32Array([
      3, -1, 2, 0,  // right-bottom
      -1, -1, 0, 0, // left-bottom
      -1, 3, 0, 2]); // left-top

    const blitMaterial = new Material(engine, Shader.find("blit"));
    blitMaterial._addReferCount(1);
    blitMaterial.renderState.depthState.enabled = false;
    blitMaterial.renderState.depthState.writeEnabled = false;

    this.blitMesh = this._createBlitMesh(engine, vertices);
    this.flipYBlitMesh = this._createBlitMesh(engine, flipYVertices);
    this.blitMaterial = blitMaterial;

    // Create white and magenta textures
    const whitePixel = new Uint8Array([255, 255, 255, 255]);

    this.whiteTexture2D = this._create1x1Texture(engine, TextureType.Texture2D, TextureFormat.R8G8B8A8, whitePixel);
    this.whiteTextureCube = this._create1x1Texture(engine, TextureType.TextureCube, TextureFormat.R8G8B8A8, whitePixel);

    const isWebGL2 = engine._hardwareRenderer.isWebGL2;
    if (isWebGL2) {
      this.whiteTexture2DArray = this._create1x1Texture(
        engine,
        TextureType.Texture2DArray,
        TextureFormat.R8G8B8A8,
        whitePixel
      );

      const whitePixel32 = new Uint32Array([255, 255, 255, 255]);
      this.uintWhiteTexture2D = this._create1x1Texture(
        engine,
        TextureType.Texture2D,
        TextureFormat.R32G32B32A32_UInt,
        whitePixel32
      );
    }
  }

  private _createBlitMesh(engine: Engine, vertices: Float32Array): ModelMesh {
    const mesh = new ModelMesh(engine);
    mesh._addReferCount(1);
    mesh.setVertexElements([new VertexElement("POSITION_UV", 0, VertexElementFormat.Vector4, 0)]);
    const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static, true);
    mesh.setVertexBufferBinding(buffer, 16);
    mesh.addSubMesh(0, 3, MeshTopology.Triangles);
    engine.resourceManager.addContentRestorer(
      new (class extends ContentRestorer<ModelMesh> {
        constructor() {
          super(mesh);
        }
        restoreContent() {
          buffer.setData(buffer.data);
        }
      })()
    );
    return mesh;
  }

  private _create1x1Texture<T extends Texture>(
    engine: Engine,
    type: TextureType,
    format: TextureFormat,
    pixel: Uint8Array | Uint32Array
  ): T {
    let texture: Texture;

    switch (type) {
      case TextureType.Texture2D:
        const texture2D = new Texture2D(engine, 1, 1, format, false);
        texture2D.setPixelBuffer(pixel);
        texture = texture2D;
        break;
      case TextureType.Texture2DArray:
        const texture2DArray = new Texture2DArray(engine, 1, 1, 1, format, false);
        texture2DArray.setPixelBuffer(0, pixel);
        texture = texture2DArray;
        break;
      case TextureType.TextureCube:
        const textureCube = new TextureCube(engine, 1, format, false);
        for (let i = 0; i < 6; i++) {
          textureCube.setPixelBuffer(TextureCubeFace.PositiveX + i, pixel);
        }
        texture = textureCube;
        break;
      default:
        throw "Invalid texture type";
    }

    texture.isGCIgnored = true;
    engine.resourceManager.addContentRestorer(
      new (class extends ContentRestorer<Texture> {
        constructor() {
          super(texture);
        }
        restoreContent() {
          switch (type) {
            case TextureType.Texture2D:
              (<Texture2D>this.resource).setPixelBuffer(pixel);
              break;
            case TextureType.Texture2DArray:
              (<Texture2DArray>this.resource).setPixelBuffer(0, pixel);
              break;
            case TextureType.TextureCube:
              for (let i = 0; i < 6; i++) {
                (<TextureCube>this.resource).setPixelBuffer(TextureCubeFace.PositiveX + i, pixel);
              }
              break;
          }
        }
      })()
    );
    return texture as T;
  }
}

enum TextureType {
  Texture2D,
  TextureCube,
  Texture2DArray
}
