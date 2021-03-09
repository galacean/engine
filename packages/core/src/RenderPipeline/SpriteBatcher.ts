import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Logger } from "../base";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Mesh } from "../graphic/Mesh";
import { SubMesh } from "../graphic/SubMesh";
import { VertexElement } from "../graphic/VertexElement";
import { Material } from "../material";
import { Renderer } from "../Renderer";
import { Shader } from "../shader";
import { ShaderData } from "../shader/ShaderData";

class Batch {
  vertices: Vector3[];
  uv: Vector2[];
  triangles: number[];
  color: Color;

  constructor(vertices: Vector3[], uv: Vector2[], triangles: number[], color: Color) {
    this.vertices = vertices;
    this.uv = uv;
    this.triangles = triangles;
    this.color = color;
  }
}

export class SpriteBatcher {
  /** The maximum number of vertices. */
  private static MAX_VERTICES: number = 256;

  private _batchedQueue: Batch[] = [];
  private _camera: Camera = null;
  private _targetMaterial: Material = null;
  private _targetRendererData: ShaderData = null;

  /** @internal */
  private _mesh: Mesh;
  /** @internal */
  private _subMesh: SubMesh;
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
    this._initGeometry(engine);
  }

  _initGeometry(engine: Engine) {
    const { MAX_VERTICES } = SpriteBatcher;
    this._mesh = new Mesh(engine, "SpriteBatcher Mesh");
    this._subMesh = new SubMesh();
    const { _mesh, _subMesh } = this;
    _subMesh.start = 0;
    _subMesh.topology = MeshTopology.Triangles;

    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0),
      new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0)
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

    _mesh.setVertexBufferBinding(this._vertexBuffer, vertexStride);
    _mesh.setIndexBufferBinding(this._indiceBuffer, IndexFormat.UInt16);
    _mesh.setVertexElements(vertexElements);
  }

  /**
   * Flush all sprites.
   */
  flush(engine: Engine) {
    const { _batchedQueue } = this;

    if (_batchedQueue.length === 0) {
      return;
    }

    if (!this._targetRendererData || !this._targetMaterial) {
      Logger.error("No renderer data or material!");
      return;
    }

    //@ts-ignore
    const compileMacros = Shader._compileMacros;
    compileMacros.clear();

    //@ts-ignore
    const material = this._targetMaterial;
    const program = material.shader._getShaderProgram(engine, compileMacros);
    if (!program.isValid) {
      return;
    }

    // Uniform.
    program.groupingOtherUniformBlock();
    program.uploadAll(program.sceneUniformBlock, this._camera.scene.shaderData);
    program.uploadAll(program.cameraUniformBlock, this._camera.shaderData);
    program.uploadAll(program.rendererUniformBlock, this._targetRendererData);
    program.uploadAll(program.materialUniformBlock, material.shaderData);

    const { _vertices, _indices, _subMesh } = this;
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
    _subMesh.count = indiceIndex;
    this._vertexBuffer.setData(_vertices, 0, 0, vertexIndex);
    this._indiceBuffer.setData(_indices, 0, 0, indiceIndex);

    //@ts-ignore
    material.renderState._apply(engine);

    // Draw the batched sprite.
    engine._hardwareRenderer.drawPrimitive(this._mesh, _subMesh, program);

    _batchedQueue.length = 0;
    // this._camera = null;
    // this._targetMaterial = null;
    // this._targetRendererData = null;
    // this._curIndiceCount = 0;
  }

  /**
   * Check whether a sprite can be drawn in combination with the previous sprite when drawing.
   * @param rendererData - The shader data of the new sprite
   * @param material - The material of the new sprite
   * @param camera - Camera which is rendering
   * @param triangles - The array containing sprite mesh triangles
   */
  canBatch(rendererData: ShaderData, material: Material, camera: Camera, triangles: number[]) {
    if (!rendererData || !material) {
      Logger.error("No renderer data or material!");
    }

    const { _targetRendererData, _targetMaterial } = this;

    if (_targetRendererData === null && _targetMaterial === null) {
      return true;
    }

    const len = triangles.length;
    if (this._curIndiceCount + len > SpriteBatcher.MAX_VERTICES) {
      return false;
    }

    // Currently only compare texture
    const texture = rendererData.getTexture("u_texture");
    const targetTexture = _targetRendererData.getTexture("u_texture");
    if (texture !== targetTexture) {
      return false;
    }

    return material === _targetMaterial && camera === this._camera;
  }

  /**
   * Add a sprite drawing information to the render queue.
   * @param renderer - The sprite renderer to draw
   * @param material - The material used to render the sprite
   * @param vertices - The array containing sprite mesh vertex positions
   * @param uv - The base texture coordinates of the sprite mesh
   * @param triangles - The array containing sprite mesh triangles
   * @param color - Rendering color for the Sprite graphic
   * @param texture - The reference to the used texture
   * @param camera - Camera which is rendering
   */
  drawSprite(
    renderer: Renderer,
    vertices: Vector3[],
    uv: Vector2[],
    triangles: number[],
    color: Color,
    material: Material,
    camera: Camera
  ) {
    if (!this.canBatch(renderer.shaderData, material, camera, triangles)) {
      this.flush(camera.engine);
    }

    this._camera = camera;
    this._targetMaterial = material;
    this._targetRendererData = renderer.shaderData;
    this._curIndiceCount = triangles.length;

    this._batchedQueue.push(new Batch(vertices, uv, triangles, color));
  }

  /**
   * Release gl resource.
   */
  finalize() {}
}
