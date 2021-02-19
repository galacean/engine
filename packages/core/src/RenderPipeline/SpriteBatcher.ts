import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Logger } from "../base";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { PrimitiveTopology } from "../graphic/enums/PrimitiveTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Buffer } from "../graphic/Buffer";
import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { VertexElement } from "../graphic/VertexElement";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { Material } from "../material";
import { Texture2D } from "../texture";
import { Shader } from "../shader";
export class SpriteBatcher {
  /** The maximum number of vertices. */
  private static MAX_VERTICES: number = 256;

  private _batchedQueue;
  private _targetTexture;
  private _camera;

  /** @internal */
  private _primitive: Primitive;
  /** @internal */
  private _subPrimitive: SubPrimitive;
  /** Vertices buff in GPU. */
  private _vertexBuffer: Buffer;
  /** Indices buff in GPU. */
  private _indiceBuffer: Buffer;
  /** Vertices buff in CPU. */
  private _vertices: Float32Array;
  /** Indices buff in CPU. */
  private _indices: Uint16Array;
  /** Current indice count. */
  private _curIndiceCount: number;

  constructor(engine: Engine) {
    this._batchedQueue = [];
    this._targetTexture = null;
    this._camera = null;

    this._initGeometry(engine);
  }

  _initGeometry(engine: Engine) {
    const { MAX_VERTICES } = SpriteBatcher;
    this._primitive = new Primitive(engine, "SpriteBatcher Primitive");
    this._subPrimitive = new SubPrimitive();
    const { _primitive, _subPrimitive } = this;
    _subPrimitive.start = 0;
    _subPrimitive.topology = PrimitiveTopology.Triangles;

    const vertexElements = [
      new VertexElement("a_pos", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("a_uv", 12, VertexElementFormat.Vector2, 0),
      new VertexElement("a_color", 20, VertexElementFormat.Vector4, 0)
    ];
    const vertexStride = 36;

    // vertices
    this._vertices = new Float32Array(MAX_VERTICES * 9);
    this._vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      MAX_VERTICES * 4 * vertexStride,
      BufferUsage.Dynamic
    );
    // indices
    this._indices = new Uint16Array(MAX_VERTICES);
    this._indiceBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, MAX_VERTICES, BufferUsage.Dynamic);

    const { _vertexBuffer, _indiceBuffer } = this;
    _primitive.setVertexBufferBinding(_vertexBuffer, vertexStride);
    _primitive.setIndexBufferBinding(_indiceBuffer, IndexFormat.UInt16);
    _primitive.setVertexElements(vertexElements);
  }

  /**
   * Flush all sprites.
   */
  flush(engine: Engine, material: Material) {
    const { _batchedQueue } = this;

    if (_batchedQueue.length === 0) {
      return;
    }

    if (!this._targetTexture) {
      Logger.error("No texture!");
      return;
    }

    const materialData = material.shaderData;
    materialData.setTexture("s_diffuse", this._targetTexture);
    materialData.setMatrix("matView", this._camera.viewMatrix);
    materialData.setMatrix("matProjection", this._camera.projectionMatrix);

    //@ts-ignore
    const compileMacros = Shader._compileMacros;
    compileMacros.clear();

    //@ts-ignore
    const program = material.shader._getShaderProgram(engine, compileMacros);
    if (!program.isValid) {
      return;
    }

    program.groupingOtherUniformBlock();
    program.uploadAll(program.materialUniformBlock, materialData);

    const { _vertices, _indices, _vertexBuffer, _indiceBuffer, _primitive, _subPrimitive } = this;
    // Batch vertices and indices.
    let vertexIndex = 0;
    let indiceIndex = 0;
    let curIndiceStartIndex = 0;
    for (let i = 0, len = _batchedQueue.length; i < len; ++i) {
      const { vertices, uv, triangles, color } = _batchedQueue[i];

      // Batch vertex
      const verticesNum = vertices.length;
      for (let j = 0; j < verticesNum; ++j) {
        const curVertex = vertices[j];
        const curUV = uv[j];

        _vertices[vertexIndex++] = curVertex.x;
        _vertices[vertexIndex++] = curVertex.y;
        _vertices[vertexIndex++] = curVertex.z;
        _vertices[vertexIndex++] = curUV.x;
        _vertices[vertexIndex++] = curUV.y;
        _vertices[vertexIndex++] = color.r;
        _vertices[vertexIndex++] = color.g;
        _vertices[vertexIndex++] = color.b;
        _vertices[vertexIndex++] = color.a;
      }

      // Batch indice
      for (let j = 0, l = triangles.length; j < l; ++j) {
        _indices[indiceIndex++] = triangles[j] + curIndiceStartIndex;
      }

      curIndiceStartIndex += verticesNum;
    }

    // Update primive.
    _subPrimitive.count = indiceIndex;
    _vertexBuffer.setData(_vertices, 0, 0, vertexIndex);
    _indiceBuffer.setData(_indices, 0, 0, indiceIndex);

    //@ts-ignore
    material.renderState._apply(engine);

    // Draw the batched sprite.
    engine._hardwareRenderer.drawPrimitive(_primitive, _subPrimitive, program);

    _batchedQueue.length = 0;
    this._targetTexture = null;
    this._camera = null;
    this._curIndiceCount = 0;
  }

  /**
   * Check whether a sprite can be drawn in combination with the previous sprite when drawing.
   * @param texture - The texture of the new sprite
   * @param camera - Camera which is rendering
   * @param triangles - The array containing sprite mesh triangles
   */
  canBatch(texture: Texture2D, camera: Camera, triangles: number[]) {
    if (this._targetTexture === null) {
      return true;
    }

    const len = triangles.length;
    if (this._curIndiceCount + len > SpriteBatcher.MAX_VERTICES) {
      return false;
    }

    return texture === this._targetTexture && camera === this._camera;
  }

  /**
   * Add a sprite drawing information to the render queue.
   * @param material - The material used to render the sprite
   * @param vertices - The array containing sprite mesh vertex positions
   * @param uv - The base texture coordinates of the sprite mesh
   * @param triangles - The array containing sprite mesh triangles
   * @param color - Rendering color for the Sprite graphic
   * @param texture - The reference to the used texture
   * @param camera - Camera which is rendering
   */
  drawSprite(
    material: Material,
    vertices: Vector3[],
    uv: Vector2[],
    triangles: number[],
    color: Color,
    texture: Texture2D,
    camera: Camera
  ) {
    if (!this.canBatch(texture, camera, triangles)) {
      this.flush(camera.engine, material);
    }

    this._targetTexture = texture;
    this._camera = camera;
    this._curIndiceCount = triangles.length;
    this._batchedQueue.push({ vertices, uv, triangles, color });
  }

  /**
   * Release gl resource.
   */
  finalize() {}
}
