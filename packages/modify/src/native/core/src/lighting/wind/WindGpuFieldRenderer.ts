import { Vector4 } from "@galacean/engine-math";
import { ContentRestorer } from "../../asset/ContentRestorer";
import { Engine } from "../../Engine";
import { Material } from "../../material/Material";
import { Blitter } from "../../RenderPipeline/Blitter";
import { Shader } from "../../shader/Shader";
import { RenderTarget } from "../../texture/RenderTarget";
import { Texture2D } from "../../texture/Texture2D";
import { TextureFilterMode } from "../../texture/enums/TextureFilterMode";
import { TextureFormat } from "../../texture/enums/TextureFormat";
import { TextureWrapMode } from "../../texture/enums/TextureWrapMode";
import type { WindGpuFieldDescriptorBuffer, WindLocalFieldBounds } from "./WindTypes";
import {
  MAXIMUM_GPU_WIND_EMITTERS,
  MAXIMUM_GPU_WIND_GUSTS,
  WIND_GPU_FIELD_SHADER_NAME,
  WIND_GPU_GROUND_RESPONSE_SHADER_NAME,
  WIND_GPU_TREE_RESPONSE_SHADER_NAME
} from "./WindGpuFieldShader";
import { WindSystem } from "./WindSystem";

export interface WindGpuFieldRenderRequest extends WindLocalFieldBounds {
  readonly centerY: number;
  readonly velocityRangeMps: number;
  readonly historyInvalid: boolean;
  readonly responseDeltaTime: number;
  readonly responseRampDuration: number;
  readonly responseHistoryOffsetX: number;
  readonly responseHistoryOffsetZ: number;
}

export interface WindGpuFieldShaderSet {
  readonly field: Shader;
  readonly groundResponse: Shader;
  readonly treeResponse: Shader;
}

/** One retained mechanical-response raster that can be budgeted independently. @internal */
export enum WindGpuResponsePass {
  None = 0,
  Ground = 1 << 0,
  Flower = 1 << 1,
  TreeSlow = 1 << 2,
  TreeFast = 1 << 3,
  Tree = TreeSlow | TreeFast,
  All = Ground | Flower | Tree
}

/** Resolves the exact precompiled runtime shaders without allocating render targets or submitting a draw. */
export function registerWindGpuFieldShaders(): WindGpuFieldShaderSet {
  return Object.freeze({
    field: requireBuiltInShader(WIND_GPU_FIELD_SHADER_NAME),
    groundResponse: requireBuiltInShader(WIND_GPU_GROUND_RESPONSE_SHADER_NAME),
    treeResponse: requireBuiltInShader(WIND_GPU_TREE_RESPONSE_SHADER_NAME)
  });
}

function requireBuiltInShader(name: string): Shader {
  const shader = Shader.find(name);
  if (!shader) throw new Error(`Built-in Shader '${name}' is not registered.`);
  return shader;
}

/** Low-resolution WebGL2 fragment-compute backend for the visual local wind field. @internal */
export class WindGpuFieldRenderer {
  private readonly _material: Material;
  private readonly _responseMaterial: Material;
  private readonly _flowerResponseMaterial: Material;
  private readonly _treeSlowResponseMaterial: Material;
  private readonly _treeFastResponseMaterial: Material;
  private readonly _fieldBounds = new Vector4();
  private readonly _responseParams = new Vector4();
  private readonly _responseHistoryTransform = new Vector4();
  private readonly _olderFieldHistoryTransform = new Vector4();
  private readonly _groundReferenceGustHistory = new Vector4();
  private readonly _previousTreeSlowWindVelocity = new Vector4();
  private readonly _previousTreeFastWindVelocity = new Vector4();
  private readonly _currentTreeWindVelocity = new Vector4();
  private readonly _gustProfile0 = new Vector4();
  private readonly _gustProfile1 = new Vector4();
  private readonly _descriptors: WindGpuFieldDescriptorBuffer = {
    emitterCount: 0,
    gustCount: 0,
    emitterPositionRadius: new Float32Array(MAXIMUM_GPU_WIND_EMITTERS * 4),
    emitterDirectionStrength: new Float32Array(MAXIMUM_GPU_WIND_EMITTERS * 4),
    emitterParameters: new Float32Array(MAXIMUM_GPU_WIND_EMITTERS * 4),
    gustOriginDirection: new Float32Array(MAXIMUM_GPU_WIND_GUSTS * 4),
    gustTiming: new Float32Array(MAXIMUM_GPU_WIND_GUSTS * 4)
  };
  private _currentTarget: RenderTarget;
  private _previousTarget: RenderTarget;
  private _olderTarget: RenderTarget;
  private _currentResponseTarget: RenderTarget;
  private _previousResponseTarget: RenderTarget;
  private _currentFlowerResponseTarget: RenderTarget;
  private _previousFlowerResponseTarget: RenderTarget;
  private _currentTreeSlowResponseTarget: RenderTarget;
  private _previousTreeSlowResponseTarget: RenderTarget;
  private _currentTreeFastResponseTarget: RenderTarget;
  private _previousTreeFastResponseTarget: RenderTarget;
  private _observedEmitterRevision = -1;
  private _observedGustRevision = -1;
  private _previousFieldHistoryOffsetX = 0;
  private _previousFieldHistoryOffsetZ = 0;
  private _contentRevision = 0;
  private _fieldHistoryLength = 0;
  private _treeSlowWindHistoryValid = false;
  private _treeFastWindHistoryValid = false;
  private _groundGustHistoryValid = false;
  private _destroyed = false;

  constructor(
    private readonly _engine: Engine,
    readonly resolution: number,
    private readonly _system: WindSystem,
    responseParams: Readonly<{
      lowFrequencyHz: number;
      lowDampingRatio: number;
      highFrequencyHz: number;
      highDampingRatio: number;
      flowerFrequencyHz: number;
      flowerDampingRatio: number;
      treeSlowFrequencyHz: number;
      treeSlowDampingRatio: number;
      treeFastFrequencyHz: number;
      treeFastDampingRatio: number;
    }>
  ) {
    if (
      _system.config.maxEmitters > MAXIMUM_GPU_WIND_EMITTERS ||
      _system.config.maxActiveGusts > MAXIMUM_GPU_WIND_GUSTS
    ) {
      throw new RangeError(
        `GPU wind field supports at most ${MAXIMUM_GPU_WIND_EMITTERS} emitters and ${MAXIMUM_GPU_WIND_GUSTS} gusts`
      );
    }
    this._currentTarget = createTarget(_engine, resolution, "wind_gpu_field_current");
    this._previousTarget = createTarget(_engine, resolution, "wind_gpu_field_previous");
    this._olderTarget = createTarget(_engine, resolution, "wind_gpu_field_older");
    this._currentResponseTarget = createTarget(_engine, resolution, "wind_gpu_ground_response_current");
    this._previousResponseTarget = createTarget(_engine, resolution, "wind_gpu_ground_response_previous");
    this._currentFlowerResponseTarget = createTarget(_engine, resolution, "wind_gpu_flower_response_current");
    this._previousFlowerResponseTarget = createTarget(_engine, resolution, "wind_gpu_flower_response_previous");
    this._currentTreeSlowResponseTarget = createTarget(_engine, resolution, "wind_gpu_tree_slow_response_current");
    this._previousTreeSlowResponseTarget = createTarget(_engine, resolution, "wind_gpu_tree_slow_response_previous");
    this._currentTreeFastResponseTarget = createTarget(_engine, resolution, "wind_gpu_tree_fast_response_current");
    this._previousTreeFastResponseTarget = createTarget(_engine, resolution, "wind_gpu_tree_fast_response_previous");
    for (const target of [
      this._currentTarget,
      this._previousTarget,
      this._olderTarget,
      this._currentResponseTarget,
      this._previousResponseTarget,
      this._currentFlowerResponseTarget,
      this._previousFlowerResponseTarget,
      this._currentTreeSlowResponseTarget,
      this._previousTreeSlowResponseTarget,
      this._currentTreeFastResponseTarget,
      this._previousTreeFastResponseTarget
    ]) {
      const texture = target.getColorTexture(0) as Texture2D;
      _engine.resourceManager.addContentRestorer(
        new WindGpuFieldContentRestorer(texture, () => this._contentRevision++)
      );
    }
    const registeredShaders = registerWindGpuFieldShaders();
    const shader = registeredShaders.field;
    const material = (this._material = new Material(_engine, shader));
    material.name = "GPU wind local-field raster";
    material._addReferCount(1);
    const gust = _system.config.gust;
    this._gustProfile0.set(gust.attackSeconds, gust.holdSeconds, gust.decaySeconds, gust.frontSpeedMps);
    this._gustProfile1.set(gust.frontWidthMeters, gust.attackSeconds + gust.holdSeconds + gust.decaySeconds, 0, 0);
    material.shaderData.setVector4("material_GustProfile0", this._gustProfile0);
    material.shaderData.setVector4("material_GustProfile1", this._gustProfile1);
    const responseShader = registeredShaders.groundResponse;
    const responseMaterial = (this._responseMaterial = new Material(_engine, responseShader));
    responseMaterial.name = "GPU wind shared ground response";
    responseMaterial._addReferCount(1);
    this._responseParams.set(
      responseParams.lowFrequencyHz,
      responseParams.lowDampingRatio,
      responseParams.highFrequencyHz,
      responseParams.highDampingRatio
    );
    responseMaterial.shaderData.setVector4("material_ResponseParams", this._responseParams);
    const flowerResponseMaterial = (this._flowerResponseMaterial = new Material(_engine, responseShader));
    flowerResponseMaterial.name = "GPU wind exact flower response";
    flowerResponseMaterial._addReferCount(1);
    const flowerResponseParams = new Vector4(
      responseParams.flowerFrequencyHz,
      responseParams.flowerDampingRatio,
      responseParams.flowerFrequencyHz,
      responseParams.flowerDampingRatio
    );
    flowerResponseMaterial.shaderData.setVector4("material_ResponseParams", flowerResponseParams);

    const treeResponseShader = registeredShaders.treeResponse;
    this._treeSlowResponseMaterial = createTreeResponseMaterial(
      _engine,
      treeResponseShader,
      "GPU wind slow-tree response",
      responseParams.treeSlowFrequencyHz,
      responseParams.treeSlowDampingRatio
    );
    this._treeFastResponseMaterial = createTreeResponseMaterial(
      _engine,
      treeResponseShader,
      "GPU wind fast-tree response",
      responseParams.treeFastFrequencyHz,
      responseParams.treeFastDampingRatio
    );
  }

  get texture(): Texture2D {
    return this._currentTarget.getColorTexture(0) as Texture2D;
  }

  get previousTexture(): Texture2D {
    return this._previousTarget.getColorTexture(0) as Texture2D;
  }

  get groundResponseTexture(): Texture2D {
    return this._currentResponseTarget.getColorTexture(0) as Texture2D;
  }

  get flowerResponseTexture(): Texture2D {
    return this._currentFlowerResponseTarget.getColorTexture(0) as Texture2D;
  }

  get groundReferenceGustHistory(): Readonly<Vector4> {
    return this._groundReferenceGustHistory;
  }

  get treeSlowResponseTexture(): Texture2D {
    return this._currentTreeSlowResponseTarget.getColorTexture(0) as Texture2D;
  }

  get treeFastResponseTexture(): Texture2D {
    return this._currentTreeFastResponseTarget.getColorTexture(0) as Texture2D;
  }

  /** Monotonic signal used by the bridge to rebuild generated pixels after device restoration. */
  get contentRevision(): number {
    return this._contentRevision;
  }

  /** Rasterizes only the shared local air field. Retained receiver responses are scheduled separately. */
  renderField(exposureTexture: Texture2D, request: Readonly<WindGpuFieldRenderRequest>): void {
    if (this._destroyed) throw new Error("GPU wind field renderer has been destroyed");
    const oldest = this._olderTarget;
    this._olderTarget = this._previousTarget;
    this._previousTarget = this._currentTarget;
    this._currentTarget = oldest;
    this._publishDescriptors();
    this._fieldBounds.set(request.minimumX, request.minimumZ, request.maximumX, request.maximumZ);
    const data = this._material.shaderData;
    data.setVector4("material_FieldBounds", this._fieldBounds);
    data.setFloat("material_FieldCenterY", request.centerY);
    data.setFloat("material_VelocityRange", request.velocityRangeMps);
    data.setFloat("material_ElapsedTime", this._system.getGpuContext().elapsedTime);
    data.setFloat("material_GustStrength", this._system.getRenderFieldGustStrength());
    Blitter.blitTexture(this._engine, exposureTexture, this._currentTarget, 0, undefined, this._material, 0);
    // Do not fill previous/older history with two more immediate blits. Until ordinary field
    // updates have populated all three slots, response passes reset from the newest target.
    this._fieldHistoryLength = request.historyInvalid ? 1 : Math.min(3, this._fieldHistoryLength + 1);
    const currentGust = this._system.getGpuContext().gust;
    if (!this._groundGustHistoryValid || request.historyInvalid) {
      this._groundReferenceGustHistory.set(currentGust, currentGust, currentGust, 0);
    } else {
      this._groundReferenceGustHistory.set(
        this._groundReferenceGustHistory.y,
        this._groundReferenceGustHistory.z,
        currentGust,
        0
      );
    }
    this._groundGustHistoryValid = true;
    this._responseHistoryTransform.set(request.responseHistoryOffsetX, request.responseHistoryOffsetZ, 0, 0);
    this._olderFieldHistoryTransform.set(
      request.responseHistoryOffsetX + this._previousFieldHistoryOffsetX,
      request.responseHistoryOffsetZ + this._previousFieldHistoryOffsetZ,
      0,
      0
    );

    if (request.historyInvalid) {
      this._previousFieldHistoryOffsetX = 0;
      this._previousFieldHistoryOffsetZ = 0;
    } else {
      this._previousFieldHistoryOffsetX = request.responseHistoryOffsetX;
      this._previousFieldHistoryOffsetZ = request.responseHistoryOffsetZ;
    }

    const windContext = this._system.getGpuContext();
    const wind = windContext.velocityWS;
    const canopyMultiplier = windContext.layerMultipliers[1];
    this._currentTreeWindVelocity.set(wind[0] * canopyMultiplier, wind[2] * canopyMultiplier, 0, 0);
  }

  /** Rasterizes exactly one retained receiver response so callers can cap frame-local GPU work. */
  renderResponse(
    pass: WindGpuResponsePass,
    exposureTexture: Texture2D,
    previousExposureTexture: Texture2D,
    request: Readonly<WindGpuFieldRenderRequest>
  ): void {
    if (this._destroyed) throw new Error("GPU wind field renderer has been destroyed");
    const resetHistory = request.historyInvalid || this._fieldHistoryLength < 3;
    let completedResponse: RenderTarget;
    switch (pass) {
      case WindGpuResponsePass.Ground:
        completedResponse = this._currentResponseTarget;
        this._currentResponseTarget = this._previousResponseTarget;
        this._previousResponseTarget = completedResponse;
        this._renderGroundResponse(
          this._responseMaterial,
          this._previousResponseTarget,
          this._currentResponseTarget,
          resetHistory,
          request
        );
        break;
      case WindGpuResponsePass.Flower:
        completedResponse = this._currentFlowerResponseTarget;
        this._currentFlowerResponseTarget = this._previousFlowerResponseTarget;
        this._previousFlowerResponseTarget = completedResponse;
        this._renderGroundResponse(
          this._flowerResponseMaterial,
          this._previousFlowerResponseTarget,
          this._currentFlowerResponseTarget,
          resetHistory,
          request
        );
        break;
      case WindGpuResponsePass.TreeSlow:
        completedResponse = this._currentTreeSlowResponseTarget;
        this._currentTreeSlowResponseTarget = this._previousTreeSlowResponseTarget;
        this._previousTreeSlowResponseTarget = completedResponse;
        if (!this._treeSlowWindHistoryValid || request.historyInvalid) {
          this._previousTreeSlowWindVelocity.copyFrom(this._currentTreeWindVelocity);
        }
        this._renderTreeResponse(
          this._treeSlowResponseMaterial,
          this._previousTreeSlowResponseTarget,
          this._currentTreeSlowResponseTarget,
          exposureTexture,
          previousExposureTexture,
          this._previousTreeSlowWindVelocity,
          resetHistory,
          request
        );
        this._previousTreeSlowWindVelocity.copyFrom(this._currentTreeWindVelocity);
        this._treeSlowWindHistoryValid = true;
        break;
      case WindGpuResponsePass.TreeFast:
        completedResponse = this._currentTreeFastResponseTarget;
        this._currentTreeFastResponseTarget = this._previousTreeFastResponseTarget;
        this._previousTreeFastResponseTarget = completedResponse;
        if (!this._treeFastWindHistoryValid || request.historyInvalid) {
          this._previousTreeFastWindVelocity.copyFrom(this._currentTreeWindVelocity);
        }
        this._renderTreeResponse(
          this._treeFastResponseMaterial,
          this._previousTreeFastResponseTarget,
          this._currentTreeFastResponseTarget,
          exposureTexture,
          previousExposureTexture,
          this._previousTreeFastWindVelocity,
          resetHistory,
          request
        );
        this._previousTreeFastWindVelocity.copyFrom(this._currentTreeWindVelocity);
        this._treeFastWindHistoryValid = true;
        break;
      default:
        throw new RangeError("GPU wind response renderer requires exactly one response pass");
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    destroyTarget(this._currentTarget);
    destroyTarget(this._previousTarget);
    destroyTarget(this._olderTarget);
    destroyTarget(this._currentResponseTarget);
    destroyTarget(this._previousResponseTarget);
    destroyTarget(this._currentFlowerResponseTarget);
    destroyTarget(this._previousFlowerResponseTarget);
    destroyTarget(this._currentTreeSlowResponseTarget);
    destroyTarget(this._previousTreeSlowResponseTarget);
    destroyTarget(this._currentTreeFastResponseTarget);
    destroyTarget(this._previousTreeFastResponseTarget);
    this._material._addReferCount(-1);
    this._material.destroy();
    this._responseMaterial._addReferCount(-1);
    this._responseMaterial.destroy();
    this._flowerResponseMaterial._addReferCount(-1);
    this._flowerResponseMaterial.destroy();
    destroyOwnedMaterial(this._treeSlowResponseMaterial);
    destroyOwnedMaterial(this._treeFastResponseMaterial);
  }

  private _publishDescriptors(): void {
    const emitterRevision = this._system.getEmitterRevision();
    const gustRevision = this._system.getGustRevision();
    if (emitterRevision === this._observedEmitterRevision && gustRevision === this._observedGustRevision) return;
    this._system.writeGpuFieldDescriptors(this._descriptors);
    const data = this._material.shaderData;
    if (emitterRevision !== this._observedEmitterRevision) {
      data.setFloatArray("material_EmitterPositionRadius", this._descriptors.emitterPositionRadius);
      data.setFloatArray("material_EmitterDirectionStrength", this._descriptors.emitterDirectionStrength);
      data.setFloatArray("material_EmitterParameters", this._descriptors.emitterParameters);
      data.setInt("material_EmitterCount", this._descriptors.emitterCount);
      this._observedEmitterRevision = emitterRevision;
    }
    if (gustRevision !== this._observedGustRevision) {
      data.setFloatArray("material_GustOriginDirection", this._descriptors.gustOriginDirection);
      data.setFloatArray("material_GustTiming", this._descriptors.gustTiming);
      data.setInt("material_GustCount", this._descriptors.gustCount);
      this._observedGustRevision = gustRevision;
    }
  }

  private _renderTreeResponse(
    material: Material,
    previous: RenderTarget,
    current: RenderTarget,
    exposureTexture: Texture2D,
    previousExposureTexture: Texture2D,
    previousWindVelocity: Readonly<Vector4>,
    resetHistory: boolean,
    request: Readonly<WindGpuFieldRenderRequest>
  ): void {
    const data = material.shaderData;
    data.setTexture("material_PreviousLocalFieldTexture", this._previousTarget.getColorTexture(0) as Texture2D);
    data.setTexture("material_CurrentLocalFieldTexture", this._currentTarget.getColorTexture(0) as Texture2D);
    data.setTexture("material_ExposureTexture", exposureTexture);
    data.setTexture("material_PreviousExposureTexture", previousExposureTexture);
    data.setVector4("material_PreviousWindVelocity", previousWindVelocity);
    data.setVector4("material_CurrentWindVelocity", this._currentTreeWindVelocity);
    data.setFloat("material_DeltaTime", Math.max(0, request.responseDeltaTime));
    data.setFloat("material_RampDuration", Math.max(0.0001, request.responseRampDuration));
    data.setFloat("material_ResetHistory", resetHistory ? 1 : 0);
    data.setVector4("material_ResponseHistoryTransform", this._responseHistoryTransform);
    Blitter.blitTexture(this._engine, previous.getColorTexture(0) as Texture2D, current, 0, undefined, material, 0);
  }

  private _renderGroundResponse(
    material: Material,
    previous: RenderTarget,
    current: RenderTarget,
    resetHistory: boolean,
    request: Readonly<WindGpuFieldRenderRequest>
  ): void {
    const data = material.shaderData;
    data.setTexture("material_OlderLocalFieldTexture", this._olderTarget.getColorTexture(0) as Texture2D);
    data.setTexture("material_PreviousLocalFieldTexture", this._previousTarget.getColorTexture(0) as Texture2D);
    data.setTexture("material_CurrentLocalFieldTexture", this._currentTarget.getColorTexture(0) as Texture2D);
    data.setVector4("material_GroundReferenceGustHistory", this._groundReferenceGustHistory);
    data.setFloat("material_DeltaTime", Math.max(0, request.responseDeltaTime));
    data.setFloat("material_RampDuration", Math.max(0.0001, request.responseRampDuration));
    data.setFloat("material_ResetHistory", resetHistory ? 1 : 0);
    data.setVector4("material_ResponseHistoryTransform", this._responseHistoryTransform);
    data.setVector4("material_OlderFieldHistoryTransform", this._olderFieldHistoryTransform);
    Blitter.blitTexture(this._engine, previous.getColorTexture(0) as Texture2D, current, 0, undefined, material, 0);
  }
}

function createTreeResponseMaterial(
  engine: Engine,
  shader: Shader,
  name: string,
  frequencyHz: number,
  dampingRatio: number
): Material {
  const material = new Material(engine, shader);
  material.name = name;
  material._addReferCount(1);
  material.shaderData.setVector4("material_ResponseParams", new Vector4(frequencyHz, dampingRatio, 0, 0));
  return material;
}

function destroyOwnedMaterial(material: Material): void {
  material._addReferCount(-1);
  material.destroy();
}

function createTarget(engine: Engine, resolution: number, name: string): RenderTarget {
  const texture = new Texture2D(engine, resolution, resolution, TextureFormat.R16G16B16A16, false, false);
  texture.name = name;
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  const target = new RenderTarget(engine, resolution, resolution, [texture], null, 1);
  target.isGCIgnored = true;
  target.autoGenerateMipmaps = false;
  return target;
}

function destroyTarget(target: RenderTarget): void {
  const textures = [...target.colorTextures];
  target.destroy(true);
  for (const texture of textures) texture.destroy(true);
}

class WindGpuFieldContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    private readonly _invalidate: () => void
  ) {
    super(resource);
  }

  restoreContent(): void {
    this._invalidate();
  }
}
