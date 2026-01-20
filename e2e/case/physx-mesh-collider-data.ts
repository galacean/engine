/**
 * @title PhysX Mesh Collider Data
 * @category Physics
 */
import {
  WebGLEngine,
  Vector3,
  MeshRenderer,
  PointLight,
  Camera,
  Script,
  StaticCollider,
  DynamicCollider,
  PBRMaterial,
  AmbientLight,
  AssetType,
  Entity,
  Color,
  ModelMesh,
  MeshColliderShape
} from "@galacean/engine";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create wavy terrain mesh for visualization
function createTerrainMesh(engine: WebGLEngine, gridSize: number, scale: number): ModelMesh {
  const mesh = new ModelMesh(engine);
  const positions: Vector3[] = [];
  const normals: Vector3[] = [];

  // Generate vertices
  for (let z = 0; z <= gridSize; z++) {
    for (let x = 0; x <= gridSize; x++) {
      const px = (x - gridSize / 2) * scale;
      const pz = (z - gridSize / 2) * scale;
      const py = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 1.5;
      positions.push(new Vector3(px, py, pz));

      // Simple normal approximation
      const nx = -Math.cos(x * 0.5) * Math.cos(z * 0.5) * 1.5 * 0.5;
      const nz = Math.sin(x * 0.5) * Math.sin(z * 0.5) * 1.5 * 0.5;
      const normal = new Vector3(nx, 1, nz);
      normal.normalize();
      normals.push(normal);
    }
  }

  // Generate indices
  const indices: number[] = [];
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const i = z * (gridSize + 1) + x;
      indices.push(i, i + gridSize + 1, i + 1);
      indices.push(i + 1, i + gridSize + 1, i + gridSize + 2);
    }
  }

  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setIndices(Uint16Array.from(indices));
  mesh.uploadData(false);
  mesh.addSubMesh(0, indices.length);

  return mesh;
}

// Create terrain with triangle mesh collider
function createWavyTerrain(engine: WebGLEngine, rootEntity: Entity) {
  const entity = rootEntity.createChild("terrain");
  entity.transform.setPosition(0, -3, 0);

  const gridSize = 10;
  const scale = 2;

  // Generate vertex data for physics
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let z = 0; z <= gridSize; z++) {
    for (let x = 0; x <= gridSize; x++) {
      const px = (x - gridSize / 2) * scale;
      const pz = (z - gridSize / 2) * scale;
      const py = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 1.5;
      vertices.push(px, py, pz);
    }
  }

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const i = z * (gridSize + 1) + x;
      indices.push(i, i + gridSize + 1, i + 1);
      indices.push(i + 1, i + gridSize + 1, i + gridSize + 2);
    }
  }

  // Create MeshColliderShape (triangle mesh for static)
  const meshShape = new MeshColliderShape();
  meshShape.setMeshData(new Float32Array(vertices), new Uint16Array(indices));

  const collider = entity.addComponent(StaticCollider);
  collider.addShape(meshShape);

  // Visual mesh
  const terrainMesh = createTerrainMesh(engine, gridSize, scale);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = terrainMesh;

  const material = new PBRMaterial(engine);
  material.baseColor.set(0.4, 0.6, 0.3, 1.0);
  material.roughness = 0.8;
  material.metallic = 0.1;
  renderer.setMaterial(material);

  return entity;
}

// Create tetrahedron mesh for visualization
function createTetrahedronMesh(engine: WebGLEngine, size: number): ModelMesh {
  const mesh = new ModelMesh(engine);

  // Tetrahedron vertices
  const h = size * Math.sqrt(2 / 3);
  const r = size * Math.sqrt(1 / 3);
  const positions: Vector3[] = [
    new Vector3(0, h * 0.75, 0), // top
    new Vector3(-size * 0.5, -h * 0.25, -r * 0.5), // back left
    new Vector3(size * 0.5, -h * 0.25, -r * 0.5), // back right
    new Vector3(0, -h * 0.25, r) // front
  ];

  // Expand vertices for flat shading (each face has its own vertices)
  const expandedPositions: Vector3[] = [];
  const expandedNormals: Vector3[] = [];

  const faces = [
    [0, 1, 2], // back face
    [0, 2, 3], // right face
    [0, 3, 1], // left face
    [1, 3, 2] // bottom face
  ];

  for (const face of faces) {
    const p0 = positions[face[0]];
    const p1 = positions[face[1]];
    const p2 = positions[face[2]];

    // Calculate face normal
    const v1 = new Vector3();
    const v2 = new Vector3();
    Vector3.subtract(p1, p0, v1);
    Vector3.subtract(p2, p0, v2);
    const normal = new Vector3();
    Vector3.cross(v1, v2, normal);
    normal.normalize();

    expandedPositions.push(p0.clone(), p1.clone(), p2.clone());
    expandedNormals.push(normal.clone(), normal.clone(), normal.clone());
  }

  const indices: number[] = [];
  for (let i = 0; i < 12; i++) {
    indices.push(i);
  }

  mesh.setPositions(expandedPositions);
  mesh.setNormals(expandedNormals);
  mesh.setIndices(Uint16Array.from(indices));
  mesh.uploadData(false);
  mesh.addSubMesh(0, indices.length);

  return mesh;
}

// Create convex mesh dynamic object
function createConvexObject(
  engine: WebGLEngine,
  rootEntity: Entity,
  position: Vector3,
  color: Color,
  name: string
): Entity {
  const entity = rootEntity.createChild(name);
  entity.transform.setPosition(position.x, position.y, position.z);

  const size = 0.8;
  const h = size * Math.sqrt(2 / 3);
  const r = size * Math.sqrt(1 / 3);

  // Tetrahedron vertices for physics (convex hull)
  const vertices = new Float32Array([
    0,
    h * 0.75,
    0, // top
    -size * 0.5,
    -h * 0.25,
    -r * 0.5, // back left
    size * 0.5,
    -h * 0.25,
    -r * 0.5, // back right
    0,
    -h * 0.25,
    r // front
  ]);

  const meshShape = new MeshColliderShape(true); // isConvex = true
  meshShape.setMeshData(vertices);

  const collider = entity.addComponent(DynamicCollider);
  collider.addShape(meshShape);

  // Visual mesh
  const tetraMesh = createTetrahedronMesh(engine, size);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = tetraMesh;

  const material = new PBRMaterial(engine);
  material.baseColor.copyFrom(color);
  material.roughness = 0.5;
  material.metallic = 0.3;
  renderer.setMaterial(material);

  return entity;
}

// Collision detection script
class CollisionScript extends Script {
  private _originalColor: Color = new Color();
  private _hitColor: Color = new Color(1, 1, 0, 1);
  private _renderer: MeshRenderer;
  private _material: PBRMaterial;

  onStart(): void {
    this._renderer = this.entity.getComponent(MeshRenderer);
    this._material = this._renderer.getMaterial() as PBRMaterial;
    this._originalColor.copyFrom(this._material.baseColor);
  }

  onCollisionEnter(): void {
    this._material.baseColor.copyFrom(this._hitColor);
  }

  onCollisionExit(): void {
    this._material.baseColor.copyFrom(this._originalColor);
  }
}

WebGLEngine.create({
  canvas: "canvas",
  physics: new PhysXPhysics(PhysXRuntimeMode.Auto, {
    wasmModeUrl: "../physx.release.js",
    javaScriptModeUrl: "../physx.release.downgrade.js"
  })
}).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
  scene.ambientLight.diffuseIntensity = 1.2;

  // Camera
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 5, 20);
  cameraEntity.transform.lookAt(new Vector3(0, -2, 0));

  // Light
  const light = rootEntity.createChild("light");
  light.transform.setPosition(5, 10, 5);
  light.addComponent(PointLight);

  // Create wavy terrain (triangle mesh)
  createWavyTerrain(engine, rootEntity);

  // Create falling convex objects
  const colors = [
    new Color(0.9, 0.2, 0.2, 1.0), // red
    new Color(0.2, 0.9, 0.2, 1.0), // green
    new Color(0.2, 0.2, 0.9, 1.0), // blue
    new Color(0.9, 0.5, 0.2, 1.0), // orange
    new Color(0.7, 0.2, 0.9, 1.0) // purple
  ];

  const positions = [
    new Vector3(-4, 5, 0),
    new Vector3(-2, 6, 2),
    new Vector3(0, 7, -1),
    new Vector3(2, 5.5, 1),
    new Vector3(4, 6.5, -2)
  ];

  for (let i = 0; i < 5; i++) {
    const obj = createConvexObject(engine, rootEntity, positions[i], colors[i], `convex_${i}`);
    obj.addComponent(CollisionScript);
  }

  // Load environment and run E2E
  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      // Run physics simulation for a while to let objects fall and collide
      updateForE2E(engine, 50, 40);
      initScreenshot(engine, camera);
    });
});
