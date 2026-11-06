import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  DepthTextureMode,
  IndexBufferBinding,
  IndexFormat,
  Material,
  MeshRenderer,
  Shader,
  Vector3,
  VertexElement,
  VertexElementFormat,
  type Camera,
  type Entity
} from "@galacean/engine";
import {
  acquireCameraDepthTexturePrePass,
  type CameraDepthTexturePrePassLease
} from "@galacean/engine-modify/rendering/CameraDepthTexturePrePass";
import { restoreBuffer } from "@galacean/engine-modify/rendering/RestorableResources";
import type { FireflyPopulation } from "./FireflyPopulation";
import shaderSource from "./Firefly.shader?raw";

/** Two instanced draw batches sharing one position stream; no per-insect render entities or lights. */
export class FireflyPresenter {
  private readonly root: Entity;
  private readonly buffer: Buffer;
  private readonly velocityBuffer!: Buffer;
  private readonly meshes: BufferMesh[] = [];
  private readonly buffers: Buffer[] = [];
  private readonly materials: Material[] = [];
  private lease?: CameraDepthTexturePrePassLease;
  private disposed = false;

  constructor(
    parent: Entity,
    private readonly camera: Camera,
    private readonly population: FireflyPopulation
  ) {
    const engine = parent.engine;
    this.root = parent.createChild("Firefly population");
    this.root.isActive = false;
    this.buffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      Math.max(16, population.instances.byteLength),
      BufferUsage.Dynamic
    );
    try {
      this.velocityBuffer = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        Math.max(12, population.velocities.byteLength),
        BufferUsage.Dynamic
      );
      const shader = Shader.find("Animal/Firefly") ?? Shader.create(shaderSource);
      for (const glow of [false, true]) {
        // Both layers use analytic radial coverage. A low-poly solid core exposes
        // its silhouette at walking distance, where bloom cannot hide the facets.
        const vertices = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
        const vertex = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static);
        this.buffers.push(vertex);
        restoreBuffer(vertex, vertices);
        const index = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);
        this.buffers.push(index);
        restoreBuffer(index, indices);
        const mesh = new BufferMesh(engine, glow ? "Firefly halos" : "Firefly cores");
        this.meshes.push(mesh);
        mesh.setVertexBufferBinding(vertex, 12, 0);
        mesh.setVertexBufferBinding(this.buffer, 16, 1);
        mesh.setVertexBufferBinding(this.velocityBuffer, 12, 2);
        mesh.setVertexElements([
          new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
          new VertexElement("FIREFLY_POSITION", 0, VertexElementFormat.Vector4, 1, 1),
          new VertexElement("FIREFLY_VELOCITY", 0, VertexElementFormat.Vector3, 2, 1)
        ]);
        mesh.setIndexBufferBinding(new IndexBufferBinding(index, IndexFormat.UInt16));
        mesh.addSubMesh(0, indices.length);
        mesh.bounds = new BoundingBox(new Vector3(), new Vector3());
        const material = new Material(engine, shader);
        this.materials.push(material);
        if (glow) material.shaderData.enableMacro("FIREFLY_GLOW");
        material.shaderData.setFloat("firefly_Intensity", population.settings.intensity);
        const renderer = this.root.createChild(glow ? "Halos" : "Cores").addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setMaterial(material);
        renderer.castShadows = renderer.receiveShadows = false;
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  update(): void {
    if (this.disposed) return;
    const p = this.population;
    const visible = p.count > 0 && p.settings.intensity > 0;
    this.root.isActive = visible;
    if (!visible) {
      this.lease?.destroy();
      this.lease = undefined;
      return;
    }
    this.lease ??= acquireCameraDepthTexturePrePass(this.camera, DepthTextureMode.PrePass, "animal-fireflies");
    // Typed-array lengths are elements, not bytes. Keep capacity for future
    // births, but upload only the prefix consumed by this frame's draw calls.
    this.buffer.setData(p.instances, 0, 0, p.count * 4);
    this.velocityBuffer.setData(p.velocities, 0, 0, p.count * 3);
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < p.count * 4; i += 4) {
      minX = Math.min(minX, p.instances[i]);
      maxX = Math.max(maxX, p.instances[i]);
      minY = Math.min(minY, p.instances[i + 1]);
      maxY = Math.max(maxY, p.instances[i + 1]);
      minZ = Math.min(minZ, p.instances[i + 2]);
      maxZ = Math.max(maxZ, p.instances[i + 2]);
    }
    for (const mesh of this.meshes) {
      mesh.instanceCount = p.count;
      // Bounds vectors notify the renderer when their coordinates change.
      const bounds = mesh.bounds;
      bounds.min.set(minX - 1, minY - 1, minZ - 1);
      bounds.max.set(maxX + 1, maxY + 1, maxZ + 1);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lease?.destroy();
    this.lease = undefined;
    this.root.destroy();
    for (const mesh of this.meshes) mesh.destroy(true);
    for (const material of this.materials) material.destroy(true);
    for (const buffer of this.buffers) buffer.destroy(true);
    this.buffer.destroy(true);
    this.velocityBuffer?.destroy(true);
  }
}
