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
import { SetDataOptions } from "../graphic/enums/SetDataOptions";
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
  private static readonly VERTEX_STRIDE = 36; // 9 floats * 4 bytes
  private static readonly VERTEX_FLOAT_STRIDE = 9; // pos(3) + birthTime(1) + corner(1) + tangent(3) + distance(1)
  private static readonly DISTANCE_OFFSET = 8; // offset of distance field in vertex
  private static readonly POINT_FLOAT_STRIDE = 18; // 2 vertices per point
  private static readonly POINT_BYTE_STRIDE = 72; // 2 vertices per point
  private static readonly POINT_INCREASE_COUNT = 128;

  private static _trailParamsProp = ShaderProperty.getByName("renderer_TrailParams");
  private static _timeDistParamsProp = ShaderProperty.getByName("renderer_TimeDistParams");
  private static _widthCurveProp = ShaderProperty.getByName("renderer_WidthCurve");
  private static _colorKeysProp = ShaderProperty.getByName("renderer_ColorKeys");
  private static _alphaKeysProp = ShaderProperty.getByName("renderer_AlphaKeys");
  private static _curveMaxTimeProp = ShaderProperty.getByName("renderer_CurveMaxTime");

  private static _tempVector3 = new Vector3();

  /** Whether the trail is being created as the object moves. */
  emitting = true;

  /** The minimum distance the object must move before a new trail segment is added, in world units. */
  minVertexDistance = 0.1;

  /** The curve describing the trail width from start to end. */
  @deepClone
  widthCurve = new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 1));

  /** The gradient describing the trail color from start to end. */
  @deepClone
  colorGradient = new ParticleGradient(
    [new GradientColorKey(0, new Color(1, 1, 1, 1)), new GradientColorKey(1, new Color(1, 1, 1, 1))],
    [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)]
  );

  // Shader parameters
  @deepClone
  private _trailParams = new Vector4(1.0, TrailTextureMode.Stretch, 1.0, 0); // x: width, y: textureMode, z: textureScale
  @deepClone
  private _timeDistParams = new Vector4(0, 5.0, 0, 0); // x: currentTime, y: lifetime, z: headDistance, w: tailDistance
  @ignoreClone
  private _curveMaxTime = new Vector4(); // x: colorMaxTime, y: alphaMaxTime, z: widthMaxTime

  // Geometry and rendering
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

  // Point management (circular buffer state)
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

  // Position tracking
  @ignoreClone
  private _lastPosition = new Vector3();
  @ignoreClone
  private _hasLastPosition = false;
  @ignoreClone
  private _cumulativeDistance = 0; // Total distance traveled since trail start

  // Time tracking
  @ignoreClone
  private _playTime = 0;
  @ignoreClone
  private _lastPlayTimeUpdateFrameCount = -1;

  /**
   * The fade-out duration in seconds.
   */
  get time(): number {
    return this._timeDistParams.y;
  }

  set time(value: number) {
    this._timeDistParams.y = value;
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
  }

  protected override _update(context: RenderContext): void {
    super._update(context);

    const time = this.engine.time;
    const playTime = this._updateAndGetPlayTime();
    const frameCount = time.frameCount;

    this._freeRetiredPoints(frameCount);
    this._retireActivePoints(playTime, frameCount);

    if (this.emitting) {
      this._emitNewPoint(playTime);
    }
    // Add active points to vertex buffer when has new points or buffer state changed
    if (this._firstNewElement !== this._firstFreeElement || this._bufferResized || this._vertexBuffer.isContentLost) {
      this._addActivePointsToVertexBuffer();
    }

    const shaderData = this.shaderData;
    const timeDistParams = this._timeDistParams;
    const { _vertices: vertices, _currentPointCapacity: capacity } = this;
    const activeCount = this._getActivePointCount();
    timeDistParams.x = playTime;
    // z: headDistance (newest point), w: tailDistance (oldest point)
    if (activeCount > 0) {
      const headIndex = (this._firstFreeElement - 1 + capacity) % capacity;
      timeDistParams.z = vertices[headIndex * TrailRenderer.POINT_FLOAT_STRIDE + TrailRenderer.DISTANCE_OFFSET];
      timeDistParams.w =
        vertices[this._firstActiveElement * TrailRenderer.POINT_FLOAT_STRIDE + TrailRenderer.DISTANCE_OFFSET];
    } else {
      timeDistParams.z = timeDistParams.w = 0;
    }

    shaderData.setVector4(TrailRenderer._trailParamsProp, this._trailParams);
    shaderData.setVector4(TrailRenderer._timeDistParamsProp, timeDistParams);

    const { colorGradient } = this;
    shaderData.setFloatArray(TrailRenderer._widthCurveProp, this.widthCurve._getTypeArray());
    shaderData.setFloatArray(TrailRenderer._colorKeysProp, colorGradient._getColorTypeArray());
    shaderData.setFloatArray(TrailRenderer._alphaKeysProp, colorGradient._getAlphaTypeArray());

    const colorKeys = colorGradient.colorKeys;
    const alphaKeys = colorGradient.alphaKeys;
    const widthKeys = this.widthCurve.keys;
    this._curveMaxTime.set(
      colorKeys.length ? colorKeys[colorKeys.length - 1].time : 0,
      alphaKeys.length ? alphaKeys[alphaKeys.length - 1].time : 0,
      widthKeys.length ? widthKeys[widthKeys.length - 1].time : 0,
      0
    );
    shaderData.setVector4(TrailRenderer._curveMaxTimeProp, this._curveMaxTime);
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

    // spansBoundary: active points cross buffer end
    // wrapped: spansBoundary AND point 0 has been written (need bridge + second segment)
    const spansBoundary = firstActive > firstFree;
    const wrapped = spansBoundary && firstFree > 0;
    const mainCount =
      (spansBoundary ? this._currentPointCapacity - firstActive + (wrapped ? 1 : 0) : firstFree - firstActive) * 2;
    this._addSubRenderElement(renderElement, material, this._mainSubPrimitive, firstActive * 2, mainCount);

    if (wrapped) {
      this._addSubRenderElement(renderElement, material, this._wrapSubPrimitive, 0, firstFree * 2);
    }

    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const firstActive = this._firstActiveElement;
    const firstFree = this._firstFreeElement;
    const { min, max } = worldBounds;

    let hasTrailGeometry = firstActive !== firstFree;

    // Merge all active points from vertex data
    if (hasTrailGeometry) {
      const vertices = this._vertices;
      const pointStride = TrailRenderer.POINT_FLOAT_STRIDE;

      min.set(Infinity, Infinity, Infinity);
      max.set(-Infinity, -Infinity, -Infinity);

      const wrapped = firstActive > firstFree;
      for (let i = firstActive, end = wrapped ? this._currentPointCapacity : firstFree; i < end; i++) {
        this._mergePointPosition(vertices, i * pointStride, min, max);
      }
      if (wrapped) {
        for (let i = 0; i < firstFree; i++) {
          this._mergePointPosition(vertices, i * pointStride, min, max);
        }
      }
    } else {
      // No active points - initialize with last position or entity position
      const position = this._hasLastPosition ? this._lastPosition : this.entity.transform.worldPosition;
      min.copyFrom(position);
      max.copyFrom(position);
    }

    // Pre-generate: merge current position if it would create a new point
    if (this.emitting && this._hasLastPosition) {
      const worldPosition = this.entity.transform.worldPosition;
      if (Vector3.distance(worldPosition, this._lastPosition) >= this.minVertexDistance) {
        Vector3.min(min, worldPosition, min);
        Vector3.max(max, worldPosition, max);
        hasTrailGeometry = true;
      }
    }

    // Only expand by half width when there's actual/upcoming trail geometry
    if (hasTrailGeometry) {
      // Find max width multiplier from widthCurve
      let maxWidthMultiplier = 0;
      const widthKeys = this.widthCurve.keys;
      for (let i = 0, n = widthKeys.length; i < n; i++) {
        const value = widthKeys[i].value;
        if (value > maxWidthMultiplier) {
          maxWidthMultiplier = value;
        }
      }
      const halfWidth = this.width * maxWidthMultiplier * 0.5;
      min.set(min.x - halfWidth, min.y - halfWidth, min.z - halfWidth);
      max.set(max.x + halfWidth, max.y + halfWidth, max.z + halfWidth);
    }
  }

  private _mergePointPosition(vertices: Float32Array, offset: number, min: Vector3, max: Vector3): void {
    const x = vertices[offset];
    const y = vertices[offset + 1];
    const z = vertices[offset + 2];
    min.set(Math.min(min.x, x), Math.min(min.y, y), Math.min(min.z, z));
    max.set(Math.max(max.x, x), Math.max(max.y, y), Math.max(max.z, z));
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._vertexBuffer?.destroy();
    this._primitive?.destroy();
  }

  private _updateAndGetPlayTime(): number {
    const time = this.engine.time;
    const frameCount = time.frameCount;
    if (frameCount !== this._lastPlayTimeUpdateFrameCount) {
      this._playTime += time.deltaTime;
      this._lastPlayTimeUpdateFrameCount = frameCount;
    }
    return this._playTime;
  }

  private _initGeometry(): void {
    const primitive = new Primitive(this.engine);
    this._primitive = primitive;
    // Vertex layout (9 floats = 36 bytes):
    // a_PositionBirthTime: xyz = position, w = birthTime (offset 0)
    // a_CornerTangent: x = corner (-1 or 1), yzw = tangent direction (offset 16)
    // a_Distance: distance from trail head in world units (offset 32)
    primitive.addVertexElement(new VertexElement("a_PositionBirthTime", 0, VertexElementFormat.Vector4, 0));
    primitive.addVertexElement(new VertexElement("a_CornerTangent", 16, VertexElementFormat.Vector4, 0));
    primitive.addVertexElement(new VertexElement("a_Distance", 32, VertexElementFormat.Float, 0));

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

    this._primitive.setVertexBufferBinding(0, new VertexBufferBinding(newVertexBuffer, TrailRenderer.VERTEX_STRIDE));
  }

  private _retireActivePoints(currentTime: number, frameCount: number): void {
    const { time: lifetime, _vertices: vertices, _currentPointCapacity: capacity } = this;
    const pointStride = TrailRenderer.POINT_FLOAT_STRIDE;

    while (this._firstActiveElement !== this._firstFreeElement) {
      const offset = this._firstActiveElement * pointStride + 3;
      const age = currentTime - vertices[offset];
      // Use Math.fround to ensure CPU/GPU precision consistency
      if (Math.fround(age) < lifetime) {
        break;
      }
      // Record the frame when this point was retired (reuse birthTime field)
      vertices[offset] = frameCount;
      this._firstActiveElement = (this._firstActiveElement + 1) % capacity;
    }
  }

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

  private _emitNewPoint(playTime: number): void {
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

    this._addPoint(worldPosition, playTime);
    this._lastPosition.copyFrom(worldPosition);
    this._hasLastPosition = true;
  }

  private _addPoint(position: Vector3, playTime: number): void {
    const pointIndex = this._firstFreeElement;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const pointStride = TrailRenderer.POINT_FLOAT_STRIDE;
    const vertices = this._vertices;
    const capacity = this._currentPointCapacity;

    const tangent = TrailRenderer._tempVector3;
    if (this._hasLastPosition) {
      Vector3.subtract(position, this._lastPosition, tangent);
      const segmentLength = tangent.length();
      tangent.normalize();

      // First point has placeholder tangent, update it when second point is added
      if (this._getActivePointCount() === 1) {
        const firstPointOffset = this._firstActiveElement * pointStride;
        tangent.copyToArray(vertices, firstPointOffset + 5); // Top vertex tangent
        tangent.copyToArray(vertices, firstPointOffset + floatStride + 5); // Bottom vertex tangent
        // Mark first point for re-upload since its tangent changed
        this._firstNewElement = this._firstActiveElement;
      }

      // Update cumulative distance
      this._cumulativeDistance += segmentLength;
    } else {
      // First point uses placeholder tangent (will be corrected when second point arrives)
      tangent.set(0, 0, 1);
    }

    // Write top vertex (corner = -1) and bottom vertex (corner = 1)
    // Store absolute cumulative distance (written once, never updated)
    const distOffset = TrailRenderer.DISTANCE_OFFSET;
    const cumulativeDist = this._cumulativeDistance;
    const topOffset = pointIndex * pointStride;
    position.copyToArray(vertices, topOffset);
    vertices[topOffset + 3] = playTime;
    vertices[topOffset + 4] = -1;
    tangent.copyToArray(vertices, topOffset + 5);
    vertices[topOffset + distOffset] = cumulativeDist;

    const bottomOffset = topOffset + floatStride;
    position.copyToArray(vertices, bottomOffset);
    vertices[bottomOffset + 3] = playTime;
    vertices[bottomOffset + 4] = 1;
    tangent.copyToArray(vertices, bottomOffset + 5);
    vertices[bottomOffset + distOffset] = cumulativeDist;

    // Write to bridge position when writing point 0 (bridge = copy of point 0 to connect wrap-around)
    if (pointIndex === 0) {
      const bridgeTopOffset = capacity * pointStride;
      const bridgeBottomOffset = bridgeTopOffset + floatStride;
      position.copyToArray(vertices, bridgeTopOffset);
      vertices[bridgeTopOffset + 3] = playTime;
      vertices[bridgeTopOffset + 4] = -1;
      tangent.copyToArray(vertices, bridgeTopOffset + 5);
      vertices[bridgeTopOffset + distOffset] = cumulativeDist;
      position.copyToArray(vertices, bridgeBottomOffset);
      vertices[bridgeBottomOffset + 3] = playTime;
      vertices[bridgeBottomOffset + 4] = 1;
      tangent.copyToArray(vertices, bridgeBottomOffset + 5);
      vertices[bridgeBottomOffset + distOffset] = cumulativeDist;
    }

    this._firstFreeElement = (this._firstFreeElement + 1) % capacity;
  }

  private _getActivePointCount(): number {
    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree, _currentPointCapacity: capacity } = this;
    return firstFree >= firstActive ? firstFree - firstActive : capacity - firstActive + firstFree;
  }

  private _addActivePointsToVertexBuffer(): void {
    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree, _vertexBuffer: buffer } = this;

    if (firstActive === firstFree) return;

    const pointFloatStride = TrailRenderer.POINT_FLOAT_STRIDE;
    const pointByteStride = TrailRenderer.POINT_BYTE_STRIDE;
    const capacity = this._currentPointCapacity;
    // spansBoundary: active points cross buffer end
    // wrapped: spansBoundary AND point 0 has been written (bridge is valid)
    const spansBoundary = firstActive > firstFree;
    const wrapped = spansBoundary && firstFree > 0;

    // Use Discard mode (buffer orphaning) to avoid GPU sync stalls
    // Upload all active vertices as a full buffer update
    if (spansBoundary) {
      // First segment: [firstActive -> capacity], +bridge only if wrapped (point 0 was written)
      const firstSegmentPoints = capacity - firstActive + (wrapped ? 1 : 0);
      buffer.setData(
        new Float32Array(
          this._vertices.buffer,
          firstActive * pointFloatStride * 4,
          firstSegmentPoints * pointFloatStride
        ),
        firstActive * pointByteStride,
        0,
        undefined,
        SetDataOptions.Discard
      );
      // Second segment: [0 -> firstFree]
      if (firstFree > 0) {
        buffer.setData(new Float32Array(this._vertices.buffer, 0, firstFree * pointFloatStride), 0);
      }
    } else {
      // Non-wrapped case: [firstActive -> firstFree]
      buffer.setData(
        new Float32Array(
          this._vertices.buffer,
          firstActive * pointFloatStride * 4,
          (firstFree - firstActive) * pointFloatStride
        ),
        firstActive * pointByteStride,
        0,
        undefined,
        SetDataOptions.Discard
      );
      // Upload bridge if point 0 is active
      if (firstActive === 0) {
        buffer.setData(
          new Float32Array(this._vertices.buffer, capacity * pointFloatStride * 4, pointFloatStride),
          capacity * pointByteStride
        );
      }
    }

    this._firstNewElement = firstFree;
    this._bufferResized = false;
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
