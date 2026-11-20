import {
  AssetType,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Camera,
  Color,
  GLTFLoader,
  GLTFResource,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterEach, describe, expect, it } from "vitest";

const meshoptGlbUrl = new URL("./fixtures/meshopt-triangle.glb", import.meta.url).href;

async function loseAndRestoreDevice(engine: WebGLEngine): Promise<void> {
  const lost = new Promise<void>((resolve) => engine.once("devicelost", resolve));
  engine.forceLoseDevice();
  await lost;

  // WEBGL_lose_context makes restoration available on a later browser task.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const restored = new Promise<void>((resolve) => engine.once("devicerestored", resolve));
  engine.forceRestoreDevice();
  await restored;
}

function readCenterPixel(canvas: HTMLCanvasElement): Uint8Array {
  const gl = canvas.getContext("webgl2")!;
  const pixel = new Uint8Array(4);
  gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return pixel;
}

describe("Context restore and ModelMesh re-upload regressions", () => {
  let engine: WebGLEngine | null = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  it("restores EXT_meshopt_compression glTF meshes after WebGL context restore", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({
      canvas,
      graphicDeviceOptions: { preserveDrawingBuffer: true }
    });

    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0, 0, 0, 1);

    const root = scene.createRootEntity("root");
    const cameraEntity = root.createChild("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;
    cameraEntity.transform.setPosition(0, 0, 3);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

    const gltf = await engine.resourceManager.load<GLTFResource>({
      url: meshoptGlbUrl,
      type: AssetType.GLTF
    });
    root.addChild(gltf.instantiateSceneRoot());

    camera.render();
    const before = readCenterPixel(canvas);
    // Sanity check: the Meshopt triangle is visible at canvas center before context loss
    expect(before[0] + before[1] + before[2]).toBeGreaterThan(0);

    await loseAndRestoreDevice(engine);

    camera.render();
    const afterFirstRestore = readCenterPixel(canvas);
    expect(Array.from(afterFirstRestore)).toEqual(Array.from(before));

    // Verify a second consecutive context loss/restore cycle after GLTFLoader.release() recreates Meshopt workers
    GLTFLoader.release();
    await loseAndRestoreDevice(engine);

    camera.render();
    const afterSecondRestore = readCenterPixel(canvas);
    expect(Array.from(afterSecondRestore)).toEqual(Array.from(before));
  });

  it("does not trigger GL_INVALID_OPERATION by deleting stale ShaderPrograms on context restore", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({
      canvas,
      graphicDeviceOptions: { preserveDrawingBuffer: true }
    });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 3);

    const cubeEntity = scene.createRootEntity("cube");
    const renderer = cubeEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    renderer.setMaterial(new UnlitMaterial(engine));

    // Render once so ShaderProgram is created and cached on the initial context
    camera.render();

    const gl = canvas.getContext("webgl2")!;
    expect(gl.getError()).toBe(gl.NO_ERROR);

    await loseAndRestoreDevice(engine);

    // Restoring the device should not call deleteProgram on old-context handles
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("allows re-uploading same vertex count data to ModelMesh after uploadData(true)", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const mesh = new ModelMesh(engine);
    try {
      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.setIndices(new Uint16Array([0, 1, 2]));
      mesh.uploadData(true);

      // Re-upload the same vertex count after releasing CPU cache
      expect(() => {
        mesh.setPositions([new Vector3(0.25, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
        mesh.setIndices(new Uint16Array([0, 1, 2]));
        mesh.uploadData(true);
      }).not.toThrow();

      // Re-upload with multiple attributes when all attributes are overwritten
      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.setNormals([new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1)]);
      mesh.uploadData(true);

      // Partial update after release still rejects missing CPU cache rather than zeroing lost normals
      mesh.setPositions([new Vector3(0.5, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      expect(() => mesh.uploadData(true)).toThrow("Vertex buffer is not readable");

      // Providing all active attributes succeeds even with identical vertex count
      mesh.setNormals([new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0)]);
      expect(() => mesh.uploadData(true)).not.toThrow();

      // Stride * vertexCount collision (4 verts * 24B = 96B -> 8 verts * 12B = 96B) updates buffer stride
      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0)]);
      mesh.setNormals([new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1)]);
      mesh.uploadData(false);
      expect(mesh.vertexBufferBindings[0]!.stride).toBe(24);

      mesh.setPositions([
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(1, 1, 0),
        new Vector3(2, 0, 0),
        new Vector3(3, 0, 0),
        new Vector3(2, 1, 0),
        new Vector3(3, 1, 0)
      ]);
      mesh.setNormals(null);
      mesh.uploadData(false);
      expect(mesh.vertexBufferBindings[0]!.stride).toBe(12);

      // Verify old vertex & index GPU buffers are immediately destroyed (not leaked) when mesh.refCount > 0
      const entity = engine.sceneManager.activeScene!.createRootEntity("mesh-holder");
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      expect(mesh.refCount).toBeGreaterThan(0);

      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.setIndices(new Uint16Array([0, 1, 2]));
      mesh.uploadData(true);

      const oldVertexBuffer = mesh.vertexBufferBindings[0]!.buffer;
      const oldIndexBuffer = mesh._primitive.indexBufferBinding!._buffer;
      expect(oldVertexBuffer.destroyed).toBe(false);
      expect(oldIndexBuffer.destroyed).toBe(false);

      // Re-upload same vertex count + resized indices while referenced
      mesh.setPositions([new Vector3(0.5, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.setIndices(new Uint16Array([0, 1, 2, 2, 1, 0]));
      mesh.uploadData(true);
      expect(oldVertexBuffer.destroyed).toBe(true);
      expect(oldIndexBuffer.destroyed).toBe(true);

      const resizedIndexBuffer = mesh._primitive.indexBufferBinding!._buffer;
      expect(resizedIndexBuffer.destroyed).toBe(false);

      // Clear indices while referenced
      mesh.setIndices(null as unknown as Uint16Array);
      mesh.uploadData(true);
      expect(resizedIndexBuffer.destroyed).toBe(true);

      renderer.mesh = null!;
    } finally {
      mesh.destroy();
    }
  });

  it("does not destroy a caller-owned unreadable vertex buffer when replacing internal slot 0", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const mesh = new ModelMesh(engine);
    const userUnreadableBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 36, BufferUsage.Static, false);
    try {
      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.uploadData(true);

      // Replace slot 0 with a caller-owned unreadable buffer
      mesh.setVertexBufferBinding(userUnreadableBuffer, 12, 0);

      // Re-uploading same vertex count must not destroy userUnreadableBuffer or bind to index -1
      mesh.setPositions([new Vector3(0.25, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      expect(() => mesh.uploadData(true)).toThrow("Vertex buffer is not readable");

      expect(userUnreadableBuffer.destroyed).toBe(false);
      expect(mesh.vertexBufferBindings[0]?.buffer).toBe(userUnreadableBuffer);
      expect(mesh.vertexBufferBindings.length).toBe(1);
      expect("-1" in mesh.vertexBufferBindings).toBe(false);
    } finally {
      mesh.destroy();
      userUnreadableBuffer.destroy();
    }
  });

  it("preserves internal buffer metadata on idempotent same-buffer re-bind", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const mesh = new ModelMesh(engine);
    try {
      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.uploadData(true);

      // Single setter: re-bind the exact same internal buffer and stride
      const binding0 = mesh.vertexBufferBindings[0]!;
      mesh.setVertexBufferBinding(binding0.buffer, binding0.stride, 0);
      expect(() => {
        mesh.setPositions([new Vector3(0.25, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
        mesh.uploadData(true);
      }).not.toThrow();

      // Batch setter: re-bind the exact same internal binding array
      const binding1 = mesh.vertexBufferBindings[0]!;
      mesh.setVertexBufferBindings([binding1], 0);
      expect(() => {
        mesh.setPositions([new Vector3(0.5, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
        mesh.uploadData(true);
      }).not.toThrow();
    } finally {
      mesh.destroy();
    }
  });
});
