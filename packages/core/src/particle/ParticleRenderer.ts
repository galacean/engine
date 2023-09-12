import { Color, MathUtil, Vector3 } from "@galacean/engine-math";
import { GLCapabilityType } from "../base/Constant";
import { ignoreClone } from "../clone/CloneManager";
import { Buffer } from "../graphic/Buffer";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Material } from "../material/Material";
import { BufferMesh } from "../mesh/BufferMesh";
import { MeshRenderer } from "../mesh/MeshRenderer";
import { CullMode, Shader } from "../shader";
import { BlendFactor } from "../shader/enums/BlendFactor";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { Texture } from "../texture";

enum DirtyFlagType {
  Position = 0x1,
  Velocity = 0x2,
  Acceleration = 0x4,
  Color = 0x8,
  Alpha = 0x10,
  Size = 0x20,
  StartAngle = 0x40,
  StartTime = 0x80,
  LifeTime = 0x100,
  RotateVelocity = 0x200,
  Scale = 0x400,
  Everything = 0xffffffff
}

/**
 * Blend mode enums of the particle renderer's material.
 */
export enum ParticleRendererBlendMode {
  Transparent = 0,
  Additive = 1
}

/**
 * Particle Renderer Component.
 */
export class ParticleRenderer extends MeshRenderer {
  /** The max number of indices that Uint16Array can support. */
  private static _uint16VertexLimit: number = 65535;

  private static _getRandom(): number {
    return Math.random() - 0.5;
  }

  private _vertexStride: number;
  private _vertices: Float32Array;
  private _vertexBuffer: Buffer;
  private _maxCount: number = 1000;
  private _position: Vector3 = new Vector3();
  private _positionRandomness: Vector3 = new Vector3();
  private _positionArray: Vector3[];
  private _velocity: Vector3 = new Vector3();
  private _velocityRandomness: Vector3 = new Vector3();
  private _acceleration: Vector3 = new Vector3();
  private _accelerationRandomness: Vector3 = new Vector3();
  private _color: Color = new Color(1, 1, 1, 1);
  private _colorRandomness: number = 0;
  private _size: number = 1;
  private _sizeRandomness: number = 0;
  private _alpha: number = 1;
  private _alphaRandomness: number = 0;
  private _startAngle: number = 0;
  private _startAngleRandomness: number = 0;
  private _rotateVelocity: number = 0;
  private _rotateVelocityRandomness: number = 0;
  private _lifetime: number = 5;
  private _startTimeRandomness: number = 0;
  private _scale: number = 1;
  private _isOnce: boolean = false;
  private _onceTime: number = 0;
  private _time: number = 0;
  private _isInit: boolean = false;
  private _isStart: boolean = false;
  private _updateDirtyFlag: number = DirtyFlagType.Everything;
  private _isRotateToVelocity: boolean = false;
  private _isUseOriginColor: boolean = false;
  private _isScaleByLifetime: boolean = false;
  private _is2d: boolean = true;
  private _isFadeIn: boolean = false;
  private _isFadeOut: boolean = false;
  private _playOnEnable: boolean = true;
  private _blendMode: ParticleRendererBlendMode = ParticleRendererBlendMode.Transparent;

  /**
   * Sprite sheet of texture.
   */
  public spriteSheet: { x: number; y: number; w: number; h: number }[];

  /**
   * Texture of particle.
   */
  get texture(): Texture {
    return this.getMaterial().shaderData.getTexture("u_texture");
  }

  set texture(texture: Texture) {
    if (texture) {
      this.shaderData.enableMacro("particleTexture");
      this.getMaterial().shaderData.setTexture("u_texture", texture);
    } else {
      this.shaderData.disableMacro("particleTexture");
    }
  }

  /**
   * Position of particles.
   */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    this._updateDirtyFlag |= DirtyFlagType.Position;
    this._position = value;
  }

  /**
   * Random range of positions.
   */
  get positionRandomness(): Vector3 {
    return this._positionRandomness;
  }

  set positionRandomness(value: Vector3) {
    this._updateDirtyFlag |= DirtyFlagType.Position;
    this._positionRandomness = value;
  }

  /**
   * Array of fixed positions.
   */
  get positionArray(): Vector3[] {
    return this._positionArray;
  }

  set positionArray(value: Vector3[]) {
    this._updateDirtyFlag |= DirtyFlagType.Position;
    this._positionArray = value;
  }

  /**
   * Velocity of particles.
   */
  get velocity(): Vector3 {
    return this._velocity;
  }

  set velocity(value: Vector3) {
    this._updateDirtyFlag |= DirtyFlagType.Velocity;
    this._velocity = value;
  }

  /**
   * Random range of velocity.
   */
  get velocityRandomness(): Vector3 {
    return this._velocityRandomness;
  }

  set velocityRandomness(value: Vector3) {
    this._updateDirtyFlag |= DirtyFlagType.Velocity;
    this._velocityRandomness = value;
  }

  /**
   * Acceleration of particles.
   */
  get acceleration(): Vector3 {
    return this._acceleration;
  }

  set acceleration(value: Vector3) {
    this._updateDirtyFlag |= DirtyFlagType.Acceleration;
    this._acceleration = value;
  }

  /**
   * Random range of acceleration.
   */
  get accelerationRandomness(): Vector3 {
    return this._accelerationRandomness;
  }

  set accelerationRandomness(value: Vector3) {
    this._updateDirtyFlag |= DirtyFlagType.Acceleration;
    this._accelerationRandomness = value;
  }

  /**
   * Color of particles.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    this._color.copyFrom(value);
  }

  /**
   * Random range of color.
   */
  get colorRandomness(): number {
    return this._colorRandomness;
  }

  set colorRandomness(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.Color;
    this._colorRandomness = value;
  }

  /**
   * Size of particles.
   */
  get size(): number {
    return this._size;
  }

  set size(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.Size;
    this._size = value;
  }

  /**
   * Random range of size.
   */
  get sizeRandomness(): number {
    return this._sizeRandomness;
  }

  set sizeRandomness(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.Size;
    this._sizeRandomness = value;
  }

  /**
   * Alpha of particles.
   */
  get alpha(): number {
    return this._alpha;
  }

  set alpha(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.Alpha;
    this._alpha = value;
  }

  /**
   * Random range of alpha.
   */
  get alphaRandomness(): number {
    return this._alphaRandomness;
  }

  set alphaRandomness(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.Alpha;
    this._alphaRandomness = value;
  }

  /**
   * Angle of particles.
   */
  get angle(): number {
    return this._startAngle;
  }

  set angle(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.StartAngle;
    this._startAngle = value;
  }

  /**
   * Random range of angle.
   */
  get angleRandomness(): number {
    return this._startAngleRandomness;
  }

  set angleRandomness(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.StartAngle;
    this._startAngleRandomness = value;
  }

  /**
   * Rotate velocity of particles.
   */
  get rotateVelocity(): number {
    return this._rotateVelocity;
  }

  set rotateVelocity(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.RotateVelocity;
    this._rotateVelocity = value;
  }

  /**
   * Random range of rotate velocity.
   */
  get rotateVelocityRandomness(): number {
    return this._rotateVelocityRandomness;
  }

  set rotateVelocityRandomness(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.RotateVelocity;
    this._rotateVelocityRandomness = value;
  }

  /**
   * Lifetime of particles.
   */
  get lifetime(): number {
    return this._lifetime;
  }

  set lifetime(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.LifeTime;
    this._lifetime = value;
    this._onceTime = 0;
  }

  /**
   * Random range of start time.
   */
  get startTimeRandomness(): number {
    return this._startTimeRandomness;
  }

  set startTimeRandomness(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.StartTime;
    this._startTimeRandomness = value;
    this._onceTime = 0;
  }

  /**
   * Scale factor of particles.
   */
  get scale(): number {
    return this._scale;
  }

  set scale(value: number) {
    this._updateDirtyFlag |= DirtyFlagType.Scale;
    this._scale = value;
  }

  /**
   * Max count of particles.
   */
  get maxCount(): number {
    return this._maxCount;
  }

  set maxCount(value: number) {
    this._isStart = false;
    this._isInit = false;
    this._maxCount = value;
    this._updateDirtyFlag = DirtyFlagType.Everything;
    this.mesh = this._createMesh();

    this._updateBuffer();

    this._isInit = true;
    this.shaderData.setFloat("u_time", 0);
  }

  /**
   * Whether play once.
   */
  get isOnce(): boolean {
    return this._isOnce;
  }

  set isOnce(value: boolean) {
    this._time = 0;
    this.shaderData.setInt("u_once", value ? 1 : 0);
    this._isOnce = value;
  }

  /**
   * Whether follow the direction of velocity.
   */
  get isRotateToVelocity(): boolean {
    return this._isRotateToVelocity;
  }

  set isRotateToVelocity(value: boolean) {
    if (value) {
      this.shaderData.enableMacro("rotateToVelocity");
    } else {
      this.shaderData.disableMacro("rotateToVelocity");
    }

    this._isRotateToVelocity = value;
  }

  /**
   * Whether use origin color.
   */
  get isUseOriginColor(): boolean {
    return this._isUseOriginColor;
  }

  set isUseOriginColor(value: boolean) {
    if (value) {
      this.shaderData.enableMacro("useOriginColor");
    } else {
      this.shaderData.disableMacro("useOriginColor");
    }

    this._isUseOriginColor = value;
  }

  /**
   * Whether scale by lifetime.
   */
  get isScaleByLifetime(): boolean {
    return this._isScaleByLifetime;
  }

  set isScaleByLifetime(value: boolean) {
    if (value) {
      this.shaderData.enableMacro("isScaleByLifetime");
    } else {
      this.shaderData.disableMacro("isScaleByLifetime");
    }

    this._isScaleByLifetime = value;
  }

  /**
   * Whether 2D rendering.
   */
  get is2d(): boolean {
    return this._is2d;
  }

  set is2d(value: boolean) {
    if (value) {
      this.shaderData.enableMacro("is2d");
    } else {
      this.shaderData.disableMacro("is2d");
      this.getMaterial().renderState.rasterState.cullMode = CullMode.Off;
    }

    this._is2d = value;
  }

  /**
   * Whether fade in.
   */
  get isFadeIn(): boolean {
    return this._isFadeIn;
  }

  set isFadeIn(value: boolean) {
    if (value) {
      this.shaderData.enableMacro("fadeIn");
    } else {
      this.shaderData.disableMacro("fadeIn");
    }

    this._isFadeIn = value;
  }

  /**
   * Whether fade out.
   */
  get isFadeOut(): boolean {
    return this._isFadeOut;
  }

  set isFadeOut(value: boolean) {
    if (value) {
      this.shaderData.enableMacro("fadeOut");
    } else {
      this.shaderData.disableMacro("fadeOut");
    }

    this._isFadeOut = value;
  }

  /**
   * Whether play on enable.
   */
  get playOnEnable(): boolean {
    return this._playOnEnable;
  }

  set playOnEnable(value: boolean) {
    this._playOnEnable = value;

    if (value) {
      this.start();
    } else {
      this.stop();
    }
  }

  /**
   * Blend mode of the particle renderer's material.
   */
  get blendMode(): ParticleRendererBlendMode {
    return this._blendMode;
  }

  set blendMode(value: ParticleRendererBlendMode) {
    const blendState = this.getMaterial().renderState.blendState;
    const target = blendState.targetBlendState;

    if (value === ParticleRendererBlendMode.Transparent) {
      target.enabled = true;
      target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
      target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
      target.sourceAlphaBlendFactor = BlendFactor.One;
      target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    } else if (value === ParticleRendererBlendMode.Additive) {
      target.enabled = true;
      target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
      target.destinationColorBlendFactor = BlendFactor.One;
      target.sourceAlphaBlendFactor = BlendFactor.One;
      target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    }

    this._blendMode = value;
  }

  constructor(props) {
    super(props);

    this._onColorChanged = this._onColorChanged.bind(this);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChanged;

    this.setMaterial(this._createMaterial());
  }

  /**
   * @internal
   */
  override update(deltaTime: number): void {
    if (!this._isInit || !this._isStart) {
      return;
    }

    // Stop after play once
    if (this._isOnce && this._time > this._onceTime) {
      return this.stop();
    }

    if (this._updateDirtyFlag) {
      this._updateBuffer();
      this._updateDirtyFlag = 0;
    }

    this._time += deltaTime;
    this.shaderData.setFloat("u_time", this._time);
  }

  /**
   * @internal
   */
  override _onEnable(): void {
    super._onEnable();

    if (this._playOnEnable) {
      this.start();
    }
  }

  /**
   * Start emitting.
   */
  start(): void {
    this._isStart = true;
    this._time = 0;
  }

  /**
   * Stop emitting.
   */
  stop(): void {
    this._isStart = false;
  }

  private _createMaterial(): Material {
    const material = new Material(this.engine, Shader.find("particle-shader"));
    const { renderState } = material;
    const target = renderState.blendState.targetBlendState;

    target.enabled = true;
    target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.sourceAlphaBlendFactor = BlendFactor.One;
    target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;

    renderState.depthState.writeEnabled = false;

    material.renderState.renderQueueType = RenderQueueType.Transparent;

    this.isUseOriginColor = true;
    this.is2d = true;
    this.isFadeOut = true;

    return material;
  }

  private _createMesh(): BufferMesh {
    const mesh = new BufferMesh(this._entity.engine, "particleMesh");
    const vertexStride = 96;
    const vertexCount = this._maxCount * 4;
    const vertexFloatCount = vertexCount * vertexStride;
    const vertices = new Float32Array(vertexFloatCount);
    let indices: Uint16Array | Uint32Array = null;
    let useUint32: boolean = false;
    if (vertexCount > ParticleRenderer._uint16VertexLimit) {
      if (this.engine._hardwareRenderer.canIUse(GLCapabilityType.elementIndexUint)) {
        useUint32 = true;
        indices = new Uint32Array(6 * this._maxCount);
      } else {
        throw Error("The vertex count is over limit.");
      }
    } else {
      indices = new Uint16Array(6 * this._maxCount);
    }

    for (let i = 0, idx = 0; i < this._maxCount; ++i) {
      let startIndex = i * 4;
      indices[idx++] = startIndex;
      indices[idx++] = startIndex + 1;
      indices[idx++] = startIndex + 2;
      indices[idx++] = startIndex;
      indices[idx++] = startIndex + 2;
      indices[idx++] = startIndex + 3;
    }

    const vertexElements = [
      new VertexElement("a_position", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("a_velocity", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("a_acceleration", 24, VertexElementFormat.Vector3, 0),
      new VertexElement("a_color", 36, VertexElementFormat.Vector4, 0),
      new VertexElement("a_lifeAndSize", 52, VertexElementFormat.Vector4, 0),
      new VertexElement("a_rotation", 68, VertexElementFormat.Vector2, 0),
      new VertexElement("a_uv", 76, VertexElementFormat.Vector3, 0),
      new VertexElement("a_normalizedUv", 88, VertexElementFormat.Vector2, 0)
    ];

    const vertexBuffer = new Buffer(
      this.engine,
      BufferBindFlag.VertexBuffer,
      vertexFloatCount * 4,
      BufferUsage.Dynamic
    );

    const indexBuffer = new Buffer(this.engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Dynamic);

    mesh.setVertexBufferBinding(vertexBuffer, vertexStride);
    mesh.setIndexBufferBinding(indexBuffer, useUint32 ? IndexFormat.UInt32 : IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);
    mesh.addSubMesh(0, indices.length);

    this._vertexBuffer = vertexBuffer;
    this._vertexStride = vertexStride / 4;
    this._vertices = vertices;

    const { bounds } = mesh;
    const minValue = Number.MIN_SAFE_INTEGER;
    const maxValue = Number.MAX_SAFE_INTEGER;
    bounds.min.set(minValue, minValue, minValue);
    bounds.max.set(maxValue, maxValue, maxValue);

    return mesh;
  }

  private _updateBuffer(): void {
    for (let x = 0; x < this._maxCount; x++) {
      this._updateSingleBuffer(x);
    }

    this._vertexBuffer.setData(this._vertices);
  }

  private _updateSingleBuffer(i: number): void {
    const { _updateDirtyFlag, _vertices: vertices, _vertexStride: vertexStride } = this;
    const { _getRandom: getRandom } = ParticleRenderer;
    const offset = i * 4;

    const k0 = offset * vertexStride;
    const k1 = (offset + 1) * vertexStride;
    const k2 = (offset + 2) * vertexStride;
    const k3 = (offset + 3) * vertexStride;

    if (_updateDirtyFlag & DirtyFlagType.Position) {
      let { x, y, z } = this._position;
      const { _positionArray, _positionRandomness } = this;

      if (_positionArray) {
        if (_positionArray.length !== this._maxCount) {
          throw Error("The length of positionArray must be equal to maxCount.");
        }
        const pos = _positionArray[i];

        x += pos.x;
        y += pos.y;
        z += pos.z;
      } else {
        x += getRandom() * _positionRandomness.x;
        y += getRandom() * _positionRandomness.y;
        z += getRandom() * _positionRandomness.z;
      }

      vertices[k0] = vertices[k1] = vertices[k2] = vertices[k3] = x;
      vertices[k0 + 1] = vertices[k1 + 1] = vertices[k2 + 1] = vertices[k3 + 1] = y;
      vertices[k0 + 2] = vertices[k1 + 2] = vertices[k2 + 2] = vertices[k3 + 2] = z;
    }

    if (_updateDirtyFlag & DirtyFlagType.Velocity) {
      const { _velocity, _velocityRandomness } = this;

      vertices[k0 + 3] =
        vertices[k1 + 3] =
        vertices[k2 + 3] =
        vertices[k3 + 3] =
          _velocity.x + getRandom() * _velocityRandomness.x;
      vertices[k0 + 4] =
        vertices[k1 + 4] =
        vertices[k2 + 4] =
        vertices[k3 + 4] =
          _velocity.y + getRandom() * _velocityRandomness.y;
      vertices[k0 + 5] =
        vertices[k1 + 5] =
        vertices[k2 + 5] =
        vertices[k3 + 5] =
          _velocity.z + getRandom() * _velocityRandomness.z;
    }

    if (_updateDirtyFlag & DirtyFlagType.Acceleration) {
      const { _acceleration, _accelerationRandomness } = this;

      vertices[k0 + 6] =
        vertices[k1 + 6] =
        vertices[k2 + 6] =
        vertices[k3 + 6] =
          _acceleration.x + getRandom() * _accelerationRandomness.x;
      vertices[k0 + 7] =
        vertices[k1 + 7] =
        vertices[k2 + 7] =
        vertices[k3 + 7] =
          _acceleration.y + getRandom() * _accelerationRandomness.y;
      vertices[k0 + 8] =
        vertices[k1 + 8] =
        vertices[k2 + 8] =
        vertices[k3 + 8] =
          _acceleration.z + getRandom() * _accelerationRandomness.z;
    }

    if (_updateDirtyFlag & DirtyFlagType.Color) {
      const { _color, _colorRandomness } = this;

      vertices[k0 + 9] =
        vertices[k1 + 9] =
        vertices[k2 + 9] =
        vertices[k3 + 9] =
          MathUtil.clamp(_color.r + getRandom() * _colorRandomness, 0, 1);

      vertices[k0 + 10] =
        vertices[k1 + 10] =
        vertices[k2 + 10] =
        vertices[k3 + 10] =
          MathUtil.clamp(_color.g + getRandom() * _colorRandomness, 0, 1);
      vertices[k0 + 11] =
        vertices[k1 + 11] =
        vertices[k2 + 11] =
        vertices[k3 + 11] =
          MathUtil.clamp(_color.b + getRandom() * _colorRandomness, 0, 1);
    }

    if (_updateDirtyFlag & DirtyFlagType.Alpha) {
      vertices[k0 + 12] =
        vertices[k1 + 12] =
        vertices[k2 + 12] =
        vertices[k3 + 12] =
          MathUtil.clamp(this._alpha + getRandom() * this._alphaRandomness, 0, 1);
    }

    if (_updateDirtyFlag & DirtyFlagType.StartTime) {
      vertices[k0 + 13] =
        vertices[k1 + 13] =
        vertices[k2 + 13] =
        vertices[k3 + 13] =
          Math.random() * this._startTimeRandomness;
    }

    if (_updateDirtyFlag & DirtyFlagType.LifeTime) {
      const { _lifetime } = this;

      vertices[k0 + 14] =
        vertices[k1 + 14] =
        vertices[k2 + 14] =
        vertices[k3 + 14] =
          _lifetime + getRandom() * _lifetime;
    }

    // Update the duration of play once when startTime or lifetime changes.
    if (_updateDirtyFlag & DirtyFlagType.StartTime || _updateDirtyFlag & DirtyFlagType.LifeTime) {
      this._onceTime = Math.max(this._onceTime, vertices[k0 + 13] + vertices[k0 + 14]);
    }

    if (_updateDirtyFlag & DirtyFlagType.Size) {
      const { _size } = this;

      vertices[k0 + 15] =
        vertices[k1 + 15] =
        vertices[k2 + 15] =
        vertices[k3 + 15] =
          Math.max(_size + getRandom() * this._sizeRandomness * _size * 2, 0);
    }

    if (_updateDirtyFlag & DirtyFlagType.Scale) {
      vertices[k0 + 16] = vertices[k1 + 16] = vertices[k2 + 16] = vertices[k3 + 16] = this._scale;
    }

    if (_updateDirtyFlag & DirtyFlagType.StartAngle) {
      vertices[k0 + 17] =
        vertices[k1 + 17] =
        vertices[k2 + 17] =
        vertices[k3 + 17] =
          this._startAngle + getRandom() * Math.PI * this._startAngleRandomness * 2;
    }

    if (_updateDirtyFlag & DirtyFlagType.RotateVelocity) {
      vertices[k0 + 18] =
        vertices[k1 + 18] =
        vertices[k2 + 18] =
        vertices[k3 + 18] =
          this._rotateVelocity + getRandom() * this._rotateVelocityRandomness;
    }

    this._updateSingleUv(i, k0, k1, k2, k3);
  }

  private _updateSingleUv(i: number, k0: number, k1: number, k2: number, k3: number): void {
    const { spriteSheet } = this;
    const texture = this.getMaterial().shaderData.getTexture("u_texture");
    const vertices = this._vertices;

    if (texture) {
      const width = texture.width;
      const height = texture.height;

      if (spriteSheet) {
        const { x, y, w, h } = spriteSheet[i % spriteSheet.length];

        const u = x / width;
        const v = y / height;
        const p = u + w / width;
        const q = v + h / height;
        const ratio = h / w;

        // left bottom
        vertices[k0 + 19] = u;
        vertices[k0 + 20] = q;
        vertices[k0 + 21] = ratio;

        // right bottom
        vertices[k1 + 19] = p;
        vertices[k1 + 20] = q;
        vertices[k1 + 21] = ratio;

        // right top
        vertices[k2 + 19] = p;
        vertices[k2 + 20] = v;
        vertices[k2 + 21] = ratio;

        // left top
        vertices[k3 + 19] = u;
        vertices[k3 + 20] = v;
        vertices[k3 + 21] = ratio;
      } else {
        const ratio = height / width;

        // left bottom
        vertices[k0 + 19] = 0;
        vertices[k0 + 20] = 1;
        vertices[k0 + 21] = ratio;

        // right bottom
        vertices[k1 + 19] = 1;
        vertices[k1 + 20] = 1;
        vertices[k1 + 21] = ratio;

        // right top
        vertices[k2 + 19] = 1;
        vertices[k2 + 20] = 0;
        vertices[k2 + 21] = ratio;

        // left top
        vertices[k3 + 19] = 0;
        vertices[k3 + 20] = 0;
        vertices[k3 + 21] = ratio;
      }
    } else {
      // left bottom
      vertices[k0 + 19] = 0;
      vertices[k0 + 20] = 0;
      vertices[k0 + 21] = 1;

      // right bottom
      vertices[k1 + 19] = 1;
      vertices[k1 + 20] = 0;
      vertices[k1 + 21] = 1;

      // right top
      vertices[k2 + 19] = 1;
      vertices[k2 + 20] = 1;
      vertices[k2 + 21] = 1;

      // left top
      vertices[k3 + 19] = 0;
      vertices[k3 + 20] = 1;
      vertices[k3 + 21] = 1;
    }

    vertices[k0 + 22] = -0.5;
    vertices[k0 + 23] = -0.5;
    vertices[k1 + 22] = 0.5;
    vertices[k1 + 23] = -0.5;
    vertices[k2 + 22] = 0.5;
    vertices[k2 + 23] = 0.5;
    vertices[k3 + 22] = -0.5;
    vertices[k3 + 23] = 0.5;
  }

  @ignoreClone
  private _onColorChanged(): void {
    this._updateDirtyFlag |= DirtyFlagType.Color;
  }
}
