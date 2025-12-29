import { BoundingBox, Color, Vector3 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { Renderer } from "../Renderer";
import { RenderContext } from "../RenderPipeline/RenderContext";
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
import { ParticleCompositeCurve } from "../particle/modules/ParticleCompositeCurve";
import { GradientAlphaKey, GradientColorKey, ParticleGradient } from "../particle/modules/ParticleGradient";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TrailTextureMode } from "./enums/TrailTextureMode";

/**
 * Trail Renderer Component.
 * Renders a trail behind a moving object.
 */
export class TrailRenderer extends Renderer {
  private static _currentTimeProp = ShaderProperty.getByName("renderer_CurrentTime");
  private static _lifetimeProp = ShaderProperty.getByName("renderer_Lifetime");
  private static _widthProp = ShaderProperty.getByName("renderer_Width");
  private static _textureModeProp = ShaderProperty.getByName("renderer_TextureMode");
  private static _textureScaleProp = ShaderProperty.getByName("renderer_TextureScale");
  private static _widthCurveProp = ShaderProperty.getByName("renderer_WidthCurve");
  private static _widthCurveCountProp = ShaderProperty.getByName("renderer_WidthCurveCount");
  private static _colorKeysProp = ShaderProperty.getByName("renderer_ColorKeys");
  private static _alphaKeysProp = ShaderProperty.getByName("renderer_AlphaKeys");
  private static readonly VERTEX_STRIDE = 32;
  private static readonly VERTEX_FLOAT_STRIDE = 8;
  private static readonly _pointIncreaseCount = 128;
  private static _tempVector3 = new Vector3();

  /** How long the trail points last (in seconds). */
  time = 5.0;
  /** The width of the trail. */
  width = 1.0;
  /** The minimum distance between trail points. */
  minVertexDistance = 0.1;
  /** Controls how the texture is applied to the trail. */
  textureMode = TrailTextureMode.Stretch;
  /** The texture scale for Tile texture mode. */
  textureScale = 1.0;
  /** Width curve over lifetime (0 = head, 1 = tail). */
  @deepClone
  widthCurve = new ParticleCompositeCurve(1.0);
  /** Color gradient over lifetime (0 = head, 1 = tail). */
  @deepClone
  colorGradient = new ParticleGradient(
    [new GradientColorKey(0, new Color(1, 1, 1, 1)), new GradientColorKey(1, new Color(1, 1, 1, 1))],
    [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)]
  );
  /** Whether the trail is currently emitting new points. */
  emitting = true;

  @ignoreClone
  private _primitive: Primitive;
  @ignoreClone
  private _subPrimitive: SubPrimitive;
  @ignoreClone
  private _subPrimitive2: SubPrimitive;
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
  private _boundsMin = new Vector3();
  @ignoreClone
  private _boundsMax = new Vector3();
  @ignoreClone
  private _boundsDirty = true;
  @ignoreClone
  private _widthCurveData: Float32Array;

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
    this._hasLastPosition = false;
    this._boundsDirty = true;
  }

  protected override _update(context: RenderContext): void {
    super._update(context);

    this._playTime += this.engine.time.deltaTime;
    this._retireActivePoints();

    if (this.emitting) {
      this._tryAddNewPoint();
    }

    const shaderData = this.shaderData;
    shaderData.setFloat(TrailRenderer._currentTimeProp, this._playTime);
    shaderData.setFloat(TrailRenderer._lifetimeProp, this.time);
    shaderData.setFloat(TrailRenderer._widthProp, this.width);
    shaderData.setInt(TrailRenderer._textureModeProp, this.textureMode);
    shaderData.setFloat(TrailRenderer._textureScaleProp, this.textureScale);
    this._updateWidthCurve(shaderData);
    this._updateColorGradient(shaderData);
  }

  protected override _render(context: RenderContext): void {
    const activeCount = this._getActivePointCount();
    if (activeCount < 2) return;

    if (this._firstNewElement !== this._firstFreeElement || this._vertexBuffer.isContentLost) {
      this._uploadNewVertices();
    }

    const material = this.getMaterial();
    if (!material || material.destroyed || material.shader.destroyed) return;

    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree } = this;
    const engine = this._engine;
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);
    const subRenderElementPool = engine._subRenderElementPool;
    const primitive = this._primitive;

    const subPrimitive = this._subPrimitive;
    subPrimitive.start = firstActive * 2;

    if (firstActive >= firstFree) {
      // Wrapped: first segment + bridge, then second segment
      subPrimitive.count = (this._currentPointCapacity - firstActive + 1) * 2;

      const subRenderElement = subRenderElementPool.get();
      subRenderElement.set(this, material, primitive, subPrimitive);
      renderElement.addSubRenderElement(subRenderElement);

      if (firstFree > 0) {
        const subPrimitive2 = this._subPrimitive2;
        subPrimitive2.start = 0;
        subPrimitive2.count = firstFree * 2;
        const subRenderElement2 = subRenderElementPool.get();
        subRenderElement2.set(this, material, primitive, subPrimitive2);
        renderElement.addSubRenderElement(subRenderElement2);
      }
    } else {
      // Non-wrapped: single draw
      subPrimitive.count = (firstFree - firstActive) * 2;
      const subRenderElement = subRenderElementPool.get();
      subRenderElement.set(this, material, primitive, subPrimitive);
      renderElement.addSubRenderElement(subRenderElement);
    }

    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const activeCount = this._getActivePointCount();
    const halfWidth = this.width * 0.5;

    if (activeCount === 0) {
      const worldPosition = this.entity.transform.worldPosition;
      worldBounds.min.set(worldPosition.x - halfWidth, worldPosition.y - halfWidth, worldPosition.z - halfWidth);
      worldBounds.max.set(worldPosition.x + halfWidth, worldPosition.y + halfWidth, worldPosition.z + halfWidth);
      return;
    }

    if (this._boundsDirty) {
      this._recalculateBounds();
    }

    const { _boundsMin: min, _boundsMax: max } = this;
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
    this._subPrimitive = new SubPrimitive(0, 0, MeshTopology.TriangleStrip);
    this._subPrimitive2 = new SubPrimitive(0, 0, MeshTopology.TriangleStrip);

    this._resizeBuffer(TrailRenderer._pointIncreaseCount);
  }

  private _resizeBuffer(increaseCount: number): void {
    const engine = this.engine;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const byteStride = TrailRenderer.VERTEX_STRIDE;

    const newCapacity = this._currentPointCapacity + increaseCount;
    // Buffer layout: [capacity points] + [1 bridge point]
    // Bridge point is copy of point 0, placed at position capacity to connect wrap-around
    const vertexCount = newCapacity * 2 + 2; // +2 vertices for bridge point

    // Create new vertex buffer (no index buffer needed - using drawArrays)
    const newVertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertexCount * byteStride, BufferUsage.Dynamic, false);
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
        newVertices.set(
          new Float32Array(lastVertices.buffer, nextFreeElement * 2 * floatStride * 4),
          freeEndOffset
        );
      }

      // Update pointers
      if (this._firstNewElement > firstFreeElement) {
        this._firstNewElement += increaseCount;
      }
      if (this._firstActiveElement > firstFreeElement) {
        this._firstActiveElement += increaseCount;
      }

      this._bufferResized = true;
    }

    // Destroy old vertex buffer
    this._vertexBuffer?.destroy();

    this._vertexBuffer = newVertexBuffer;
    this._vertices = newVertices;
    this._currentPointCapacity = newCapacity;

    // Update primitive vertex buffer binding (no index buffer)
    const primitive = this._primitive;
    const vertexBufferBinding = new VertexBufferBinding(newVertexBuffer, byteStride);
    if (primitive.vertexBufferBindings.length > 0) {
      primitive.setVertexBufferBinding(0, vertexBufferBinding);
    } else {
      primitive.vertexBufferBindings.push(vertexBufferBinding);
    }
  }

  private _retireActivePoints(): void {
    const currentTime = this._playTime;
    const lifetime = this.time;
    const firstActiveOld = this._firstActiveElement;

    while (this._firstActiveElement !== this._firstFreeElement) {
      const offset = this._firstActiveElement * 2 * TrailRenderer.VERTEX_FLOAT_STRIDE;
      const birthTime = this._vertices[offset + 3];

      if (currentTime - birthTime < lifetime) break;

      this._firstActiveElement++;
      if (this._firstActiveElement >= this._currentPointCapacity) {
        this._firstActiveElement = 0;
      }
    }

    if (this._firstActiveElement !== firstActiveOld) {
      this._boundsDirty = true;
    }

    if (this._firstActiveElement === this._firstFreeElement) {
      this._hasLastPosition = false;
    }
  }

  private _tryAddNewPoint(): void {
    const worldPosition = this.entity.transform.worldPosition;

    if (this._hasLastPosition) {
      if (Vector3.distance(worldPosition, this._lastPosition) < this.minVertexDistance) {
        return;
      }
    }

    let nextFreeElement = this._firstFreeElement + 1;
    if (nextFreeElement >= this._currentPointCapacity) {
      nextFreeElement = 0;
    }

    // If buffer is full, expand it
    if (nextFreeElement === this._firstActiveElement) {
      this._resizeBuffer(TrailRenderer._pointIncreaseCount);
    }

    this._addPoint(worldPosition);
    this._lastPosition.copyFrom(worldPosition);
    this._hasLastPosition = true;
  }

  private _addPoint(position: Vector3): void {
    const pointIndex = this._firstFreeElement;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const vertices = this._vertices;

    const tangent = TrailRenderer._tempVector3;
    if (this._hasLastPosition) {
      Vector3.subtract(position, this._lastPosition, tangent);
      tangent.normalize();

      // First point has placeholder tangent, update it when second point is added
      if (this._getActivePointCount() === 1) {
        const firstPointIndex = this._firstActiveElement;
        for (let corner = -1; corner <= 1; corner += 2) {
          const vertexIndex = firstPointIndex * 2 + (corner === -1 ? 0 : 1);
          tangent.copyToArray(vertices, vertexIndex * floatStride + 5);
        }
        // Mark first point for re-upload since its tangent changed
        this._firstNewElement = this._firstActiveElement;
      }
    } else {
      // First point uses placeholder tangent (will be corrected when second point arrives)
      tangent.set(0, 0, 1);
    }

    // Write vertex data for top and bottom vertices (corner = -1 and 1)
    for (let corner = -1; corner <= 1; corner += 2) {
      const vertexIndex = pointIndex * 2 + (corner === -1 ? 0 : 1);
      const offset = vertexIndex * floatStride;

      position.copyToArray(vertices, offset);
      vertices[offset + 3] = this._playTime;
      vertices[offset + 4] = corner;
      tangent.copyToArray(vertices, offset + 5);

      // Also write to bridge position when writing point 0
      if (pointIndex === 0) {
        const bridgeOffset = (this._currentPointCapacity * 2 + (corner === -1 ? 0 : 1)) * floatStride;
        position.copyToArray(vertices, bridgeOffset);
        vertices[bridgeOffset + 3] = this._playTime;
        vertices[bridgeOffset + 4] = corner;
        tangent.copyToArray(vertices, bridgeOffset + 5);
      }
    }

    this._expandBounds(position);

    this._firstFreeElement++;
    if (this._firstFreeElement >= this._currentPointCapacity) {
      this._firstFreeElement = 0;
    }
  }

  private _getActivePointCount(): number {
    const { _firstActiveElement: firstActive, _firstFreeElement: firstFree } = this;
    return firstFree >= firstActive ? firstFree - firstActive : this._currentPointCapacity - firstActive + firstFree;
  }

  private _expandBounds(position: Vector3): void {
    const { _boundsMin: min, _boundsMax: max } = this;

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
    const { _boundsMin: min, _boundsMax: max } = this;

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
    let pointIndex = this._firstActiveElement + 1;
    if (pointIndex >= this._currentPointCapacity) pointIndex = 0;

    for (let i = 1; i < activeCount; i++) {
      pointPosition.copyFromArray(vertices, pointIndex * 2 * floatStride);
      Vector3.min(min, pointPosition, min);
      Vector3.max(max, pointPosition, max);

      pointIndex++;
      if (pointIndex >= this._currentPointCapacity) pointIndex = 0;
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
    let uploadBridge = false;

    if (firstNew < firstFree) {
      buffer.setData(
        new Float32Array(vertexData, firstNew * 2 * floatStride * 4, (firstFree - firstNew) * 2 * floatStride),
        firstNew * 2 * byteStride
      );
      uploadBridge = firstNew === 0;
    } else {
      // Wrapped range: upload in two parts
      buffer.setData(
        new Float32Array(vertexData, firstNew * 2 * floatStride * 4, (capacity - firstNew) * 2 * floatStride),
        firstNew * 2 * byteStride
      );
      if (firstFree > 0) {
        buffer.setData(new Float32Array(vertexData, 0, firstFree * 2 * floatStride), 0);
        uploadBridge = true;
      }
    }

    // Upload bridge (copy of point 0) if point 0 was updated
    if (uploadBridge) {
      buffer.setData(
        new Float32Array(vertexData, capacity * 2 * floatStride * 4, 2 * floatStride),
        capacity * 2 * byteStride
      );
    }

    this._firstNewElement = firstFree;
  }

  private _updateWidthCurve(shaderData: ShaderData): void {
    const curve = this.widthCurve;
    const widthCurveData = this._widthCurveData || (this._widthCurveData = new Float32Array(8));

    if (curve.mode === 0) {
      widthCurveData[0] = 0;
      widthCurveData[1] = curve.constant;
      shaderData.setFloatArray(TrailRenderer._widthCurveProp, widthCurveData);
      shaderData.setInt(TrailRenderer._widthCurveCountProp, 1);
    } else if (curve.mode === 2 && curve.curve) {
      const keys = curve.curve.keys;
      const count = Math.min(keys.length, 4);
      for (let i = 0, offset = 0; i < count; i++, offset += 2) {
        const key = keys[i];
        widthCurveData[offset] = key.time;
        widthCurveData[offset + 1] = key.value;
      }
      shaderData.setFloatArray(TrailRenderer._widthCurveProp, widthCurveData);
      shaderData.setInt(TrailRenderer._widthCurveCountProp, count);
    } else {
      widthCurveData[0] = 0;
      widthCurveData[1] = 1;
      shaderData.setFloatArray(TrailRenderer._widthCurveProp, widthCurveData);
      shaderData.setInt(TrailRenderer._widthCurveCountProp, 1);
    }
  }

  private _updateColorGradient(shaderData: ShaderData): void {
    const gradient = this.colorGradient;
    shaderData.setFloatArray(TrailRenderer._colorKeysProp, gradient._getColorTypeArray());
    shaderData.setFloatArray(TrailRenderer._alphaKeysProp, gradient._getAlphaTypeArray());
  }
}
