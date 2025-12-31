import { BoundingBox, Color, Vector3, Vector4 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderElement } from "../RenderPipeline/RenderElement";
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
import { Material } from "../material/Material";
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
  private static readonly POINT_FLOAT_STRIDE = 16; // 2 vertices per point
  private static readonly POINT_BYTE_STRIDE = 64; // 2 vertices per point
  private static readonly POINT_INCREASE_COUNT = 128;

  // Segment bounds array layout: posX, posY, posZ, birthTime = 4 floats per segment
  private static readonly SEGMENT_BOUNDS_FLOAT_STRIDE = 4;
  private static readonly SEGMENT_BOUNDS_TIME_OFFSET = 3;
  private static readonly SEGMENT_BOUNDS_INCREASE_COUNT = 64;

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
  // Segment bounds for efficient bounds calculation (similar to particle world mode)
  @ignoreClone
  private _segmentBoundsArray: Float32Array;
  @ignoreClone
  private _segmentBoundsCount = 0;
  @ignoreClone
  private _firstActiveSegmentBounds = 0;
  @ignoreClone
  private _firstFreeSegmentBounds = 0;
  @ignoreClone
  private _lastSegmentBoundsFrameCount = -1;

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
    this._firstActiveSegmentBounds = this._firstFreeSegmentBounds;
    this._lastSegmentBoundsFrameCount = -1;
  }

  protected override _update(context: RenderContext): void {
    super._update(context);

    const time = this.engine.time;
    this._playTime += time.deltaTime;
    this._freeRetiredPoints(time.frameCount);
    this._retireActivePoints(time.frameCount);
    this._retireSegmentBounds();

    if (this.emitting) {
      this._emitNewPoint();
    }
    if (this._firstNewElement !== this._firstFreeElement || this._vertexBuffer.isContentLost) {
      this._uploadNewVertices();
    }

    const shaderData = this.shaderData;
    const timeParams = this._timeParams;
    timeParams.x = this._playTime;

    shaderData.setVector4(TrailRenderer._timeParamsProp, timeParams);
    shaderData.setVector4(TrailRenderer._trailParamsProp, this._trailParams);

    const { colorGradient } = this;
    shaderData.setFloatArray(TrailRenderer._widthCurveProp, this.widthCurve._getTypeArray());
    shaderData.setFloatArray(TrailRenderer._colorKeysProp, colorGradient._getColorTypeArray());
    shaderData.setFloatArray(TrailRenderer._alphaKeysProp, colorGradient._getAlphaTypeArray());
  }

  protected override _render(context: RenderContext): void {
    if (this._getActivePointCount() < 2) {
      return;
    }

    const material = this.getMaterial();
    if (!material || material.destroyed || material.shader.destroyed) {
      return;
    }

    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree } = this;

    const renderElement = this._engine._renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);

    const wrapped = firstActive > firstFree;
    const mainCount = (wrapped ? this._currentPointCapacity - firstActive + 1 : firstFree - firstActive) * 2;
    this._addSubRenderElement(renderElement, material, this._mainSubPrimitive, firstActive * 2, mainCount);

    if (wrapped && firstFree > 0) {
      this._addSubRenderElement(renderElement, material, this._wrapSubPrimitive, 0, firstFree * 2);
    }

    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    // Generate segment bounds for current position (same condition as _emitNewPoint)
    if (this.emitting) {
      const worldPosition = this.entity.transform.worldPosition;
      if (!this._hasLastPosition || Vector3.distance(worldPosition, this._lastPosition) >= this.minVertexDistance) {
        this._generateSegmentBounds(worldPosition);
      }
    }

    const halfWidth = this.width * 0.5;
    const firstActive = this._firstActiveSegmentBounds;
    const firstFree = this._firstFreeSegmentBounds;

    // No active segment bounds - use entity position as fallback
    if (firstActive === firstFree) {
      const worldPosition = this.entity.transform.worldPosition;
      worldBounds.min.set(worldPosition.x - halfWidth, worldPosition.y - halfWidth, worldPosition.z - halfWidth);
      worldBounds.max.set(worldPosition.x + halfWidth, worldPosition.y + halfWidth, worldPosition.z + halfWidth);
      return;
    }

    // Merge all segment bounds
    const boundsArray = this._segmentBoundsArray;
    const count = this._segmentBoundsCount;

    // Initialize with first active segment bounds
    const firstOffset = firstActive * TrailRenderer.SEGMENT_BOUNDS_FLOAT_STRIDE;
    worldBounds.min.copyFromArray(boundsArray, firstOffset);
    worldBounds.max.copyFromArray(boundsArray, firstOffset);

    // Merge remaining segment bounds
    if (firstActive < firstFree) {
      for (let i = firstActive + 1; i < firstFree; i++) {
        this._mergeSegmentBounds(i, worldBounds);
      }
    } else if (firstActive > firstFree) {
      for (let i = firstActive + 1; i < count; i++) {
        this._mergeSegmentBounds(i, worldBounds);
      }
      for (let i = 0; i < firstFree; i++) {
        this._mergeSegmentBounds(i, worldBounds);
      }
    }

    // Expand by half width for trail thickness
    const { min, max } = worldBounds;
    min.set(min.x - halfWidth, min.y - halfWidth, min.z - halfWidth);
    max.set(max.x + halfWidth, max.y + halfWidth, max.z + halfWidth);
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
    const pointFloatStride = TrailRenderer.POINT_FLOAT_STRIDE;
    const pointByteStride = TrailRenderer.POINT_BYTE_STRIDE;

    const newCapacity = this._currentPointCapacity + increaseCount;
    // Buffer layout: [capacity points] + [1 bridge point]
    // Bridge point is copy of point 0, placed at position capacity to connect wrap-around
    const pointCount = newCapacity + 1;

    const newVertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      pointCount * pointByteStride,
      BufferUsage.Dynamic,
      false
    );
    const newVertices = new Float32Array(pointCount * pointFloatStride);

    // Migrate existing vertex data
    const lastVertices = this._vertices;
    if (lastVertices) {
      const firstFreeElement = this._firstFreeElement;
      newVertices.set(new Float32Array(lastVertices.buffer, 0, firstFreeElement * pointFloatStride));

      // Shift data after firstFreeElement by increaseCount (includes bridge point)
      const nextFreeElement = firstFreeElement + 1;
      const freeEndOffset = (nextFreeElement + increaseCount) * pointFloatStride;
      newVertices.set(new Float32Array(lastVertices.buffer, nextFreeElement * pointFloatStride * 4), freeEndOffset);

      if (this._firstNewElement > firstFreeElement) this._firstNewElement += increaseCount;
      if (this._firstActiveElement > firstFreeElement) this._firstActiveElement += increaseCount;
      if (this._firstRetiredElement > firstFreeElement) this._firstRetiredElement += increaseCount;

      this._bufferResized = true;
    }

    this._vertexBuffer?.destroy();

    this._vertexBuffer = newVertexBuffer;
    this._vertices = newVertices;
    this._currentPointCapacity = newCapacity;

    const vertexBufferBinding = new VertexBufferBinding(newVertexBuffer, TrailRenderer.VERTEX_STRIDE);
    this._primitive.setVertexBufferBinding(0, vertexBufferBinding);
  }

  /**
   * Move expired points from active to retired state.
   * Points in retired state are waiting for GPU to finish rendering before they can be freed.
   */
  private _retireActivePoints(frameCount: number): void {
    const { _playTime: currentTime, time: lifetime, _vertices: vertices, _currentPointCapacity: capacity } = this;
    const firstActiveOld = this._firstActiveElement;
    const pointStride = TrailRenderer.POINT_FLOAT_STRIDE;

    while (this._firstActiveElement !== this._firstFreeElement) {
      const offset = this._firstActiveElement * pointStride + 3;
      const birthTime = vertices[offset];
      if (currentTime - birthTime < lifetime) break;
      // Record the frame when this point was retired (reuse birthTime field)
      vertices[offset] = frameCount;
      this._firstActiveElement = (this._firstActiveElement + 1) % capacity;
    }

    if (this._firstActiveElement !== firstActiveOld) {
      // Update oldest birth time
      if (this._firstActiveElement !== this._firstFreeElement) {
        this._timeParams.z = vertices[this._firstActiveElement * pointStride + 3];
      }
    }
    if (this._firstActiveElement === this._firstFreeElement) {
      this._hasLastPosition = false;
      this._timeParams.z = 0;
      this._timeParams.w = 0;
    }
  }

  /**
   * Free retired points that GPU has finished rendering.
   * WebGL doesn't support mapBufferRange, so this optimization is currently disabled.
   * The condition `frameCount - retireFrame < 0` will never be true, effectively skipping the check.
   */
  private _freeRetiredPoints(frameCount: number): void {
    const capacity = this._currentPointCapacity;
    const pointStride = TrailRenderer.POINT_FLOAT_STRIDE;
    const vertices = this._vertices;

    while (this._firstRetiredElement !== this._firstActiveElement) {
      const retireFrame = vertices[this._firstRetiredElement * pointStride + 3];

      // WebGL doesn't support mapBufferRange, so this optimization is disabled.
      // When mapBufferRange is available, change condition to check if GPU finished rendering.
      if (frameCount - retireFrame < 0) {
        break;
      }

      this._firstRetiredElement = (this._firstRetiredElement + 1) % capacity;
    }
  }

  private _emitNewPoint(): void {
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

    // Generate segment bounds in sync with trail points
    this._generateSegmentBounds(worldPosition);

    this._addPoint(worldPosition);
    this._lastPosition.copyFrom(worldPosition);
    this._hasLastPosition = true;
  }

  private _addPoint(position: Vector3): void {
    const pointIndex = this._firstFreeElement;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const pointStride = TrailRenderer.POINT_FLOAT_STRIDE;
    const vertices = this._vertices;
    const playTime = this._playTime;

    const tangent = TrailRenderer._tempVector3;
    if (this._hasLastPosition) {
      Vector3.subtract(position, this._lastPosition, tangent);
      tangent.normalize();

      // First point has placeholder tangent, update it when second point is added
      if (this._getActivePointCount() === 1) {
        const firstPointIndex = this._firstActiveElement;
        const offset0 = firstPointIndex * pointStride + 5;
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

    // Write top vertex (corner = -1) and bottom vertex (corner = 1)
    const topOffset = pointIndex * pointStride;
    position.copyToArray(vertices, topOffset);
    vertices[topOffset + 3] = playTime;
    vertices[topOffset + 4] = -1;
    tangent.copyToArray(vertices, topOffset + 5);

    const bottomOffset = topOffset + floatStride;
    position.copyToArray(vertices, bottomOffset);
    vertices[bottomOffset + 3] = playTime;
    vertices[bottomOffset + 4] = 1;
    tangent.copyToArray(vertices, bottomOffset + 5);

    // Write to bridge position when writing point 0
    if (pointIndex === 0) {
      const bridgeTopOffset = this._currentPointCapacity * pointStride;
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

    this._firstFreeElement = (this._firstFreeElement + 1) % this._currentPointCapacity;
    this._timeParams.w = playTime;
  }

  private _getActivePointCount(): number {
    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree } = this;
    return firstFree >= firstActive ? firstFree - firstActive : this._currentPointCapacity - firstActive + firstFree;
  }

  /**
   * Generate or update segment bounds for the given position.
   * Uses frame count to determine whether to add new or overwrite existing.
   */
  private _generateSegmentBounds(position: Vector3): void {
    const frameCount = this.engine.time.frameCount;
    const isSameFrame = frameCount === this._lastSegmentBoundsFrameCount;
    let writeIndex: number;

    if (isSameFrame) {
      // Same frame: overwrite previous position (go back one slot)
      writeIndex = this._firstFreeSegmentBounds - 1;
      if (writeIndex < 0) {
        writeIndex = this._segmentBoundsCount - 1;
      }
    } else {
      // New frame: check resize and advance pointer
      writeIndex = this._firstFreeSegmentBounds;
      let nextFree = writeIndex + 1;
      if (nextFree >= this._segmentBoundsCount) {
        nextFree = 0;
      }
      if (nextFree === this._firstActiveSegmentBounds) {
        this._resizeSegmentBoundsArray();
        nextFree = writeIndex + 1; // Recalculate after resize (count increased, no wrap needed)
      }
      this._firstFreeSegmentBounds = nextFree;
      this._lastSegmentBoundsFrameCount = frameCount;
    }

    // Write segment bounds data
    const offset = writeIndex * TrailRenderer.SEGMENT_BOUNDS_FLOAT_STRIDE;
    const boundsArray = this._segmentBoundsArray;
    position.copyToArray(boundsArray, offset);
    boundsArray[offset + 3] = this._playTime;
  }

  /**
   * Retire segment bounds that have expired based on lifetime.
   */
  private _retireSegmentBounds(): void {
    const floatStride = TrailRenderer.SEGMENT_BOUNDS_FLOAT_STRIDE;
    const timeOffset = TrailRenderer.SEGMENT_BOUNDS_TIME_OFFSET;
    const boundsArray = this._segmentBoundsArray;
    const firstFree = this._firstFreeSegmentBounds;
    const count = this._segmentBoundsCount;
    const lifetime = this.time;
    const currentTime = this._playTime;

    while (this._firstActiveSegmentBounds !== firstFree) {
      const index = this._firstActiveSegmentBounds * floatStride;
      const age = currentTime - boundsArray[index + timeOffset];
      if (age <= lifetime) {
        break;
      }
      if (++this._firstActiveSegmentBounds >= count) {
        this._firstActiveSegmentBounds = 0;
      }
    }
  }

  private _mergeSegmentBounds(index: number, bounds: BoundingBox): void {
    const boundsArray = this._segmentBoundsArray;
    const offset = index * TrailRenderer.SEGMENT_BOUNDS_FLOAT_STRIDE;
    const x = boundsArray[offset];
    const y = boundsArray[offset + 1];
    const z = boundsArray[offset + 2];
    const { min, max } = bounds;
    min.set(Math.min(min.x, x), Math.min(min.y, y), Math.min(min.z, z));
    max.set(Math.max(max.x, x), Math.max(max.y, y), Math.max(max.z, z));
  }

  private _resizeSegmentBoundsArray(): void {
    const floatStride = TrailRenderer.SEGMENT_BOUNDS_FLOAT_STRIDE;
    const increaseCount = TrailRenderer.SEGMENT_BOUNDS_INCREASE_COUNT;

    this._segmentBoundsCount += increaseCount;
    const lastBoundsArray = this._segmentBoundsArray;
    const boundsArray = new Float32Array(this._segmentBoundsCount * floatStride);

    if (lastBoundsArray) {
      const firstFree = this._firstFreeSegmentBounds;
      boundsArray.set(new Float32Array(lastBoundsArray.buffer, 0, firstFree * floatStride));

      const nextFree = firstFree + 1;
      const freeEndOffset = (nextFree + increaseCount) * floatStride;
      boundsArray.set(new Float32Array(lastBoundsArray.buffer, nextFree * floatStride * 4), freeEndOffset);

      if (this._firstActiveSegmentBounds > firstFree) {
        this._firstActiveSegmentBounds += increaseCount;
      }
    }

    this._segmentBoundsArray = boundsArray;
  }

  private _uploadNewVertices(): void {
    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree, _vertexBuffer: buffer } = this;
    const firstNew = buffer.isContentLost || this._bufferResized ? firstActive : this._firstNewElement;
    this._bufferResized = false;

    if (firstNew === firstFree) return;

    const pointFloatStride = TrailRenderer.POINT_FLOAT_STRIDE;
    const pointByteStride = TrailRenderer.POINT_BYTE_STRIDE;
    const { buffer: vertexData } = this._vertices;
    const capacity = this._currentPointCapacity;
    const wrapped = firstNew >= firstFree;

    // First segment: wrapped includes bridge (+1 point), non-wrapped ends at firstFree
    const endPoint = wrapped ? capacity + 1 : firstFree;
    buffer.setData(
      new Float32Array(vertexData, firstNew * pointFloatStride * 4, (endPoint - firstNew) * pointFloatStride),
      firstNew * pointByteStride
    );

    if (wrapped) {
      // Second segment
      if (firstFree > 0) {
        buffer.setData(new Float32Array(vertexData, 0, firstFree * pointFloatStride), 0);
      }
    } else if (firstNew === 0) {
      // Upload bridge separately if point 0 was updated
      buffer.setData(
        new Float32Array(vertexData, capacity * pointFloatStride * 4, pointFloatStride),
        capacity * pointByteStride
      );
    }

    this._firstNewElement = firstFree;
  }

  private _addSubRenderElement(
    renderElement: RenderElement,
    material: Material,
    subPrimitive: SubPrimitive,
    start: number,
    count: number
  ): void {
    subPrimitive.start = start;
    subPrimitive.count = count;
    const subRenderElement = this._engine._subRenderElementPool.get();
    subRenderElement.set(this, material, this._primitive, subPrimitive);
    renderElement.addSubRenderElement(subRenderElement);
  }
}
