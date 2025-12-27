import { BoundingBox, Color, Vector3 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { Renderer } from "../Renderer";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { Buffer } from "../graphic/Buffer";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { ParticleCompositeCurve } from "../particle/modules/ParticleCompositeCurve";
import { ParticleGradient } from "../particle/modules/ParticleGradient";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { TrailTextureMode } from "./enums/TrailTextureMode";

/**
 * Trail Renderer Component.
 * Renders a trail behind a moving object.
 */
export class TrailRenderer extends Renderer {
  // Shader properties
  private static _currentTimeProp = ShaderProperty.getByName("renderer_CurrentTime");
  private static _lifetimeProp = ShaderProperty.getByName("renderer_Lifetime");
  private static _widthProp = ShaderProperty.getByName("renderer_Width");
  private static _textureModeProp = ShaderProperty.getByName("renderer_TextureMode");
  private static _tileScaleProp = ShaderProperty.getByName("renderer_TileScale");

  // Width curve shader properties
  private static _widthCurveProp = ShaderProperty.getByName("renderer_WidthCurve");
  private static _widthCurveCountProp = ShaderProperty.getByName("renderer_WidthCurveCount");

  // Color gradient shader properties
  private static _colorKeysProp = ShaderProperty.getByName("renderer_ColorKeys");
  private static _colorKeyCountProp = ShaderProperty.getByName("renderer_ColorKeyCount");
  private static _alphaKeysProp = ShaderProperty.getByName("renderer_AlphaKeys");
  private static _alphaKeyCountProp = ShaderProperty.getByName("renderer_AlphaKeyCount");

  // Vertex layout constants
  private static readonly VERTEX_STRIDE = 52; // bytes per vertex
  private static readonly VERTEX_FLOAT_STRIDE = 13; // floats per vertex

  // Temp variables
  private static _tempVector3 = new Vector3();

  /** How long the trail points last (in seconds). */
  time = 5.0;

  /** The width of the trail. */
  width = 1.0;

  /** The minimum distance between trail points (in world units). */
  minVertexDistance = 0.1;

  /** Controls how the texture is applied to the trail. */
  textureMode = TrailTextureMode.Stretch;

  /** The tile scale for Tile texture mode. */
  tileScale = 1.0;

  /** Trail color (used when colorGradient is not set). */
  @deepClone
  color = new Color(1, 1, 1, 1);

  /**
   * Width curve over lifetime.
   * The curve is evaluated based on normalizedAge (0 = head, 1 = tail).
   * Default is a constant curve of 1.0.
   */
  @deepClone
  widthCurve = new ParticleCompositeCurve(1.0);

  /**
   * Color gradient over lifetime.
   * The gradient is evaluated based on normalizedAge (0 = head, 1 = tail).
   * If not set (null), the color property is used.
   */
  @deepClone
  colorGradient: ParticleGradient = null;

  /** Whether the trail is currently emitting new points. */
  emitting = true;

  // Internal state
  @ignoreClone
  private _primitive: Primitive;
  @ignoreClone
  private _subPrimitive: SubPrimitive;
  @ignoreClone
  private _vertexBuffer: Buffer;
  @ignoreClone
  private _vertexBufferBinding: VertexBufferBinding;
  @ignoreClone
  private _vertices: Float32Array;
  @ignoreClone
  private _indexBuffer: Buffer;
  @ignoreClone
  private _indices: Uint16Array;

  // Ring buffer pointers
  @ignoreClone
  private _firstActiveElement: number = 0;
  @ignoreClone
  private _firstNewElement: number = 0;
  @ignoreClone
  private _firstFreeElement: number = 0;
  @ignoreClone
  private _maxPointCount: number = 256;

  // Last recorded position
  @ignoreClone
  private _lastPosition: Vector3 = new Vector3();
  @ignoreClone
  private _hasLastPosition: boolean = false;

  // Playback time
  @ignoreClone
  private _playTime: number = 0;

  // Bounds optimization: cached bounds and dirty flag
  @ignoreClone
  private _boundsMin: Vector3 = new Vector3();
  @ignoreClone
  private _boundsMax: Vector3 = new Vector3();
  @ignoreClone
  private _boundsDirty: boolean = true;

  // Shader data cache
  @ignoreClone
  private _widthCurveData: Float32Array;
  @ignoreClone
  private _colorKeysData: Float32Array;
  @ignoreClone
  private _alphaKeysData: Float32Array;

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

    const deltaTime = this.engine.time.deltaTime;
    this._playTime += deltaTime;

    // Retire old points
    this._retireActivePoints();

    // Add new point if emitting and moved enough
    if (this.emitting) {
      this._tryAddNewPoint();
    }

    // Update shader uniforms
    const shaderData = this.shaderData;
    shaderData.setFloat(TrailRenderer._currentTimeProp, this._playTime);
    shaderData.setFloat(TrailRenderer._lifetimeProp, this.time);
    shaderData.setFloat(TrailRenderer._widthProp, this.width);
    shaderData.setInt(TrailRenderer._textureModeProp, this.textureMode);
    shaderData.setFloat(TrailRenderer._tileScaleProp, this.tileScale);

    // Update width curve
    this._updateWidthCurve(shaderData);

    // Update color gradient
    this._updateColorGradient(shaderData);
  }

  protected override _render(context: RenderContext): void {
    const activeCount = this._getActivePointCount();
    if (activeCount < 2) {
      return; // Need at least 2 points to form a segment
    }

    // Only update vertex buffer when there are new points or buffer content is lost
    if (this._firstNewElement !== this._firstFreeElement || this._vertexBuffer.isContentLost) {
      this._uploadNewVertices();
    }

    // Update index buffer to handle ring buffer wrap-around
    const indexCount = this._updateIndexBuffer(activeCount);
    this._subPrimitive.count = indexCount;

    let material = this.getMaterial();
    if (!material) {
      return;
    }

    if (material.destroyed || material.shader.destroyed) {
      return;
    }

    const engine = this._engine;
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);
    const subRenderElement = engine._subRenderElementPool.get();
    subRenderElement.set(this, material, this._primitive, this._subPrimitive);
    renderElement.addSubRenderElement(subRenderElement);
    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const activeCount = this._getActivePointCount();
    const halfWidth = this.width * 0.5;

    if (activeCount === 0) {
      // No active points, use current entity position
      const worldPosition = this.entity.transform.worldPosition;
      worldBounds.min.set(worldPosition.x - halfWidth, worldPosition.y - halfWidth, worldPosition.z - halfWidth);
      worldBounds.max.set(worldPosition.x + halfWidth, worldPosition.y + halfWidth, worldPosition.z + halfWidth);
      return;
    }

    // Recalculate bounds only when dirty
    if (this._boundsDirty) {
      this._recalculateBounds();
    }

    // Apply half width offset to cached bounds
    const { _boundsMin: min, _boundsMax: max } = this;
    worldBounds.min.set(min.x - halfWidth, min.y - halfWidth, min.z - halfWidth);
    worldBounds.max.set(max.x + halfWidth, max.y + halfWidth, max.z + halfWidth);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._primitive?.destroy();
  }

  private _initGeometry(): void {
    const engine = this.engine;
    const maxPoints = this._maxPointCount;

    // Each point generates 2 vertices (top and bottom of the trail strip)
    const vertexCount = maxPoints * 2;
    const byteLength = vertexCount * TrailRenderer.VERTEX_STRIDE;

    // Create vertex buffer
    this._vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);

    // Create CPU-side vertex array
    this._vertices = new Float32Array(vertexCount * TrailRenderer.VERTEX_FLOAT_STRIDE);

    // Create vertex buffer binding
    this._vertexBufferBinding = new VertexBufferBinding(this._vertexBuffer, TrailRenderer.VERTEX_STRIDE);

    // Create index buffer (max indices = maxPoints * 2 for triangle strip)
    const maxIndices = maxPoints * 2;
    this._indexBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      maxIndices * 2, // Uint16 = 2 bytes
      BufferUsage.Dynamic,
      false
    );
    this._indices = new Uint16Array(maxIndices);

    // Create primitive
    this._primitive = new Primitive(engine);
    this._primitive.vertexBufferBindings.push(this._vertexBufferBinding);
    this._primitive.setIndexBufferBinding(new IndexBufferBinding(this._indexBuffer, IndexFormat.UInt16));

    // Define vertex elements:
    // a_Position: vec3 (12 bytes, offset 0)
    // a_BirthTime: float (4 bytes, offset 12)
    // a_NormalizedWidth: float (4 bytes, offset 16)
    // a_Color: vec4 (16 bytes, offset 20)
    // a_Corner: float (4 bytes, offset 36)
    // a_Tangent: vec3 (12 bytes, offset 40)
    // Total: 52 bytes per vertex
    this._primitive.addVertexElement(new VertexElement("a_Position", 0, VertexElementFormat.Vector3, 0));
    this._primitive.addVertexElement(new VertexElement("a_BirthTime", 12, VertexElementFormat.Float, 0));
    this._primitive.addVertexElement(new VertexElement("a_NormalizedWidth", 16, VertexElementFormat.Float, 0));
    this._primitive.addVertexElement(new VertexElement("a_Color", 20, VertexElementFormat.Vector4, 0));
    this._primitive.addVertexElement(new VertexElement("a_Corner", 36, VertexElementFormat.Float, 0));
    this._primitive.addVertexElement(new VertexElement("a_Tangent", 40, VertexElementFormat.Vector3, 0));

    // Create sub-primitive for drawing
    this._subPrimitive = new SubPrimitive(0, 0, MeshTopology.TriangleStrip);
  }

  private _retireActivePoints(): void {
    const currentTime = this._playTime;
    const lifetime = this.time;
    const firstActiveOld = this._firstActiveElement;

    // Move firstActiveElement forward for points that have expired
    while (this._firstActiveElement !== this._firstFreeElement) {
      const offset = this._firstActiveElement * 2 * TrailRenderer.VERTEX_FLOAT_STRIDE;
      const birthTime = this._vertices[offset + 3]; // a_BirthTime offset

      if (currentTime - birthTime < lifetime) {
        break; // This point is still alive
      }

      // Move to next element
      this._firstActiveElement++;
      if (this._firstActiveElement >= this._maxPointCount) {
        this._firstActiveElement = 0;
      }
    }

    // If points were retired, bounds need recalculation
    if (this._firstActiveElement !== firstActiveOld) {
      this._boundsDirty = true;
    }

    // If all points have expired, reset the trail state
    if (this._firstActiveElement === this._firstFreeElement) {
      this._hasLastPosition = false;
    }
  }

  private _tryAddNewPoint(): void {
    const worldPosition = this.entity.transform.worldPosition;

    // Check if we've moved enough to add a new point
    if (this._hasLastPosition) {
      const distance = Vector3.distance(worldPosition, this._lastPosition);
      if (distance < this.minVertexDistance) {
        return;
      }
    }

    // Check if we have space for a new point
    let nextFreeElement = this._firstFreeElement + 1;
    if (nextFreeElement >= this._maxPointCount) {
      nextFreeElement = 0;
    }

    if (nextFreeElement === this._firstActiveElement) {
      // Buffer is full, retire oldest point
      this._firstActiveElement++;
      if (this._firstActiveElement >= this._maxPointCount) {
        this._firstActiveElement = 0;
      }
    }

    // Add the new point
    this._addPoint(worldPosition);

    // Update last position
    this._lastPosition.copyFrom(worldPosition);
    this._hasLastPosition = true;
  }

  private _addPoint(position: Vector3): void {
    const idx = this._firstFreeElement;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const vertices = this._vertices;

    // Calculate tangent (direction from last position to current position)
    const tangent = TrailRenderer._tempVector3;
    if (this._hasLastPosition) {
      Vector3.subtract(position, this._lastPosition, tangent);
      tangent.normalize();

      // If this is the second point, update the first point's tangent
      // to match this tangent (so the tail doesn't have wrong orientation)
      if (this._getActivePointCount() === 1) {
        const firstIdx = this._firstActiveElement;
        for (let corner = -1; corner <= 1; corner += 2) {
          const vertexIdx = firstIdx * 2 + (corner === -1 ? 0 : 1);
          const offset = vertexIdx * floatStride;
          tangent.copyToArray(vertices, offset + 10); // Update a_Tangent
        }
        // First point's tangent was updated, need to re-upload it
        this._firstNewElement = this._firstActiveElement;
      }
    } else {
      // First point - use forward direction (will be updated when second point is added)
      tangent.set(0, 0, 1);
    }

    // Each point has 2 vertices (top and bottom)
    const color = this.color;
    for (let corner = -1; corner <= 1; corner += 2) {
      const vertexIdx = idx * 2 + (corner === -1 ? 0 : 1);
      const offset = vertexIdx * floatStride;

      position.copyToArray(vertices, offset); // a_Position (vec3)
      vertices[offset + 3] = this._playTime; // a_BirthTime (float)
      vertices[offset + 4] = 1.0; // a_NormalizedWidth (float)
      color.copyToArray(vertices, offset + 5); // a_Color (vec4)
      vertices[offset + 9] = corner; // a_Corner (float)
      tangent.copyToArray(vertices, offset + 10); // a_Tangent (vec3)
    }

    // Expand cached bounds with new point (incremental update)
    this._expandBounds(position);

    // Update pointers
    this._firstFreeElement++;
    if (this._firstFreeElement >= this._maxPointCount) {
      this._firstFreeElement = 0;
    }
  }

  private _getActivePointCount(): number {
    const firstActive = this._firstActiveElement;
    const firstFree = this._firstFreeElement;
    if (firstFree >= firstActive) {
      return firstFree - firstActive;
    }
    return this._maxPointCount - firstActive + firstFree;
  }

  private _expandBounds(position: Vector3): void {
    const { _boundsMin: min, _boundsMax: max } = this;

    // If bounds are dirty (need full recalc), initialize with first point
    if (this._boundsDirty) {
      min.copyFrom(position);
      max.copyFrom(position);
      this._boundsDirty = false;
      return;
    }

    // Expand bounds incrementally
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

    // Initialize with first active point
    const firstOffset = this._firstActiveElement * 2 * floatStride;
    min.copyFromArray(vertices, firstOffset);
    max.copyFrom(min);

    // Iterate through remaining active points
    const pointPosition = TrailRenderer._tempVector3;
    let idx = this._firstActiveElement + 1;
    if (idx >= this._maxPointCount) idx = 0;

    for (let i = 1; i < activeCount; i++) {
      const offset = idx * 2 * floatStride;
      pointPosition.copyFromArray(vertices, offset);
      Vector3.min(min, pointPosition, min);
      Vector3.max(max, pointPosition, max);

      idx++;
      if (idx >= this._maxPointCount) idx = 0;
    }

    this._boundsDirty = false;
  }

  private _uploadNewVertices(): void {
    const firstActive = this._firstActiveElement;
    const firstFree = this._firstFreeElement;
    const buffer = this._vertexBuffer;

    // If buffer content is lost, need to re-upload all active vertices
    const firstNew = buffer.isContentLost ? firstActive : this._firstNewElement;

    // No vertices to upload
    if (firstNew === firstFree) {
      return;
    }

    const byteStride = TrailRenderer.VERTEX_STRIDE;
    const floatStride = TrailRenderer.VERTEX_FLOAT_STRIDE;
    const vertices = this._vertices;

    // Each point has 2 vertices
    if (firstNew < firstFree) {
      // Contiguous range - only upload new vertices
      const startFloat = firstNew * 2 * floatStride;
      const countFloat = (firstFree - firstNew) * 2 * floatStride;
      const subArray = new Float32Array(vertices.buffer, startFloat * 4, countFloat);
      buffer.setData(subArray, firstNew * 2 * byteStride);
    } else {
      // Wrapped range - upload in two parts
      // First segment: from firstNew to end
      const startFloat1 = firstNew * 2 * floatStride;
      const countFloat1 = (this._maxPointCount - firstNew) * 2 * floatStride;
      const subArray1 = new Float32Array(vertices.buffer, startFloat1 * 4, countFloat1);
      buffer.setData(subArray1, firstNew * 2 * byteStride);

      // Second segment: from 0 to firstFree
      if (firstFree > 0) {
        const countFloat2 = firstFree * 2 * floatStride;
        const subArray2 = new Float32Array(vertices.buffer, 0, countFloat2);
        buffer.setData(subArray2, 0);
      }
    }

    // Update the new element pointer to match free element
    this._firstNewElement = firstFree;
  }

  private _updateIndexBuffer(activeCount: number): number {
    const indices = this._indices;
    const firstActive = this._firstActiveElement;
    const maxPointCount = this._maxPointCount;
    let indexCount = 0;

    // Build index buffer to create proper triangle strip ordering
    // This handles the ring buffer wrap-around case
    for (let i = 0; i < activeCount; i++) {
      const pointIdx = (firstActive + i) % maxPointCount;
      const vertexIdx = pointIdx * 2;

      // Each point has 2 vertices (top and bottom)
      indices[indexCount++] = vertexIdx; // bottom vertex
      indices[indexCount++] = vertexIdx + 1; // top vertex
    }

    // Upload index buffer
    this._indexBuffer.setData(indices, 0, 0, indexCount * 2);

    return indexCount;
  }

  private _updateWidthCurve(shaderData: ShaderData): void {
    const curve = this.widthCurve;
    const widthCurveData = this._widthCurveData || (this._widthCurveData = new Float32Array(8));

    if (curve.mode === 0) {
      // Constant mode
      widthCurveData[0] = 0; // time
      widthCurveData[1] = curve.constant; // value
      shaderData.setFloatArray(TrailRenderer._widthCurveProp, widthCurveData);
      shaderData.setInt(TrailRenderer._widthCurveCountProp, 1);
    } else if (curve.mode === 2 && curve.curve) {
      // Curve mode
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
      // Default: constant 1.0
      widthCurveData[0] = 0;
      widthCurveData[1] = 1;
      shaderData.setFloatArray(TrailRenderer._widthCurveProp, widthCurveData);
      shaderData.setInt(TrailRenderer._widthCurveCountProp, 1);
    }
  }

  private _updateColorGradient(shaderData: ShaderData): void {
    const gradient = this.colorGradient;

    if (!gradient) {
      // Use vertex color (from this.color)
      shaderData.setInt(TrailRenderer._colorKeyCountProp, 0);
      shaderData.setInt(TrailRenderer._alphaKeyCountProp, 0);
      return;
    }

    const colorKeysData = this._colorKeysData || (this._colorKeysData = new Float32Array(16));
    const alphaKeysData = this._alphaKeysData || (this._alphaKeysData = new Float32Array(8));

    // Color keys
    const colorKeys = gradient.colorKeys;
    const colorCount = Math.min(colorKeys.length, 4);
    for (let i = 0, offset = 0; i < colorCount; i++, offset += 4) {
      const key = colorKeys[i];
      colorKeysData[offset] = key.time;
      colorKeysData[offset + 1] = key.color.r;
      colorKeysData[offset + 2] = key.color.g;
      colorKeysData[offset + 3] = key.color.b;
    }
    shaderData.setFloatArray(TrailRenderer._colorKeysProp, colorKeysData);
    shaderData.setInt(TrailRenderer._colorKeyCountProp, colorCount);

    // Alpha keys
    const alphaKeys = gradient.alphaKeys;
    const alphaCount = Math.min(alphaKeys.length, 4);
    for (let i = 0, offset = 0; i < alphaCount; i++, offset += 2) {
      const key = alphaKeys[i];
      alphaKeysData[offset] = key.time;
      alphaKeysData[offset + 1] = key.alpha;
    }
    shaderData.setFloatArray(TrailRenderer._alphaKeysProp, alphaKeysData);
    shaderData.setInt(TrailRenderer._alphaKeyCountProp, alphaCount);
  }
}
