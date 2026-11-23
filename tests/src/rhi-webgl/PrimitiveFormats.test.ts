import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  Camera,
  IndexFormat,
  MeshRenderer,
  MeshTopology,
  RenderFace,
  RenderTarget,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  VertexElement,
  VertexElementFormat,
  WebGLEngine
} from "@galacean/engine";
import { expect, it, vi } from "vitest";

it("maps mesh formats for indexed GL draws and preserves a pending vertex binding update", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const gl = engine._hardwareRenderer.gl;
    const draw = vi.spyOn(gl, "drawElements");
    const pointer = vi.spyOn(gl, "vertexAttribPointer");
    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor.set(0, 0, 0, 1);
    const root = scene.createRootEntity();
    const camera = root.createChild().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 3);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    const color = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, 16, 16, color);
    const renderer = root.createChild().addComponent(MeshRenderer);
    const mesh = (renderer.mesh = new BufferMesh(engine));
    const verts = new Int16Array([-30000, -30000, 0, 32767, 30000, -30000, 0, 32767, 0, 30000, 0, 32767]);
    mesh.setVertexElements([new VertexElement("POSITION", 0, VertexElementFormat.NormalizedShort4, 0)]);
    mesh.setVertexBufferBinding(new Buffer(engine, BufferBindFlag.VertexBuffer, verts), 8);
    const sub = mesh.addSubMesh(1, 3, MeshTopology.Triangles);
    const material = new UnlitMaterial(engine);
    material.renderFace = RenderFace.Double;
    material.baseColor.set(1, 0, 0, 1);
    renderer.setMaterial(material);
    const rgba = new Uint8Array(4);
    const cases = [
      [IndexFormat.UInt8, Uint8Array, gl.UNSIGNED_BYTE, MeshTopology.Triangles, gl.TRIANGLES],
      [IndexFormat.UInt16, Uint16Array, gl.UNSIGNED_SHORT, MeshTopology.TriangleStrip, gl.TRIANGLE_STRIP],
      [IndexFormat.UInt32, Uint32Array, gl.UNSIGNED_INT, MeshTopology.TriangleFan, gl.TRIANGLE_FAN]
    ] as const;
    for (const [format, ArrayType, nativeType, topology, nativeTopology] of cases) {
      mesh.setIndexBufferBinding(new Buffer(engine, BufferBindFlag.IndexBuffer, new ArrayType([2, 0, 1, 2])), format);
      sub.topology = topology;
      camera.render();
      expect(draw).toHaveBeenLastCalledWith(nativeTopology, 3, nativeType, ArrayType.BYTES_PER_ELEMENT);
      color.getPixelBuffer(8, 8, 1, 1, rgba);
      expect([...rgba]).toEqual([255, 0, 0, 255]);
    }
    expect(pointer.mock.calls.some(([, size, type, norm]) => size === 4 && type === gl.SHORT && norm)).toBe(true);
    // Rebinding the same index buffer must not clear the VAO invalidation from the new vertex buffer.
    mesh.setVertexBufferBinding(new Buffer(engine, BufferBindFlag.VertexBuffer, new Int16Array(verts.length)), 8);
    mesh.setIndexBufferBinding(mesh.indexBufferBinding!.buffer, IndexFormat.UInt32);
    camera.render();
    color.getPixelBuffer(8, 8, 1, 1, rgba);
    expect([...rgba]).toEqual([0, 0, 0, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    vi.restoreAllMocks();
    engine.destroy();
  }
});
