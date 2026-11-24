import { createPhysics } from "../../utils/physics";
import {
  BoxCollider,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Entity,
  HitResult,
  Layer,
  MeshCollider,
  MeshColliderCookingFlag,
  ModelMesh,
  PhysicsMaterial,
  PhysicsScene,
  Rigidbody,
  Script,
  SphereCollider,
  VertexAttribute,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { AssetType, type PrefabResource, WebGLEngine } from "@galacean/engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class CollisionRecorder extends Script {
  onCollisionEnter = vi.fn();
  onCollisionStay = vi.fn();
  onCollisionExit = vi.fn();
  onTriggerEnter = vi.fn();
  onTriggerStay = vi.fn();
  onTriggerExit = vi.fn();
}

function createModelMesh(engine: WebGLEngine, positions: number[], indices?: number[]): ModelMesh {
  const mesh = new ModelMesh(engine);
  const vertices: Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    vertices.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  mesh.setPositions(vertices);
  if (indices) mesh.setIndices(new Uint16Array(indices));
  mesh.uploadData(false);
  return mesh;
}

function createCubeMesh(engine: WebGLEngine, size = 1, offsetX = 0): ModelMesh {
  const vertices = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
  const indices = [
    0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
  ];
  return createModelMesh(
    engine,
    vertices.map((value, index) => value * size + (index % 3 === 0 ? offsetX : 0)),
    indices
  );
}

describe("MeshCollider", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let physics: PhysicsScene;
  const backend = createPhysics();

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: backend });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("mesh colliders");
    physics.gravity.set(0, -9.81, 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.destroy();
    engine.resourceManager.gc();
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial)).toHaveLength(0);
  });

  afterAll(() => engine.destroy());

  function update(count = 1): void {
    for (let i = 0; i < count; i++) physics._update(physics.fixedTimeStep);
  }

  function rayAt(x: number, y = 5): Ray {
    return new Ray(new Vector3(x, y, 0), new Vector3(0, -1, 0));
  }

  function addMesh(convex = false, mesh = createCubeMesh(engine)): MeshCollider {
    const collider = root.createChild("mesh").addComponent(MeshCollider);
    collider.convex = convex;
    collider.mesh = mesh;
    return collider;
  }

  function addTriggerProbe(radius = 1.5): CollisionRecorder {
    const entity = root.createChild("probe");
    const sphere = entity.addComponent(SphereCollider);
    sphere.radius = radius;
    sphere.isTrigger = true;
    entity.addComponent(Rigidbody).isKinematic = true;
    return entity.addComponent(CollisionRecorder);
  }

  function watchCooking(convex: boolean, physicsBackend = backend) {
    return vi.spyOn(physicsBackend._pxCooking, convex ? "createConvexMesh" : "createTriMesh");
  }

  it.each([false, true])(
    "shares one cook across cloned shapes and releases it after the last use (convex=%s)",
    (convex) => {
      const cook = watchCooking(convex);
      const collider = addMesh(convex);
      const mesh = collider.mesh!;
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit) && hit.collider === collider).toBe(true);
      const release = vi.spyOn(cook.mock.results[0].value, "release");

      // Uploading new render attributes rewrites the vertex buffer without changing the positions.
      mesh.setNormals(Array(mesh.vertexCount).fill(new Vector3(0, 1, 0)));
      mesh.uploadData(false);
      const cloneEntity = collider.entity.clone();
      root.addChild(cloneEntity);
      cloneEntity.transform.setPosition(6, 0, 0);
      cloneEntity.transform.setScale(2, 1, 1);
      const clone = cloneEntity.getComponent(MeshCollider)!;
      expect(clone.mesh).toBe(mesh);
      expect(physics.raycast(rayAt(7.5), hit) && hit.collider === clone).toBe(true);
      expect(physics.raycast(rayAt(1.5))).toBe(false);
      expect(cook).toHaveBeenCalledOnce();

      cloneEntity.destroy();
      expect(release).not.toHaveBeenCalled();
      collider.entity.transform.setScale(2, 1, 1);
      expect(physics.raycast(rayAt(1.5), hit) && hit.collider === collider).toBe(true);
      expect(cook).toHaveBeenCalledOnce();
      const probe = root.createChild("contact after rescale");
      probe.transform.setPosition(1.5, 1.25, 0);
      probe.addComponent(SphereCollider).radius = 0.5;
      probe.addComponent(Rigidbody).useGravity = false;
      const recorder = probe.addComponent(CollisionRecorder);
      update();
      expect(recorder.onCollisionEnter).toHaveBeenCalledOnce();
      probe.destroy();

      collider.enabled = false;
      collider.mesh = null;
      expect(release).toHaveBeenCalledOnce();
      expect(mesh.refCount).toBe(0);

      // With no live cook, reassignment reads even unsubmitted edits to the retained CPU positions.
      for (const vertex of mesh.getPositions()!) vertex.x *= 3;
      const rebound = addMesh(convex, mesh);
      expect(physics.raycast(rayAt(2.5), hit) && hit.collider === rebound).toBe(true);
      expect(cook).toHaveBeenCalledTimes(2);
      const reboundRelease = vi.spyOn(cook.mock.results[1].value, "release");
      rebound.destroy();
      expect(reboundRelease).toHaveBeenCalledOnce();
    }
  );

  it("shares a cook across instances of a loaded prefab", async () => {
    const meshUrl = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            type: "cuboid",
            cuboidWidth: 2,
            cuboidHeight: 2,
            cuboidDepth: 2,
            cuboidOptions: { keepMeshData: true }
          })
        ],
        { type: "application/json" }
      )
    );
    const prefabUrl = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            version: "2.0",
            refs: [{ url: "shared-cook.mesh" }],
            root: 0,
            entities: [{ name: "shared cook", components: [0] }],
            components: [{ type: "MeshCollider", props: { mesh: { $ref: 0 } } }]
          })
        ],
        { type: "application/json" }
      )
    );
    try {
      const resources = engine.resourceManager;
      resources.registerVirtualResources([
        { virtualPath: "shared-cook.mesh", path: meshUrl, type: AssetType.PrimitiveMesh }
      ]);
      const prefab = await resources.load<PrefabResource>({ url: prefabUrl, type: AssetType.Prefab });
      const cook = watchCooking(false);
      const a = prefab.instantiate();
      const b = prefab.instantiate();
      root.addChild(a);
      root.addChild(b);
      b.transform.setPosition(6, 0, 0);
      b.transform.setScale(2, 1, 1);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit) && hit.entity === a).toBe(true);
      expect(physics.raycast(rayAt(7.5), hit) && hit.entity === b).toBe(true);
      expect(cook).toHaveBeenCalledOnce();
    } finally {
      URL.revokeObjectURL(prefabUrl);
      URL.revokeObjectURL(meshUrl);
    }
  });

  it("uses new position and index data while existing colliders retain their snapshots", () => {
    const cook = watchCooking(false);
    const mesh = createModelMesh(engine, [-1, 0, -1, 1, 0, -1, 0, 0, 1, 3, 0, -1, 5, 0, -1, 4, 0, 1], [0, 2, 1]);
    const first = addMesh(false, mesh);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit) && hit.collider === first).toBe(true);

    const positions = mesh.getPositions()!;
    for (const point of positions) point.x += 2;
    mesh.setPositions(positions);
    const second = addMesh(false, mesh);
    second.entity.transform.setPosition(10, 0, 0);
    expect(physics.raycast(rayAt(12), hit) && hit.collider === second).toBe(true);
    expect(physics.raycast(rayAt(2))).toBe(false);

    const indices = mesh.getIndices()!;
    indices.set([3, 5, 4]);
    mesh.setIndices(indices);
    second.mesh = null;
    second.mesh = mesh;
    expect(physics.raycast(rayAt(16), hit) && hit.collider === second).toBe(true);
    expect(physics.raycast(rayAt(12))).toBe(false);
    expect(physics.raycast(rayAt(0), hit) && hit.collider === first).toBe(true);
    first.destroy();
    const third = addMesh(false, mesh);
    expect(physics.raycast(rayAt(6), hit) && hit.collider === third).toBe(true);
    expect(cook).toHaveBeenCalledTimes(3);
  });

  it("recooks after position buffer writes, layout changes, and buffer rebindings", () => {
    const cube = createCubeMesh(engine);
    const mesh = new ModelMesh(engine);
    mesh.setIndices(cube.getIndices()!);
    const positions = cube.getPositions()!;
    const vertexData = (first: number, second: number) =>
      new Float32Array(positions.flatMap(({ x, y, z }) => [x * first, y, z, x * second, y, z]));
    const vertexBuffer = (first: number, second: number) =>
      new Buffer(engine, BufferBindFlag.VertexBuffer, vertexData(first, second), BufferUsage.Static, true);
    const positionElement = (offset: number) =>
      new VertexElement(VertexAttribute.Position, offset, VertexElementFormat.Vector3, 0);

    const buffer = vertexBuffer(1, 1);
    mesh.setVertexElements([positionElement(0)]);
    mesh.setVertexBufferBinding(buffer, 24);
    const old = addMesh(false, mesh);
    const hit = new HitResult();
    const cook = watchCooking(false);
    expect(physics.raycast(rayAt(0), hit) && hit.collider === old).toBe(true);
    expect(physics.raycast(rayAt(1.5))).toBe(false);

    buffer.setData(vertexData(2, 3));
    const updated = addMesh(false, mesh);
    updated.entity.transform.setPosition(12, 0, 0);
    expect(physics.raycast(rayAt(13.5), hit) && hit.collider === updated).toBe(true);
    expect(physics.raycast(rayAt(14.5))).toBe(false);

    mesh.setVertexElements([positionElement(12)]);
    updated.mesh = null;
    updated.mesh = mesh;
    expect(physics.raycast(rayAt(14.5), hit) && hit.collider === updated).toBe(true);

    mesh.setVertexBufferBinding(vertexBuffer(1, 4), 24);
    updated.mesh = null;
    updated.mesh = mesh;
    expect(physics.raycast(rayAt(15.5), hit) && hit.collider === updated).toBe(true);

    mesh.setVertexBufferBindings([new VertexBufferBinding(vertexBuffer(1, 5), 24)]);
    updated.mesh = null;
    updated.mesh = mesh;
    expect(physics.raycast(rayAt(16.5), hit) && hit.collider === updated).toBe(true);
    expect(physics.raycast(rayAt(1.5))).toBe(false);
    expect(cook).toHaveBeenCalledTimes(5);
  });

  it("separates convex and triangle cooks and shares equivalent triangle cooking flags", () => {
    const triangle = watchCooking(false);
    const convex = watchCooking(true);
    const mesh = createCubeMesh(engine);
    const raw = addMesh(false, mesh);
    raw.cookingFlags = 0 as MeshColliderCookingFlag;
    const noCleaning = addMesh(false, mesh);
    noCleaning.cookingFlags = MeshColliderCookingFlag.VertexWelding;
    noCleaning.entity.transform.setPosition(4, 0, 0);
    const cleaned = addMesh(false, mesh);
    cleaned.cookingFlags = MeshColliderCookingFlag.Cleaning;
    cleaned.entity.transform.setPosition(8, 0, 0);
    const hull = addMesh(true, mesh);
    hull.entity.transform.setPosition(12, 0, 0);
    const secondHull = addMesh(true, mesh);
    secondHull.cookingFlags = MeshColliderCookingFlag.Cleaning;
    secondHull.entity.transform.setPosition(16, 0, 0);
    const hit = new HitResult();
    for (const collider of [raw, noCleaning, cleaned, hull, secondHull]) {
      expect(physics.raycast(rayAt(collider.entity.transform.position.x), hit) && hit.collider === collider).toBe(true);
    }
    expect(triangle).toHaveBeenCalledTimes(2);
    expect(convex).toHaveBeenCalledOnce();
  });

  it("shares a convex cook across index edits until positions change", () => {
    const cook = watchCooking(true);
    const first = addMesh(true);
    const mesh = first.mesh!;
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit) && hit.collider === first).toBe(true);

    mesh.setIndices(new Uint16Array([0, 3, 2]));
    const second = addMesh(true, mesh);
    second.entity.transform.setPosition(4, 0, 0);
    expect(physics.raycast(rayAt(4), hit) && hit.collider === second).toBe(true);
    expect(cook).toHaveBeenCalledOnce();

    const positions = mesh.getPositions()!;
    for (const position of positions) position.x *= 2;
    mesh.setPositions(positions);
    const wider = addMesh(true, mesh);
    wider.entity.transform.setPosition(8, 0, 0);
    expect(physics.raycast(rayAt(9.5), hit) && hit.collider === wider).toBe(true);
    expect(physics.raycast(rayAt(1.5))).toBe(false);
    expect(cook).toHaveBeenCalledTimes(2);
  });

  it("uses the selected position buffer even when the indices were committed later", () => {
    const makeBinding = (x: number) =>
      new VertexBufferBinding(
        new Buffer(
          engine,
          BufferBindFlag.VertexBuffer,
          new Float32Array([x - 1, 0, -1, x + 1, 0, -1, x, 0, 1]),
          BufferUsage.Static,
          true
        ),
        12
      );
    const mesh = new ModelMesh(engine);
    mesh.setVertexBufferBindings([makeBinding(0), makeBinding(4)]);
    const position = new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0);
    mesh.setVertexElements([position]);
    mesh.setIndices(new Uint16Array([0, 2, 1]));

    const first = addMesh(false, mesh);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit) && hit.collider === first).toBe(true);
    position.bindingIndex = 1;
    const second = addMesh(false, mesh);
    expect(physics.raycast(rayAt(4), hit) && hit.collider === second).toBe(true);
    expect(physics.raycast(rayAt(0), hit) && hit.collider === first).toBe(true);
  });

  it("rejects an inaccessible source even while another collider uses its existing cook", () => {
    const cook = watchCooking(false);
    const first = addMesh();
    const mesh = first.mesh!;
    expect(physics.raycast(rayAt(0))).toBe(true);
    mesh.uploadData(true);
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const second = addMesh(false, mesh);
    second.entity.transform.setPosition(5, 0, 0);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(5))).toBe(false);
    expect(physics.raycast(rayAt(0), hit) && hit.collider === first).toBe(true);
    expect(warnings).toHaveBeenCalledOnce();
    expect(cook).toHaveBeenCalledOnce();
  });

  it("cooks the same source independently in two PhysX instances", async () => {
    const cook = watchCooking(true);
    const first = addMesh(true);
    expect(physics.raycast(rayAt(0))).toBe(true);
    const mesh = first.mesh!;
    const other = createPhysics();
    await other.initialize();
    const material = other.createPhysicsMaterial(PhysicsMaterial._defaultProperties);
    try {
      const otherCook = watchCooking(true, other);
      // Use the backend factory to exercise isolation without switching Engine's configured backend.
      const shape = other.createMeshShape(
        0,
        mesh.getPositions()!,
        null,
        true,
        material,
        first.cookingFlags,
        new Vector3(1, 1, 1),
        mesh
      );
      try {
        expect(shape?.pointDistance(new Vector3(2, 0, 0)).w).toBeCloseTo(1);
        expect(otherCook).toHaveBeenCalledOnce();
        expect(cook).toHaveBeenCalledOnce();
      } finally {
        shape?.destroy();
      }
    } finally {
      material.destroy();
      other.destroy();
    }
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit) && hit.collider === first).toBe(true);
  });

  it("creates a triangle mesh lazily for raycasts", () => {
    const collider = addMesh(
      false,
      createModelMesh(engine, [-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2], [0, 2, 1, 1, 2, 3])
    );
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(hit.entity).toBe(collider.entity);
    expect(hit.distance).toBeCloseTo(5);
  });

  it("supports a convex hull without indices on a dynamic Rigidbody", () => {
    const collider = addMesh(true, createModelMesh(engine, [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]));
    collider.entity.addComponent(Rigidbody).useGravity = false;
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(hit.point.y).toBeCloseTo(1);
  });

  it.each([false, true])("stops a falling object on mesh geometry (convex=%s)", (convex) => {
    const ground = root.createChild("ground").addComponent(BoxCollider);
    ground.size.set(20, 1, 20);
    ground.entity.transform.setPosition(0, -2, 0);
    let falling: Entity;
    if (convex) {
      const mesh = addMesh(true, createModelMesh(engine, [0, 0.5, 0, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0, -0.5, 0.5]));
      falling = mesh.entity;
    } else {
      ground.destroy();
      addMesh(false, createModelMesh(engine, [-10, 0, -10, 10, 0, -10, -10, 0, 10, 10, 0, 10], [0, 2, 1, 1, 2, 3]));
      falling = root.createChild("sphere");
      falling.addComponent(SphereCollider).radius = 0.5;
    }
    falling.transform.setPosition(0, 3, 0);
    falling.addComponent(Rigidbody);
    const recorder = falling.addComponent(CollisionRecorder);
    update(120);
    expect(falling.transform.position.y).toBeLessThan(3);
    expect(falling.transform.position.y).toBeGreaterThan(convex ? -2 : 0.4);
    expect(recorder.onCollisionEnter).toHaveBeenCalled();
  });

  it("applies the mesh center, entity pose and material", () => {
    const collider = addMesh();
    collider.center.set(1, 2, 3);
    collider.entity.transform.setPosition(10, 0, 0);
    collider.entity.transform.setRotation(0, 90, 0);
    collider.entity.transform.setScale(2, 1, 1);
    const material = new PhysicsMaterial(engine);
    material.staticFriction = 0.5;
    material.dynamicFriction = 0.3;
    material.bounciness = 0.2;
    collider.material = material;
    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(13, 5, -3.5), new Vector3(0, -1, 0)), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(hit.point.y).toBeCloseTo(3);
    expect(physics.raycast(new Ray(new Vector3(14.5, 5, -2), new Vector3(0, -1, 0)), hit)).toBe(false);
    expect(collider.material).toBe(material);
    expect(collider.material.dynamicFriction).toBe(0.3);
  });

  it("reports enter, stay and exit when a sphere falls through a convex mesh trigger", () => {
    const mesh = addMesh(true);
    mesh.isTrigger = true;
    const sphere = root.createChild("falling sphere");
    sphere.transform.setPosition(0, 5, 0);
    sphere.addComponent(SphereCollider).radius = 0.3;
    sphere.addComponent(Rigidbody);
    const recorder = sphere.addComponent(CollisionRecorder);
    update(90);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerStay).toHaveBeenCalled();
    expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
    expect(sphere.transform.position.y).toBeLessThan(-1);
  });

  it("keeps an overlapping trigger pair when switching convex rebuilds the shape, then exits once", () => {
    const collider = addMesh(true);
    const probe = root.createChild("trigger probe");
    probe.transform.setPosition(0, 1.5, 0);
    const sphere = probe.addComponent(SphereCollider);
    sphere.radius = 1;
    sphere.isTrigger = true;
    probe.addComponent(Rigidbody).isKinematic = true;
    const recorder = probe.addComponent(CollisionRecorder);
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    collider.convex = false;
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerExit).not.toHaveBeenCalled();
    const stayCount = recorder.onTriggerStay.mock.calls.length;
    update();
    expect(recorder.onTriggerStay).toHaveBeenCalledTimes(stayCount + 1);
    collider.mesh = createCubeMesh(engine, 0.2);
    collider.convex = true;
    update(2);
    expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
  });

  it.each([false, true])("preserves scaled center and geometry through mesh updates (convex=%s)", (convex) => {
    const cook = watchCooking(convex);
    const collider = addMesh(convex);
    collider.center.x = 1;
    const hit = new HitResult();
    expect(physics.raycast(rayAt(3), hit)).toBe(false);
    expect(cook).toHaveBeenCalledOnce();
    collider.entity.transform.setScale(2, 1, 1);
    expect(physics.raycast(rayAt(3), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(cook).toHaveBeenCalledOnce();
    expect(physics.raycast(rayAt(8), hit)).toBe(false);
    const geometryWrites = vi.spyOn(collider["_native"]["_pxShape"], "setGeometry");
    collider.entity.transform.setScale(3, 1, 1);
    collider.mesh = createCubeMesh(engine, 2);
    expect(physics.raycast(rayAt(8), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(cook).toHaveBeenCalledTimes(2);
    expect(geometryWrites).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("applies world scale to mesh components created after synchronization (late=%s)", (late) => {
    const entity = root.createChild("scaled ground");
    entity.transform.setScale(2, 1, 2);
    if (late) {
      entity.addComponent(BoxCollider).center.set(100, 0, 100);
      update();
    }
    const collider = entity.addComponent(MeshCollider);
    collider.mesh = createModelMesh(engine, [-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2], [0, 2, 1, 1, 2, 3]);
    const sphere = root.createChild("edge sphere");
    sphere.transform.setPosition(3, 2, 0);
    sphere.addComponent(SphereCollider).radius = 0.5;
    sphere.addComponent(Rigidbody);
    update(90);
    expect(sphere.transform.position.y).toBeCloseTo(0.5, 1);
  });

  it.each([
    { name: "Uint8Array", IndexArray: Uint8Array },
    { name: "Uint16Array", IndexArray: Uint16Array },
    { name: "Uint32Array", IndexArray: Uint32Array }
  ])("updates indexed triangle meshes with $name indices", ({ IndexArray }) => {
    const collider = addMesh();
    const hit = new HitResult();
    expect(physics.raycast(rayAt(1.5), hit)).toBe(false);
    const previous = collider.mesh;
    const replacement = createCubeMesh(engine, 2);
    replacement.setIndices(new IndexArray(replacement.getIndices()));
    collider.mesh = replacement;
    expect(collider.mesh).toBe(replacement);
    expect(previous.refCount).toBe(0);
    expect(replacement.refCount).toBe(1);
    if (IndexArray === Uint8Array) {
      expect(physics.raycast(rayAt(1.5), hit) && hit.collider === collider).toBe(true);
      return;
    }

    const physX = (collider["_native"] as any)._physXPhysics._physX;
    const malloc = physX._malloc;
    let allocations = 0;
    const previousBuffer = physX.HEAPF32.buffer;
    const allocate = vi.spyOn(physX, "_malloc").mockImplementation((bytes: number) => {
      if (++allocations === 2) {
        // Grow the WASM heap between the vertex upload and index upload.
        physX._free(malloc(previousBuffer.byteLength));
      }
      return malloc(bytes);
    });
    try {
      expect(physics.raycast(rayAt(1.5), hit) && hit.collider === collider).toBe(true);
      expect(physX.HEAPF32.buffer).not.toBe(previousBuffer);
      expect(previousBuffer.byteLength).toBe(0);
    } finally {
      allocate.mockRestore();
    }
  });

  it("finds closest points on a scaled convex mesh and updates them after replacement", () => {
    const collider = addMesh(true);
    collider.center.x = 1;
    collider.entity.transform.setScale(2, 1, 1);
    const closest = new Vector3();
    expect(collider.getClosestPoint(new Vector3(6, 0, 0), closest)).toBeCloseTo(2);
    expect(closest.x).toBeCloseTo(4);
    expect(closest.y).toBeCloseTo(0);
    expect(closest.z).toBeCloseTo(0);
    expect(collider.getClosestPoint(new Vector3(2, 0, 0), closest)).toBe(0);
    expect(closest.x).toBeCloseTo(2);
    collider.mesh = createCubeMesh(engine, 2);
    expect(collider.getClosestPoint(new Vector3(6, 0, 0), closest)).toBeCloseTo(0);
    expect(closest.x).toBeCloseTo(6);
  });

  it("updates automatic mass properties after replacing convex mesh geometry", () => {
    const collider = addMesh(true);
    const body = collider.entity.addComponent(Rigidbody);
    body.useGravity = false;
    physics.raycast(rayAt(0));
    const inertia = body.inertiaTensor.clone();
    expect(body.centerOfMass.x).toBeCloseTo(0);
    collider.mesh = createCubeMesh(engine, 2, 3);
    physics.raycast(rayAt(3));
    expect(body.centerOfMass.x).toBeCloseTo(3);
    expect(body.inertiaTensor.x).toBeCloseTo(inertia.x * 4);
    expect(body.inertiaTensor.y).toBeCloseTo(inertia.y * 4);
    expect(body.inertiaTensor.z).toBeCloseTo(inertia.z * 4);
  });

  it.each(["mesh", "cookingFlags", "convex", "clear and restore"])(
    "preserves collision filtering after changing %s",
    (property) => {
      const collider = addMesh();
      collider.collisionLayer = Layer.Layer5;
      physics.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, false);
      function detectsCollision(): boolean {
        const entity = root.createChild("filtered probe");
        entity.transform.setPosition(0, 1.25, 0);
        const sphere = entity.addComponent(SphereCollider);
        sphere.collisionLayer = Layer.Layer6;
        entity.addComponent(Rigidbody).useGravity = false;
        const recorder = entity.addComponent(CollisionRecorder);
        update();
        const collided = recorder.onCollisionEnter.mock.calls.length > 0;
        entity.destroy();
        return collided;
      }
      try {
        expect(detectsCollision()).toBe(false);
        switch (property) {
          case "mesh":
            collider.mesh = createCubeMesh(engine, 1.1);
            break;
          case "cookingFlags":
            collider.cookingFlags = MeshColliderCookingFlag.Cleaning;
            break;
          case "convex":
            collider.convex = true;
            break;
          case "clear and restore": {
            const mesh = collider.mesh;
            collider.mesh = null;
            collider.mesh = mesh;
            break;
          }
        }
        expect(collider.collisionLayer).toBe(Layer.Layer5);
        expect(detectsCollision()).toBe(false);
        collider.collisionLayer = Layer.Layer0;
        expect(detectsCollision()).toBe(true);
      } finally {
        physics.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, true);
      }
    }
  );

  it.each([false, true])(
    "excludes invalid mesh data on sync while retaining declared mesh and recovers when replaced (live=%s)",
    (live) => {
      const collider = addMesh();
      const previous = collider.mesh;
      if (live) expect(physics.raycast(rayAt(0))).toBe(true);
      const inaccessible = createCubeMesh(engine, 2);
      inaccessible.uploadData(true);
      const noIndices = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const empty = new ModelMesh(engine);
      const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
      for (const mesh of [inaccessible, noIndices, empty]) {
        collider.mesh = mesh;
        expect(collider.mesh).toBe(mesh);
        expect(mesh.refCount).toBe(1);
        expect(physics.raycast(rayAt(0))).toBe(false);
      }
      expect(warnings).toHaveBeenCalledTimes(3);

      collider.mesh = previous;
      expect(collider.mesh).toBe(previous);
      expect(previous.refCount).toBe(1);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit)).toBe(true);
      expect(hit.collider).toBe(collider);
      expect(hit.point.y).toBeCloseTo(1);
    }
  );

  it("leaves an empty collider queryable only after a valid mesh is assigned", () => {
    const collider = root.addComponent(MeshCollider);
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(collider.getClosestPoint(new Vector3(5, 0, 0), new Vector3())).toBe(-1);
    expect(warnings).toHaveBeenCalledOnce();
    expect(physics.raycast(rayAt(0))).toBe(false);
    collider.mesh = createCubeMesh(engine);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it.each([false, true])(
    "warns and excludes released mesh when convex or cookingFlags change, then recovers with an accessible mesh (convex=%s)",
    (convex) => {
      const collider = addMesh(convex);
      expect(physics.raycast(rayAt(0))).toBe(true);
      collider.mesh.uploadData(true);
      const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
      collider.convex = !convex;
      expect(collider.convex).toBe(!convex);
      expect(physics.raycast(rayAt(0))).toBe(false);
      collider.cookingFlags = MeshColliderCookingFlag.Cleaning;
      expect(collider.cookingFlags).toBe(MeshColliderCookingFlag.Cleaning);
      expect(physics.raycast(rayAt(0))).toBe(false);
      expect(warnings).toHaveBeenCalledTimes(2);

      collider.mesh = createCubeMesh(engine);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit)).toBe(true);
      expect(hit.collider).toBe(collider);
    }
  );

  it("excludes a non-convex mesh missing indices until switched back to convex", () => {
    const collider = addMesh(true, createModelMesh(engine, [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]));
    expect(physics.raycast(rayAt(0))).toBe(true);
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    collider.convex = false;
    expect(collider.convex).toBe(false);
    expect(physics.raycast(rayAt(0))).toBe(false);
    expect(warnings).toHaveBeenCalledOnce();

    collider.convex = true;
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it.each([false, true])(
    "excludes geometry when native mesh cooking fails, then recovers when replaced (convex=%s)",
    (convex) => {
      const collider = addMesh(convex);
      const previous = collider.mesh;
      const recorder = addTriggerProbe();
      recorder.entity.getComponent(SphereCollider).collisionLayer = Layer.Layer1;
      update();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      const invalid = createModelMesh(engine, [0, 0, 0], [0, 0, 0]);
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      collider.mesh = invalid;
      expect(collider.mesh).toBe(invalid);
      expect(previous.refCount).toBe(0);
      expect(invalid.refCount).toBe(1);
      update(2);
      expect(errors).toHaveBeenCalled();
      expect(recorder.onTriggerStay).not.toHaveBeenCalled();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();
      expect(physics.raycast(rayAt(0), Number.MAX_VALUE, Layer.Layer0)).toBe(false);
      const replacement = createCubeMesh(engine, 1.1);
      collider.mesh = replacement;
      expect(collider.mesh).toBe(replacement);
      expect(invalid.refCount).toBe(0);
      expect(replacement.refCount).toBe(1);
      const recoveredHit = new HitResult();
      expect(physics.raycast(rayAt(0), Number.MAX_VALUE, Layer.Layer0, recoveredHit)).toBe(true);
      expect(recoveredHit.collider).toBe(collider);
      update();
      expect(recorder.onTriggerEnter).toHaveBeenCalledTimes(2);
    }
  );

  it.each([false, true])(
    "excludes geometry when recooking fails and allows retry once mesh data is fixed (convex=%s)",
    (convex) => {
      const collider = addMesh(convex);
      const mesh = collider.mesh;
      const positions = mesh.getPositions().map((point) => point.clone());
      const indices = mesh.getIndices();
      expect(physics.raycast(rayAt(0))).toBe(true);
      mesh.setPositions([new Vector3()]);
      mesh.setIndices(new Uint16Array([0, 0, 0]));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      collider.cookingFlags = MeshColliderCookingFlag.Cleaning;
      expect(collider.cookingFlags).toBe(MeshColliderCookingFlag.Cleaning);
      expect(collider.mesh).toBe(mesh);
      expect(physics.raycast(rayAt(0))).toBe(false);
      expect(errors).toHaveBeenCalled();
      mesh.setPositions(positions);
      mesh.setIndices(indices);
      collider.mesh = mesh;
      expect(collider.cookingFlags).toBe(MeshColliderCookingFlag.Cleaning);
      expect(physics.raycast(rayAt(0))).toBe(true);
    }
  );

  it.each([false, true])(
    "maintains trigger continuity across repeated convex replacements (meshFirst=%s)",
    (meshFirst) => {
      let collider: MeshCollider;
      let recorder: CollisionRecorder;
      if (meshFirst) {
        collider = addMesh();
        recorder = addTriggerProbe();
      } else {
        recorder = addTriggerProbe();
        collider = addMesh();
      }
      update();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      for (const convex of [true, false, true, false]) {
        const previousStays = recorder.onTriggerStay.mock.calls.length;
        collider.convex = convex;
        expect(collider.convex).toBe(convex);
        update(2);
        expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
        expect(recorder.onTriggerExit).not.toHaveBeenCalled();
        expect(recorder.onTriggerStay).toHaveBeenCalledTimes(previousStays + 2);
      }
      recorder.entity.transform.setPosition(10, 0, 0);
      update(3);
      expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerStay).toHaveBeenCalledTimes(8);
    }
  );

  it("ends an overlap when a convex hull becomes a hollow non-overlapping triangle mesh", () => {
    const collider = addMesh(
      true,
      createModelMesh(
        engine,
        [-3, -1, -1, -2.5, -1, -1, -3, 1, -1, -3, -1, 1, 3, -1, -1, 2.5, -1, -1, 3, 1, -1, 3, -1, 1],
        [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]
      )
    );
    const recorder = addTriggerProbe(0.5);
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerStay).toHaveBeenCalledOnce();
    collider.convex = false;
    update(3);
    expect(recorder.onTriggerStay).toHaveBeenCalledOnce();
    expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
    collider.convex = true;
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledTimes(2);
    expect(recorder.onTriggerStay).toHaveBeenCalledTimes(2);
    recorder.entity.transform.setPosition(10, 0, 0);
    update(3);
    expect(recorder.onTriggerExit).toHaveBeenCalledTimes(2);
    expect(recorder.onTriggerStay).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "preserves trigger continuity when mesh data or cooking flags change (convex=%s)",
    (convex) => {
      const collider = addMesh(convex);
      const recorder = addTriggerProbe();
      update();
      collider.mesh = createCubeMesh(engine, 1.1);
      update(2);
      collider.cookingFlags = MeshColliderCookingFlag.Cleaning;
      update(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();
      expect(recorder.onTriggerStay).toHaveBeenCalledTimes(4);
    }
  );

  it("removes query geometry and releases the mesh on null, then accepts replacement geometry", () => {
    const collider = addMesh();
    const original = collider.mesh;
    expect(physics.raycast(rayAt(0))).toBe(true);
    collider.mesh = null;
    expect(collider.mesh).toBeNull();
    expect(original.refCount).toBe(0);
    expect(physics.raycast(rayAt(0))).toBe(false);
    collider.mesh = createCubeMesh(engine, 2);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(1.5), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it.each(["disable-then-null", "null-then-disable"] as const)(
    "releases native mesh immediately when disabled and cleared (%s)",
    (order) => {
      const cook = watchCooking(false);
      const collider = addMesh();
      const original = collider.mesh!;
      expect(physics.raycast(rayAt(0))).toBe(true);
      const releaseSpy = vi.spyOn(cook.mock.results[0].value, "release");

      if (order === "disable-then-null") {
        collider.enabled = false;
        collider.mesh = null;
      } else {
        collider.mesh = null;
        collider.enabled = false;
      }

      expect(original.refCount).toBe(0);
      expect(releaseSpy).toHaveBeenCalledOnce();
      expect(collider["_native"]).toBeNull();

      collider.enabled = true;
      collider.mesh = createCubeMesh(engine, 2);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(1.5), hit)).toBe(true);
      expect(hit.collider).toBe(collider);
    }
  );

  it.each(["disable-then-replace", "replace-then-disable"] as const)(
    "releases native mesh immediately when disabled and replaced (%s)",
    (order) => {
      const cook = watchCooking(false);
      const collider = addMesh();
      const original = collider.mesh!;
      const replacement = createCubeMesh(engine, 2);
      expect(physics.raycast(rayAt(0))).toBe(true);
      const releaseSpy = vi.spyOn(cook.mock.results[0].value, "release");

      if (order === "disable-then-replace") {
        collider.enabled = false;
        collider.mesh = replacement;
      } else {
        collider.mesh = replacement;
        collider.enabled = false;
      }

      expect(original.refCount).toBe(0);
      expect(releaseSpy).toHaveBeenCalledOnce();
      expect(collider["_native"]).toBeNull();
      engine.resourceManager.gc();
      expect(original.destroyed).toBe(true);

      collider.enabled = true;
      const hit = new HitResult();
      expect(physics.raycast(rayAt(1.5), hit)).toBe(true);
      expect(hit.collider).toBe(collider);
    }
  );

  it("stores cooking flags before assigning geometry", () => {
    const collider = root.addComponent(MeshCollider);
    collider.cookingFlags = MeshColliderCookingFlag.Cleaning;
    collider.mesh = createCubeMesh(engine);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(collider.cookingFlags).toBe(MeshColliderCookingFlag.Cleaning);
  });

  it.each([false, true])("clones independent mesh components and retains shared meshes (kinematic=%s)", (kinematic) => {
    const collider = addMesh();
    if (kinematic) collider.entity.addComponent(Rigidbody).isKinematic = true;
    const sourceMesh = collider.mesh;
    expect(physics.raycast(rayAt(0))).toBe(true);
    const clone = collider.entity.clone();
    root.addChild(clone);
    clone.transform.setPosition(5, 0, 0);
    const copy = clone.getComponent(MeshCollider);
    expect(copy).not.toBe(collider);
    expect(copy.mesh).toBe(sourceMesh);
    expect(sourceMesh.refCount).toBe(2);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(5), hit)).toBe(true);
    expect(hit.collider).toBe(copy);
    expect(hit.entity).toBe(clone);
    const replacement = createCubeMesh(engine, 2);
    copy.mesh = replacement;
    expect(sourceMesh.refCount).toBe(1);
    expect(replacement.refCount).toBe(1);
    clone.destroy();
    expect(replacement.refCount).toBe(0);
    expect(sourceMesh.refCount).toBe(1);
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    collider.destroy();
    expect(sourceMesh.refCount).toBe(0);
  });

  it("rejects getClosestPoint on non-convex mesh colliders without mutating output", () => {
    const collider = addMesh(false);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = new Vector3(1, 2, 3);
    expect(collider.getClosestPoint(new Vector3(5, 0, 0), out)).toBe(-1);
    expect(errors).toHaveBeenCalledOnce();
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);

    collider.convex = true;
    expect(collider.getClosestPoint(new Vector3(5, 0, 0), out)).toBeCloseTo(4, 4);
    expect(out.x).toBeCloseTo(1, 4);
  });

  it("retains trigger/convex intent and excludes non-convex trigger on sync until resolved", () => {
    const collider = addMesh(false);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    collider.isTrigger = true;
    expect(collider.isTrigger).toBe(true);
    expect(physics.raycast(rayAt(0))).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1);

    collider.convex = true;
    expect(collider.convex).toBe(true);
    expect(collider.isTrigger).toBe(true);
    expect(physics.raycast(rayAt(0))).toBe(true);

    collider.convex = false;
    expect(collider.convex).toBe(false);
    expect(collider.isTrigger).toBe(true);
    expect(physics.raycast(rayAt(0))).toBe(false);
    expect(errors).toHaveBeenCalledTimes(2);

    collider.isTrigger = false;
    expect(collider.isTrigger).toBe(false);
    expect(physics.raycast(rayAt(0))).toBe(true);

    // Clearing mesh = null after a trigger rejection resets the rejection latch for the next assignment.
    collider.isTrigger = true;
    expect(physics.raycast(rayAt(0))).toBe(false);
    expect(errors).toHaveBeenCalledTimes(3);
    collider.mesh = null;
    expect(physics.raycast(rayAt(0))).toBe(false);
    collider.mesh = createCubeMesh(engine, 1);
    expect(physics.raycast(rayAt(0))).toBe(false);
    expect(errors).toHaveBeenCalledTimes(4);
  });

  it.each([false, true])("becomes queryable after starting at uniform zero scale (convex=%s)", (convex) => {
    const collider = addMesh(convex);
    const transform = collider.entity.transform;
    const ray = rayAt(0);
    const hit = new HitResult();

    transform.setScale(0, 0, 0);
    expect(physics.raycast(ray, hit)).toBe(false);
    expect(physics.overlapSphereAll(new Vector3(), 0.5)).toEqual([]);

    transform.setScale(1, 1, 1);
    expect(physics.raycast(ray, hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it("detaches cleanly on zero world scale without NaN inertia and recovers when scale becomes positive", () => {
    const collider = addMesh(true);
    collider.entity.transform.setPosition(0, 5, 0);
    const body = collider.entity.addComponent(Rigidbody);
    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), hit)).toBe(true);

    collider.entity.transform.setScale(0, 1, 1);
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), hit)).toBe(false);
    update(5);
    expect(Number.isFinite(collider.entity.transform.worldPosition.y)).toBe(true);
    expect(Number.isFinite(body.inertiaTensor.x)).toBe(true);

    // Change both cooking inputs while detached so recovery cannot reuse the old shape.
    body.isKinematic = true;
    collider.convex = false;
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), hit)).toBe(false);

    collider.entity.transform.setPosition(0, 5, 0);
    collider.entity.transform.setScale(1, 1, 1);
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), hit)).toBe(true);
    expect(hit.collider).toBe(collider);

    // Float32 overflow scale detaches cleanly and recovers when scale returns to normal
    collider.entity.transform.setScale(1e40, 1, 1);
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), hit)).toBe(false);
    collider.entity.transform.setScale(1, 1, 1);
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), hit)).toBe(true);
  });

  it.each([false, true])(
    "accepts PhysX minimum mesh scale 1e-6 and detaches out-of-range scales (convex=%s)",
    (convex) => {
      const mesh = createCubeMesh(engine, 2e6);
      const entity = root.createChild("min-scale-mesh");
      const collider = entity.addComponent(MeshCollider);
      collider.convex = convex;
      collider.mesh = mesh;

      // Use the exact minimum to catch a Float32 round-off rejection.
      entity.transform.setScale(1e-6, 1e-6, 1e-6);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit)).toBe(true);
      expect(hit.collider).toBe(collider);

      // Below PX_MESH_SCALE_MIN (1e-6) or above PX_MESH_SCALE_MAX (1e6) detaches cleanly
      entity.transform.setScale(1e-7, 1e-6, 1e-6);
      expect(physics.raycast(rayAt(0), hit)).toBe(false);
      entity.transform.setScale(1e7, 1, 1);
      expect(physics.raycast(rayAt(0), hit)).toBe(false);

      entity.transform.setScale(1e-6, 1e-6, 1e-6);
      expect(physics.raycast(rayAt(0), hit)).toBe(true);
      expect(hit.collider).toBe(collider);
    }
  );

  it.each([false, true])(
    "excludes a mesh with an unreadable POSITION buffer without throwing out of sync and recovers (convex=%s)",
    (convex) => {
      const other = root.createChild("independent-dynamic");
      other.transform.setPosition(10, 5, 0);
      const otherBox = other.addComponent(BoxCollider);
      const otherBody = other.addComponent(Rigidbody);

      const collider = addMesh(convex);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit) && hit.collider === collider).toBe(true);
      expect(physics.raycast(rayAt(10, 10), hit) && hit.collider === otherBox).toBe(true);

      const mesh = createCubeMesh(engine);
      const shifted = new Float32Array(mesh.getPositions()!.flatMap(({ x, y, z }) => [x + 4, y, z]));
      const setPositionBuffer = (readable: boolean) =>
        mesh.setVertexBufferBinding(
          new Buffer(engine, BufferBindFlag.VertexBuffer, shifted, BufferUsage.Static, readable),
          12
        );
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});

      setPositionBuffer(false);
      collider.mesh = mesh;
      expect(physics.raycast(rayAt(10, 10), hit)).toBe(true);
      expect(hit.collider).toBe(otherBox);
      expect(physics.raycast(rayAt(0))).toBe(false);
      expect(collider.mesh).toBe(mesh);
      expect(errors).toHaveBeenCalled();

      const initialY = other.transform.position.y;
      update(2);
      expect(other.transform.position.y).toBeLessThan(initialY);
      expect(otherBody.linearVelocity.y).toBeLessThan(0);

      errors.mockClear();
      collider.mesh = mesh;
      expect(physics.raycast(rayAt(0))).toBe(false);
      expect(errors).toHaveBeenCalled();

      setPositionBuffer(true);
      collider.mesh = mesh;
      expect(physics.raycast(rayAt(0))).toBe(false);
      expect(physics.raycast(rayAt(4), hit) && hit.collider === collider).toBe(true);
    }
  );

  it.each(["mesh", "box"] as const)("applies small world-scale changes (1e-6 -> 1.5e-6) accurately (%s)", (kind) => {
    const entity = root.createChild(`small-scale-${kind}`);
    entity.transform.setScale(1e-6, 1e-6, 1e-6);
    const collider = kind === "mesh" ? entity.addComponent(MeshCollider) : entity.addComponent(BoxCollider);
    if (collider instanceof MeshCollider) {
      collider.mesh = createModelMesh(
        engine,
        [-2e6, 0, -2e6, 2e6, 0, -2e6, -2e6, 0, 2e6, 2e6, 0, 2e6],
        [0, 2, 1, 1, 2, 3]
      );
    } else {
      collider.size.set(4e6, 2e6, 4e6);
    }

    const queryAt = (x: number): boolean => {
      const hit = new HitResult();
      return physics.raycast(new Ray(new Vector3(x, 8, 0.1), new Vector3(0, -1, 0)), hit) && hit.collider === collider;
    };

    const innerHits: boolean[] = [];
    const outerHits: boolean[] = [];
    for (const scale of [1e-6, 1.5e-6, 2.2e-6]) {
      entity.transform.setScale(scale, 1e-6, 1e-6);
      update();
      innerHits.push(queryAt(1));
      outerHits.push(queryAt(2.5));
    }
    expect(innerHits).toEqual([true, true, true]);
    expect(outerHits).toEqual([false, true, true]);
  });

  it("skips native recooking when convex or mesh returns to its already-cooked value before sync", () => {
    const collider = addMesh(false);
    const meshA = collider.mesh;
    const meshB = createCubeMesh(engine, 3);
    expect(physics.raycast(rayAt(0))).toBe(true);
    const nativeShape = (collider as any)._native;
    const cookSpy = vi.spyOn(nativeShape, "_cookMesh");
    const setMeshDataSpy = vi.spyOn(nativeShape, "setMeshData");
    collider.convex = true;
    collider.convex = false;
    collider.mesh = meshB;
    collider.mesh = meshA;
    expect(physics.raycast(rayAt(0))).toBe(true);
    expect(physics.raycast(rayAt(2.5))).toBe(false);
    expect(cookSpy).not.toHaveBeenCalled();
    expect(setMeshDataSpy).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "recooks when mesh is explicitly cleared and reassigned after mutating positions (convex=%s)",
    (convex) => {
      const mesh = createCubeMesh(engine, 1);
      const collider = addMesh(convex, mesh);
      expect(physics.raycast(rayAt(0))).toBe(true);
      expect(physics.raycast(rayAt(2.5))).toBe(false);

      const expanded = mesh.getPositions()!.map((p) => new Vector3(p.x * 3, p.y, p.z));
      mesh.setPositions(expanded);
      collider.mesh = null;
      collider.mesh = mesh;

      const hit = new HitResult();
      expect(physics.raycast(rayAt(2.5), hit) && hit.collider === collider).toBe(true);
    }
  );

  it.each(["sparse", "nonfinite"] as const)(
    "excludes meshes with invalid position entries without throwing out of sync (%s)",
    (mode) => {
      const other = root.createChild("independent");
      other.transform.setPosition(10, 5, 0);
      const otherBox = other.addComponent(BoxCollider);
      other.addComponent(Rigidbody);

      const collider = addMesh(true);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit) && hit.collider === collider).toBe(true);
      expect(physics.raycast(rayAt(10, 10), hit) && hit.collider === otherBox).toBe(true);

      const badMesh = createCubeMesh(engine, 1);
      const badPositions = badMesh.getPositions()!.map((p) => p.clone());
      if (mode === "sparse") {
        delete badPositions[1];
      } else {
        badPositions[1].x = Number.NaN;
      }
      badMesh.setPositions(badPositions);

      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      collider.mesh = badMesh;
      expect(() => physics.raycast(rayAt(10, 10), hit)).not.toThrow();
      expect(hit.collider).toBe(otherBox);
      expect(physics.raycast(rayAt(0))).toBe(false);
      expect(errors).toHaveBeenCalled();

      const beforeY = other.transform.position.y;
      expect(() => update(2)).not.toThrow();
      expect(other.transform.position.y).toBeLessThan(beforeY);

      collider.mesh = createCubeMesh(engine, 1);
      expect(physics.raycast(rayAt(0), hit) && hit.collider === collider).toBe(true);
    }
  );

  it.each(["box", "mesh"] as const)(
    "avoids redundant native geometry writes and mass rebuilds while rotating an unchanged uniform compound body (%s)",
    (kind) => {
      const bodyEntity = root.createChild(`rotate-scale-${kind}`);
      bodyEntity.transform.setScale(2, 2, 2);
      const body = bodyEntity.addComponent(Rigidbody);
      body.isKinematic = true;
      const child = bodyEntity.createChild("collider");
      const collider = kind === "box" ? child.addComponent(BoxCollider) : child.addComponent(MeshCollider);
      if (collider instanceof MeshCollider) {
        collider.convex = true;
        collider.mesh = createCubeMesh(engine, 1);
      }
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0, 8), hit) && hit.collider === collider).toBe(true);

      const geometryWrites = vi.spyOn(collider["_native"]["_pxShape"], "setGeometry");
      const massSpy = vi.spyOn((body as any)._nativeActor, "updateMassAndInertia");
      for (let i = 1; i <= 90; i++) {
        bodyEntity.transform.setRotation(0, i * 3.7, 0);
        expect(physics.raycast(rayAt(0, 8), hit) && hit.collider === collider).toBe(true);
      }
      expect(geometryWrites).not.toHaveBeenCalled();
      expect(massSpy).not.toHaveBeenCalled();
    }
  );

  it("reconciles active solid contacts across MeshCollider convex replaceShape transitions", () => {
    const collider = addMesh(true);
    const recorder = collider.entity.addComponent(CollisionRecorder);
    const probe = root.createChild("probe");
    probe.transform.setPosition(0, 1.45, 0);
    probe.addComponent(BoxCollider).size.set(1, 1, 1);
    const body = probe.addComponent(Rigidbody);
    body.useGravity = false;
    body.linearVelocity.set(0, -0.5, 0);

    update(1);
    expect(recorder.onCollisionEnter).toHaveBeenCalledOnce();
    expect(recorder.onCollisionExit).not.toHaveBeenCalled();

    // Switching convex <-> triangle replaces the native PxShape while still overlapping: Stay, no duplicate Enter.
    collider.convex = false;
    body.linearVelocity.set(0, -0.5, 0);
    update(1);
    expect(recorder.onCollisionEnter).toHaveBeenCalledOnce();
    expect(recorder.onCollisionStay).toHaveBeenCalled();
    expect(recorder.onCollisionExit).not.toHaveBeenCalled();

    // Separating cleanly after replacement emits Exit once.
    probe.transform.setPosition(0, 5, 0);
    update(1);
    expect(recorder.onCollisionExit).toHaveBeenCalledOnce();
  });
});
