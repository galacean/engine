import { SpriteMaskInteraction } from "./2d";
import { Engine } from "./Engine";
import { RenderQueueMaskType } from "./RenderPipeline/enums/RenderQueueMaskType";
import { ContentRestorer } from "./asset/ContentRestorer";
import { Buffer } from "./graphic/Buffer";
import { VertexElement } from "./graphic/VertexElement";
import { BufferBindFlag } from "./graphic/enums/BufferBindFlag";
import { BufferUsage } from "./graphic/enums/BufferUsage";
import { MeshTopology } from "./graphic/enums/MeshTopology";
import { VertexElementFormat } from "./graphic/enums/VertexElementFormat";
import { BlinnPhongMaterial, Material } from "./material";
import { PrefilteredDFG } from "./material/utils/PrefilteredDFG";
import { ModelMesh } from "./mesh";
import { Shader } from "./shader/Shader";
import { BlendFactor } from "./shader/enums/BlendFactor";
import { BlendOperation } from "./shader/enums/BlendOperation";
import { ColorWriteMask } from "./shader/enums/ColorWriteMask";
import { CompareFunction } from "./shader/enums/CompareFunction";
import { CullMode } from "./shader/enums/CullMode";
import { RenderQueueType } from "./shader/enums/RenderQueueType";
import { RenderStateElementKey } from "./shader/enums/RenderStateElementKey";
import { StencilOperation } from "./shader/enums/StencilOperation";
import { Texture, Texture2D, TextureCube, TextureCubeFace } from "./texture";
import { Texture2DArray } from "./texture/Texture2DArray";
import { TextureFormat } from "./texture/enums/TextureFormat";
import { Color } from "@galacean/engine-math";

/**
 * @internal
 */
export class BasicResources {
  private static _maskReadInsideRenderStates: RenderStateElementMap = null;
  private static _maskReadOutsideRenderStates: RenderStateElementMap = null;
  private static _maskWriteIncrementRenderStates: RenderStateElementMap = null;
  private static _maskWriteDecrementRenderStates: RenderStateElementMap = null;

  static getMaskInteractionRenderStates(maskInteraction: SpriteMaskInteraction): RenderStateElementMap {
    const visibleInsideMask = maskInteraction === SpriteMaskInteraction.VisibleInsideMask;
    let renderStates: RenderStateElementMap;
    let compareFunction: CompareFunction;

    if (visibleInsideMask) {
      renderStates = BasicResources._maskReadInsideRenderStates;
      if (renderStates) {
        return renderStates;
      }
      BasicResources._maskReadInsideRenderStates = renderStates = <RenderStateElementMap>{};
      compareFunction = CompareFunction.LessEqual;
    } else {
      renderStates = BasicResources._maskReadOutsideRenderStates;
      if (renderStates) {
        return renderStates;
      }
      BasicResources._maskReadOutsideRenderStates = renderStates = <RenderStateElementMap>{};
      compareFunction = CompareFunction.Greater;
    }

    renderStates[RenderStateElementKey.StencilStateEnabled] = true;
    renderStates[RenderStateElementKey.StencilStateWriteMask] = 0x00;
    renderStates[RenderStateElementKey.StencilStateReferenceValue] = 1;
    renderStates[RenderStateElementKey.StencilStateCompareFunctionFront] = compareFunction;
    renderStates[RenderStateElementKey.StencilStateCompareFunctionBack] = compareFunction;

    return renderStates;
  }

  static getMaskTypeRenderStates(maskType: RenderQueueMaskType): RenderStateElementMap {
    const isIncrement = maskType === RenderQueueMaskType.Increment;
    let renderStates: RenderStateElementMap;
    let passOperation: StencilOperation;

    if (isIncrement) {
      renderStates = BasicResources._maskWriteIncrementRenderStates;
      if (renderStates) {
        return renderStates;
      }
      BasicResources._maskWriteIncrementRenderStates = renderStates = <RenderStateElementMap>{};
      passOperation = StencilOperation.IncrementSaturate;
    } else {
      renderStates = BasicResources._maskWriteDecrementRenderStates;
      if (renderStates) {
        return renderStates;
      }
      BasicResources._maskWriteDecrementRenderStates = renderStates = <RenderStateElementMap>{};
      passOperation = StencilOperation.DecrementSaturate;
    }

    renderStates[RenderStateElementKey.StencilStateEnabled] = true;
    renderStates[RenderStateElementKey.StencilStatePassOperationFront] = passOperation;
    renderStates[RenderStateElementKey.StencilStatePassOperationBack] = passOperation;
    renderStates[RenderStateElementKey.StencilStateCompareFunctionFront] = CompareFunction.Always;
    renderStates[RenderStateElementKey.StencilStateCompareFunctionBack] = CompareFunction.Always;
    const failStencilOperation = StencilOperation.Keep;
    renderStates[RenderStateElementKey.StencilStateFailOperationFront] = failStencilOperation;
    renderStates[RenderStateElementKey.StencilStateFailOperationBack] = failStencilOperation;
    renderStates[RenderStateElementKey.StencilStateZFailOperationFront] = failStencilOperation;
    renderStates[RenderStateElementKey.StencilStateZFailOperationBack] = failStencilOperation;
    renderStates[RenderStateElementKey.BlendStateColorWriteMask0] = ColorWriteMask.None;
    renderStates[RenderStateElementKey.DepthStateEnabled] = false;
    renderStates[RenderStateElementKey.RasterStateCullMode] = CullMode.Off;

    return renderStates;
  }

  /**
   * Use triangle to blit texture, ref: https://michaldrobot.com/2014/04/01/gcn-execution-patterns-in-full-screen-passes/ .
   */
  readonly blitMesh: ModelMesh;
  readonly flipYBlitMesh: ModelMesh;

  readonly whiteTexture2D: Texture2D;
  readonly whiteTextureCube: TextureCube;
  readonly whiteTexture2DArray: Texture2DArray;
  readonly uintWhiteTexture2D: Texture2D;

  private _blitMaterial: Material;
  private _blitScreenMaterial: Material;
  private _spriteDefaultMaterial: Material;
  private _textDefaultMaterial: Material;
  private _spriteMaskDefaultMaterial: Material;
  private _meshMagentaMaterial: Material;
  private _particleMagentaMaterial: Material;
  private _blinnPhongMaterial: BlinnPhongMaterial;
  private _prefilteredDFGTexture: Texture2D;

  get blitMaterial(): Material {
    return (this._blitMaterial ||= this._createBlitMaterial("Utility/Blit"));
  }

  get blitScreenMaterial(): Material {
    return (this._blitScreenMaterial ||= this._createBlitMaterial("Utility/BlitScreen"));
  }

  get spriteDefaultMaterial(): Material {
    return (this._spriteDefaultMaterial ||= this._create2DMaterial(this.engine, Shader.find("2D/Sprite")));
  }

  get textDefaultMaterial(): Material {
    return (this._textDefaultMaterial ||= this._create2DMaterial(this.engine, Shader.find("2D/Text")));
  }

  get spriteMaskDefaultMaterial(): Material {
    return (this._spriteMaskDefaultMaterial ||= this._createSpriteMaskMaterial(this.engine));
  }

  get meshMagentaMaterial(): Material {
    return (this._meshMagentaMaterial ||= this._createMagentaMaterial(this.engine, "Unlit"));
  }

  get particleMagentaMaterial(): Material {
    return (this._particleMagentaMaterial ||= this._createMagentaMaterial(this.engine, "Particle"));
  }

  get prefilteredDFGTexture(): Texture2D {
    return this._prefilteredDFGTexture;
  }

  constructor(public engine: Engine) {
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

    this.blitMesh = this._createBlitMesh(engine, vertices);
    this.flipYBlitMesh = this._createBlitMesh(engine, flipYVertices);

    // Create white and magenta textures
    const whitePixel = new Uint8Array([255, 255, 255, 255]);

    this.whiteTexture2D = this._create1x1Texture(
      engine,
      TextureType.Texture2D,
      TextureFormat.R8G8B8A8,
      whitePixel,
      true
    );
    this.whiteTextureCube = this._create1x1Texture(
      engine,
      TextureType.TextureCube,
      TextureFormat.R8G8B8A8,
      whitePixel,
      true
    );

    const isWebGL2 = engine._hardwareRenderer.isWebGL2;
    if (isWebGL2) {
      this.whiteTexture2DArray = this._create1x1Texture(
        engine,
        TextureType.Texture2DArray,
        TextureFormat.R8G8B8A8,
        whitePixel,
        true
      );

      const whitePixel32 = new Uint32Array([255, 255, 255, 255]);
      this.uintWhiteTexture2D = this._create1x1Texture(
        engine,
        TextureType.Texture2D,
        TextureFormat.R32G32B32A32_UInt,
        whitePixel32,
        false
      );
    }
  }

  /**
   * @internal
   */
  _getBlinnPhongMaterial(): BlinnPhongMaterial {
    return (this._blinnPhongMaterial ||= new BlinnPhongMaterial(this.engine));
  }

  /**
   * @internal
   */
  _initialize(): Promise<BasicResources> {
    return new Promise((resolve, reject) => {
      PrefilteredDFG.create(this.engine)
        .then((texture) => {
          this._prefilteredDFGTexture = texture;
          resolve(this);
        })
        .catch(reject);
    });
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
    pixel: Uint8Array | Uint32Array,
    isSRGBColorSpace: boolean
  ): T {
    let texture: Texture;

    switch (type) {
      case TextureType.Texture2D:
        const texture2D = new Texture2D(engine, 1, 1, format, false, isSRGBColorSpace);
        texture2D.setPixelBuffer(pixel);
        texture = texture2D;
        break;
      case TextureType.Texture2DArray:
        const texture2DArray = new Texture2DArray(engine, 1, 1, 1, format, false, isSRGBColorSpace);
        texture2DArray.setPixelBuffer(0, pixel);
        texture = texture2DArray;
        break;
      case TextureType.TextureCube:
        const textureCube = new TextureCube(engine, 1, format, false, isSRGBColorSpace);
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

  private _create2DMaterial(engine: Engine, shader: Shader): Material {
    const material = new Material(engine, shader);
    const renderState = material.renderState;
    const target = renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.sourceAlphaBlendFactor = BlendFactor.One;
    target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
    renderState.depthState.writeEnabled = false;
    renderState.rasterState.cullMode = CullMode.Off;
    renderState.renderQueueType = RenderQueueType.Transparent;
    material.isGCIgnored = true;
    return material;
  }

  private _createMagentaMaterial(engine: Engine, shaderName: string): Material {
    const material = new Material(engine, Shader.find(shaderName));
    material.isGCIgnored = true;
    material.shaderData.setColor("material_BaseColor", new Color(1.0, 0.0, 1.01, 1.0));
    return material;
  }

  private _createBlitMaterial(shaderName: string): Material {
    const material = new Material(this.engine, Shader.find(shaderName));
    material._addReferCount(1);
    material.renderState.depthState.enabled = false;
    material.renderState.depthState.writeEnabled = false;
    return material;
  }

  private _createSpriteMaskMaterial(engine: Engine): Material {
    const material = new Material(engine, Shader.find("2D/SpriteMask"));
    material.isGCIgnored = true;
    return material;
  }
}

enum TextureType {
  Texture2D,
  TextureCube,
  Texture2DArray
}

export type RenderStateElementMap = Record<RenderStateElementKey, number | boolean>;
