import { BoundingBox, Color, Vector3, Vector4 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer } from "../Renderer";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { Buffer } from "../graphic/Buffer";
import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { CurveKey, ParticleCurve } from "../particle/modules/ParticleCurve";
import { GradientAlphaKey, GradientColorKey, ParticleGradient } from "../particle/modules/ParticleGradient";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TrailTextureMode } from "./enums/TrailTextureMode";

/**
 * Trail Renderer Component.
 * Renders a trail behind a moving object.
 */
export class TrailRenderer extends Renderer {
  private static readonly VERTEX_STRIDE = 32;
  private static readonly VERTEX_FLOAT_STRIDE = 8;
  private static readonly POINT_INCREASE_COUNT = 128;

  private static _timeParamsProp = ShaderProperty.getByName("renderer_TimeParams");
  private static _trailParamsProp = ShaderProperty.getByName("renderer_TrailParams");
  private static _widthCurveProp = ShaderProperty.getByName("renderer_WidthCurve");
  private static _colorKeysProp = ShaderProperty.getByName("renderer_ColorKeys");
  private static _alphaKeysProp = ShaderProperty.getByName("renderer_AlphaKeys");

  private static _tempVector3 = new Vector3();

  /** The minimum distance the object must move before a new trail segment is added. */
  minVertexDistance = 0.1;

  private _timeParams = new Vector4(0, 5.0, 0, 0); // x: currentTime, y: lifetime, z: oldestBirthTime, w: newestBirthTime
  private _trailParams = new Vector4(1.0, TrailTextureMode.Stretch, 1.0, 0); // x: width, y: textureMode, z: textureScale

  /**
   * The fade-out duration in seconds.
   */
  get time(): number {
    return this._timeParams.y;
  }

  set time(value: number) {
    this._timeParams.y = value;
  }

  /**
   * The width of the trail.
   */
  get width(): number {
    return this._trailParams.x;
  }

  set width(value: number) {
    this._trailParams.x = value;
  }

  /**
   * The texture mapping mode for the trail.
   */
  get textureMode(): TrailTextureMode {
    return this._trailParams.y;
  }

  set textureMode(value: TrailTextureMode) {
    this._trailParams.y = value;
  }

  /**
   * The texture scale when using Tile texture mode.
   */
  get textureScale(): number {
    return this._trailParams.z;
  }

  set textureScale(value: number) {
    this._trailParams.z = value;
  }

  /** The curve describing the trail width from start to end. */
  @deepClone
  widthCurve = new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 1));

  /** The gradient describing the trail color from start to end. */
  @deepClone
  colorGradient = new ParticleGradient(
    [new GradientColorKey(0, new Color(1, 1, 1, 1)), new GradientColorKey(1, new Color(1, 1, 1, 1))],
    [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)]
  );

  /** Whether the trail is being created as the object moves. */
  emitting = true;

  @ignoreClone
  private _primitive: Primitive;
  @ignoreClone
  private _mainSubPrimitive: SubPrimitive;
  @ignoreClone
  private _wrapSubPrimitive: SubPrimitive;
  @ignoreClone
  private _vertexBuffer: Buffer;
  @ignoreClone
  private _vertices: Float32Array;
  @ignoreClone
  private _firstActiveElement = 0;
  @ignoreClone
  private _firstNewElement = 0;
  @ignoreClone
  private _firstFreeElement = 0;
  @ignoreClone
  private _firstRetiredElement = 0;
  @ignoreClone
  private _currentPointCapacity = 0;
  @ignoreClone
  private _bufferResized = false;
  @ignoreClone
  private _lastPosition = new Vector3();
  @ignoreClone
  private _hasLastPosition = false;
  @ignoreClone
  private _playTime = 0;
  @ignoreClone
  private _localBounds = new BoundingBox();
  @ignoreClone
  private _boundsDirty = true;

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._initGeometry();
  }

  /**
   * Clear all trail points.
   */
  clear(): void {
    this._firstActiveElement = 0;
    this._firstNewElement = 0;
    this._firstFreeElement = 0;
    this._firstRetiredElement = 0;
    this._hasLastPosition = false;
    this._boundsDirty = true;
  }

  protected override _update(context: RenderContext): void {
    super._update(context);

    const time = this.engine.time;
    this._playTime += time.deltaTime;
    this._freeRetiredPoints(time.frameCount);
    this._retireActivePoints(time.frameCount);

    if (this.emitting) {
      this._tryAddNewPoint();
    }

    const shaderData = this.shaderData;
    const timeParams = this._timeParams;

    // Update dynamic time params (currentTime, oldestBirthTime, newestBirthTime)
    timeParams.x = this._playTime;
    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree, _currentPointCapacity: capacity } = this;
    if (firstActive !== firstFree) {
      const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
      const vertices = this._vertices;
      timeParams.z = vertices[firstActive * 2 * floatStride + 3];
      const newestIndex = firstFree > 0 ? firstFree - 1 : capacity - 1;
      timeParams.w = vertices[newestIndex * 2 * floatStride + 3];
    } else {
      timeParams.z = 0;
      timeParams.w = 0;
    }

    shaderData.setVector4(TrailRenderer._timeParamsProp, timeParams);
    shaderData.setVector4(TrailRenderer._trailParamsProp, this._trailParams);

    const { colorGradient } = this;
    shaderData.setFloatArray(TrailRenderer._widthCurveProp, this.widthCurve._getTypeArray());
    shaderData.setFloatArray(TrailRenderer._colorKeysProp, colorGradient._getColorTypeArray());
    shaderData.setFloatArray(TrailRenderer._alphaKeysProp, colorGradient._getAlphaTypeArray());
  }

  protected override _render(context: RenderContext): void {
    // Need at least 2 points to form a trail segment
    if (this._getActivePointCount() < 2) return;

    if (this._firstNewElement !== this._firstFreeElement || this._vertexBuffer.isContentLost) {
      this._uploadNewVertices();
    }

    const material = this.getMaterial();
    if (!material || material.destroyed || material.shader.destroyed) return;

    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree, _primitive: primitive } = this;
    const { _renderElementPool: renderElementPool, _subRenderElementPool: subRenderElementPool } = this._engine;

    const renderElement = renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);

    // Main segment (always rendered)
    const mainSubPrimitive = this._mainSubPrimitive;
    mainSubPrimitive.start = firstActive * 2;
    mainSubPrimitive.count =
      firstActive >= firstFree
        ? (this._currentPointCapacity - firstActive + 1) * 2 // Wrapped: includes bridge
        : (firstFree - firstActive) * 2;
    const subRenderElement = subRenderElementPool.get();
    subRenderElement.set(this, material, primitive, mainSubPrimitive);
    renderElement.addSubRenderElement(subRenderElement);

    // Wrap segment (only when buffer wraps around)
    if (firstActive >= firstFree && firstFree > 0) {
      const wrapSubPrimitive = this._wrapSubPrimitive;
      wrapSubPrimitive.start = 0;
      wrapSubPrimitive.count = firstFree * 2;
      const subRenderElement2 = subRenderElementPool.get();
      subRenderElement2.set(this, material, primitive, wrapSubPrimitive);
      renderElement.addSubRenderElement(subRenderElement2);
    }

    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const halfWidth = this.width * 0.5;

    if (this._firstActiveElement === this._firstFreeElement) {
      const worldPosition = this.entity.transform.worldPosition;
      worldBounds.min.set(worldPosition.x - halfWidth, worldPosition.y - halfWidth, worldPosition.z - halfWidth);
      worldBounds.max.set(worldPosition.x + halfWidth, worldPosition.y + halfWidth, worldPosition.z + halfWidth);
      return;
    }

    if (this._boundsDirty) {
      this._recalculateBounds();
    }

    const { min, max } = this._localBounds;
    worldBounds.min.set(min.x - halfWidth, min.y - halfWidth, min.z - halfWidth);
    worldBounds.max.set(max.x + halfWidth, max.y + halfWidth, max.z + halfWidth);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._vertexBuffer?.destroy();
    this._primitive?.destroy();
  }

  private _initGeometry(): void {
    const primitive = new Primitive(this.engine);
    this._primitive = primitive;
    // Vertex layout (2 x vec4 = 32 bytes):
    // a_PositionBirthTime: xyz = position, w = birthTime
    // a_CornerTangent: x = corner (-1 or 1), yzw = tangent direction
    primitive.addVertexElement(new VertexElement("a_PositionBirthTime", 0, VertexElementFormat.Vector4, 0));
    primitive.addVertexElement(new VertexElement("a_CornerTangent", 16, VertexElementFormat.Vector4, 0));

    this._mainSubPrimitive = new SubPrimitive(0, 0, MeshTopology.TriangleStrip);
    this._wrapSubPrimitive = new SubPrimitive(0, 0, MeshTopology.TriangleStrip);

    this._resizeBuffer(TrailRenderer.POINT_INCREASE_COUNT);
  }

  private _resizeBuffer(increaseCount: number): void {
    const engine = this.engine;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const byteStride = TrailRenderer.VERTEX_STRIDE;

    const newCapacity = this._currentPointCapacity + increaseCount;
    // Buffer layout: [capacity points] + [1 bridge point]
    // Bridge point is copy of point 0, placed at position capacity to connect wrap-around
    const vertexCount = (newCapacity + 1) * 2;

    // Create new vertex buffer (no index buffer needed - using drawArrays)
    const newVertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      vertexCount * byteStride,
      BufferUsage.Dynamic,
      false
    );
    const newVertices = new Float32Array(vertexCount * floatStride);

    // Migrate existing vertex data if any
    const lastVertices = this._vertices;
    if (lastVertices) {
      const firstFreeElement = this._firstFreeElement;

      // Copy data before firstFreeElement
      newVertices.set(new Float32Array(lastVertices.buffer, 0, firstFreeElement * 2 * floatStride));

      // Copy data after firstFreeElement (shift by increaseCount)
      const nextFreeElement = firstFreeElement + 1;
      if (nextFreeElement < this._currentPointCapacity) {
        const freeEndOffset = (nextFreeElement + increaseCount) * 2 * floatStride;
        newVertices.set(new Float32Array(lastVertices.buffer, nextFreeElement * 2 * floatStride * 4), freeEndOffset);
      }

      // Update pointers
      if (this._firstNewElement > firstFreeElement) {
        this._firstNewElement += increaseCount;
      }
      if (this._firstActiveElement > firstFreeElement) {
        this._firstActiveElement += increaseCount;
      }
      if (this._firstRetiredElement > firstFreeElement) {
        this._firstRetiredElement += increaseCount;
      }

      this._bufferResized = true;
    }

    // Destroy old vertex buffer
    this._vertexBuffer?.destroy();

    this._vertexBuffer = newVertexBuffer;
    this._vertices = newVertices;
    this._currentPointCapacity = newCapacity;

    // Update primitive vertex buffer binding
    const vertexBufferBinding = new VertexBufferBinding(newVertexBuffer, byteStride);
    this._primitive.setVertexBufferBinding(0, vertexBufferBinding);
  }

  /**
   * Move expired points from active to retired state.
   * Points in retired state are waiting for GPU to finish rendering before they can be freed.
   */
  private _retireActivePoints(frameCount: number): void {
    const { _playTime: currentTime, time: lifetime, _vertices: vertices, _currentPointCapacity: capacity } = this;
    const firstActiveOld = this._firstActiveElement;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;

    while (this._firstActiveElement !== this._firstFreeElement) {
      const offset = this._firstActiveElement * 2 * floatStride + 3;
      const birthTime = vertices[offset];
      if (currentTime - birthTime < lifetime) break;
      // Record the frame when this point was retired (reuse birthTime field)
      vertices[offset] = frameCount;
      this._firstActiveElement = (this._firstActiveElement + 1) % capacity;
    }

    if (this._firstActiveElement !== firstActiveOld) {
      this._boundsDirty = true;
    }
    if (this._firstActiveElement === this._firstFreeElement) {
      this._hasLastPosition = false;
    }
  }

  /**
   * Free retired points that GPU has finished rendering.
   * WebGL doesn't support mapBufferRange, so this optimization is currently disabled.
   * The condition `frameCount - retireFrame < 0` will never be true, effectively skipping the check.
   */
  private _freeRetiredPoints(frameCount: number): void {
    const capacity = this._currentPointCapacity;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const vertices = this._vertices;

    while (this._firstRetiredElement !== this._firstActiveElement) {
      const retireFrame = vertices[this._firstRetiredElement * 2 * floatStride + 3];

      // WebGL doesn't support mapBufferRange, so this optimization is disabled.
      // When mapBufferRange is available, change condition to check if GPU finished rendering.
      if (frameCount - retireFrame < 0) {
        break;
      }

      this._firstRetiredElement = (this._firstRetiredElement + 1) % capacity;
    }
  }

  private _tryAddNewPoint(): void {
    const worldPosition = this.entity.transform.worldPosition;

    if (this._hasLastPosition && Vector3.distance(worldPosition, this._lastPosition) < this.minVertexDistance) {
      return;
    }

    // Using 'nextFreeElement' instead of 'freeElement' when comparing with '_firstRetiredElement'
    // aids in definitively identifying the head and tail of the circular queue.
    // Failure to adopt this approach may impede growth initiation
    // due to the initial alignment of 'freeElement' and 'firstRetiredElement'.
    const nextFreeElement = (this._firstFreeElement + 1) % this._currentPointCapacity;
    if (nextFreeElement === this._firstRetiredElement) {
      this._resizeBuffer(TrailRenderer.POINT_INCREASE_COUNT);
    }

    this._addPoint(worldPosition);
    this._lastPosition.copyFrom(worldPosition);
    this._hasLastPosition = true;
  }

  private _addPoint(position: Vector3): void {
    const pointIndex = this._firstFreeElement;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const vertices = this._vertices;
    const playTime = this._playTime;

    const tangent = TrailRenderer._tempVector3;
    if (this._hasLastPosition) {
      Vector3.subtract(position, this._lastPosition, tangent);
      tangent.normalize();

      // First point has placeholder tangent, update it when second point is added
      if (this._getActivePointCount() === 1) {
        const firstPointIndex = this._firstActiveElement;
        const offset0 = firstPointIndex * 2 * floatStride + 5;
        const offset1 = offset0 + floatStride;
        tangent.copyToArray(vertices, offset0);
        tangent.copyToArray(vertices, offset1);
        // Mark first point for re-upload since its tangent changed
        this._firstNewElement = this._firstActiveElement;
      }
    } else {
      // First point uses placeholder tangent (will be corrected when second point arrives)
      tangent.set(0, 0, 1);
    }

    // Write vertex data for top vertex (corner = -1)
    const topOffset = pointIndex * 2 * floatStride;
    position.copyToArray(vertices, topOffset);
    vertices[topOffset + 3] = playTime;
    vertices[topOffset + 4] = -1;
    tangent.copyToArray(vertices, topOffset + 5);

    // Write vertex data for bottom vertex (corner = 1)
    const bottomOffset = topOffset + floatStride;
    position.copyToArray(vertices, bottomOffset);
    vertices[bottomOffset + 3] = playTime;
    vertices[bottomOffset + 4] = 1;
    tangent.copyToArray(vertices, bottomOffset + 5);

    // Also write to bridge position when writing point 0
    if (pointIndex === 0) {
      const bridgeTopOffset = this._currentPointCapacity * 2 * floatStride;
      const bridgeBottomOffset = bridgeTopOffset + floatStride;
      position.copyToArray(vertices, bridgeTopOffset);
      vertices[bridgeTopOffset + 3] = playTime;
      vertices[bridgeTopOffset + 4] = -1;
      tangent.copyToArray(vertices, bridgeTopOffset + 5);
      position.copyToArray(vertices, bridgeBottomOffset);
      vertices[bridgeBottomOffset + 3] = playTime;
      vertices[bridgeBottomOffset + 4] = 1;
      tangent.copyToArray(vertices, bridgeBottomOffset + 5);
    }

    this._expandBounds(position);
    this._firstFreeElement = (this._firstFreeElement + 1) % this._currentPointCapacity;
  }

  private _getActivePointCount(): number {
    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree } = this;
    return firstFree >= firstActive ? firstFree - firstActive : this._currentPointCapacity - firstActive + firstFree;
  }

  private _expandBounds(position: Vector3): void {
    const { min, max } = this._localBounds;

    if (this._boundsDirty) {
      min.copyFrom(position);
      max.copyFrom(position);
      this._boundsDirty = false;
      return;
    }

    Vector3.min(min, position, min);
    Vector3.max(max, position, max);
  }

  private _recalculateBounds(): void {
    const vertices = this._vertices;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const activeCount = this._getActivePointCount();
    const { min, max } = this._localBounds;

    if (activeCount === 0) {
      min.set(0, 0, 0);
      max.set(0, 0, 0);
      this._boundsDirty = false;
      return;
    }

    const firstOffset = this._firstActiveElement * 2 * floatStride;
    min.copyFromArray(vertices, firstOffset);
    max.copyFrom(min);

    const pointPosition = TrailRenderer._tempVector3;
    const capacity = this._currentPointCapacity;
    for (let i = 1, pointIndex = (this._firstActiveElement + 1) % capacity; i < activeCount; i++) {
      pointPosition.copyFromArray(vertices, pointIndex * 2 * floatStride);
      Vector3.min(min, pointPosition, min);
      Vector3.max(max, pointPosition, max);
      pointIndex = (pointIndex + 1) % capacity;
    }

    this._boundsDirty = false;
  }

  private _uploadNewVertices(): void {
    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree, _vertexBuffer: buffer } = this;
    const firstNew = buffer.isContentLost || this._bufferResized ? firstActive : this._firstNewElement;
    this._bufferResized = false;

    if (firstNew === firstFree) return;

    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const byteStride = TrailRenderer.VERTEX_STRIDE;
    const { buffer: vertexData } = this._vertices;
    const capacity = this._currentPointCapacity;
    const wrapped = firstNew >= firstFree;

    // First segment: wrapped includes bridge (+1 point), non-wrapped ends at firstFree
    const endPoint = wrapped ? capacity + 1 : firstFree;
    buffer.setData(
      new Float32Array(vertexData, firstNew * 2 * floatStride * 4, (endPoint - firstNew) * 2 * floatStride),
      firstNew * 2 * byteStride
    );

    if (wrapped) {
      // Second segment
      if (firstFree > 0) {
        buffer.setData(new Float32Array(vertexData, 0, firstFree * 2 * floatStride), 0);
      }
    } else if (firstNew === 0) {
      // Upload bridge separately if point 0 was updated
      buffer.setData(
        new Float32Array(vertexData, capacity * 2 * floatStride * 4, 2 * floatStride),
        capacity * 2 * byteStride
      );
    }

    this._firstNewElement = firstFree;
  }
}
