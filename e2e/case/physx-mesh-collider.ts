/**
 * @title PhysX Mesh Collider
 * @category Physics
 */
import {
  WebGLEngine,
  Vector3,
  MeshRenderer,
  PointLight,
  Camera,
  StaticCollider,
  DynamicCollider,
  CollisionDetectionMode,
  PBRMaterial,
  AmbientLight,
  AssetType,
  Entity,
  ModelMesh,
  MeshColliderShape,
  GLTFResource,
  SphereColliderShape,
  BoxColliderShape,
  PrimitiveMesh,
  Color
} from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create a sphere that falls into the pot
function createFallingSphere(
  engine: WebGLEngine,
  rootEntity: Entity,
  position: Vector3,
  radius: number,
  color: Color
): Entity {
  const entity = rootEntity.createChild("sphere");
  entity.transform.setPosition(position.x, position.y, position.z);

  // Visual
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(engine, radius, 16);
  const material = new PBRMaterial(engine);
  material.baseColor.copyFrom(color);
  material.roughness = 0.5;
  material.metallic = 0.3;
  renderer.setMaterial(material);

  // Physics - sphere collider with CCD to prevent tunneling
  const collider = entity.addComponent(DynamicCollider);
  collider.collisionDetectionMode = CollisionDetectionMode.Continuous;
  const shape = new SphereColliderShape();
  shape.radius = radius;
  collider.addShape(shape);

  return entity;
}

// Create a box that falls into the pot
function createFallingBox(
  engine: WebGLEngine,
  rootEntity: Entity,
  position: Vector3,
  size: Vector3,
  color: Color
): Entity {
  const entity = rootEntity.createChild("box");
  entity.transform.setPosition(position.x, position.y, position.z);
  entity.transform.rotate(new Vector3(15, 30, 10)); // Random rotation

  // Visual
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, size.x, size.y, size.z);
  const material = new PBRMaterial(engine);
  material.baseColor.copyFrom(color);
  material.roughness = 0.6;
  material.metallic = 0.2;
  renderer.setMaterial(material);

  // Physics - box collider with CCD to prevent tunneling
  const collider = entity.addComponent(DynamicCollider);
  collider.collisionDetectionMode = CollisionDetectionMode.Continuous;
  const shape = new BoxColliderShape();
  shape.size = size;
  collider.addShape(shape);

  return entity;
}

WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
  scene.ambientLight.diffuseIntensity = 1.2;

  // Camera - positioned to see the pot from above-front angle
  // Note: pot is NOT scaled (to keep physics mesh aligned), so camera is closer
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0.5, 1);
  cameraEntity.transform.lookAt(new Vector3(0, 0.07, 0));

  // Light
  const lightEntity = rootEntity.createChild("light");
  lightEntity.transform.setPosition(3, 5, 3);
  lightEntity.addComponent(PointLight);

  // Load pot model and environment
  Promise.all([
    engine.resourceManager.load<GLTFResource>({
      url: "https://mdn.alipayobjects.com/rms/afts/file/A*UZO7RaRQa2kAAAAAgDAAAAgAehQnAQ/pot.glb",
      type: AssetType.GLTF,
      params: { keepMeshData: true } // Required for MeshColliderShape.setMesh()
    }),
    engine.resourceManager.load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
    })
  ]).then(([gltf, ambientLight]) => {
    scene.ambientLight = ambientLight;

    // Add pot to scene
    const pot = gltf.instantiateSceneRoot();
    pot.name = "pot";
    rootEntity.addChild(pot);

    // Position pot - NO SCALING to keep physics mesh aligned with visuals
    pot.transform.setPosition(0, 0, 0);

    // Add MeshCollider to each mesh's entity (not the root!)
    // This ensures collision mesh aligns with visual mesh in local space
    const renderers = pot.getComponentsIncludeChildren(MeshRenderer, []);

    // Calculate pot bounds for positioning objects
    let minY = Infinity,
      maxY = -Infinity,
      minX = Infinity,
      maxX = -Infinity;

    for (const renderer of renderers) {
      const mesh = renderer.mesh as ModelMesh;
      if (mesh) {
        const positions = mesh.getPositions();
        if (positions && positions.length > 0) {
          // Calculate bounds (in local space)
          for (const pos of positions) {
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y);
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x);
          }

          // Add collider to the RENDERER'S entity, not root
          const meshEntity = renderer.entity;
          let collider = meshEntity.getComponent(StaticCollider);
          if (!collider) {
            collider = meshEntity.addComponent(StaticCollider);
          }

          const meshShape = new MeshColliderShape(false); // isConvex = false for concave pot
          meshShape.setMesh(mesh);
          collider.addShape(meshShape);
        }
      }
    }

    // Debug: log pot size
    const potWidth = maxX - minX;
    const potHeight = maxY - minY;
    console.log(
      `Pot bounds: width=${potWidth.toFixed(3)}, height=${potHeight.toFixed(3)}, minY=${minY.toFixed(3)}, maxY=${maxY.toFixed(3)}`
    );

    // Use defaults if bounds are invalid (no mesh data found)
    const validBounds = isFinite(potWidth) && isFinite(potHeight) && potWidth > 0;
    const actualPotWidth = validBounds ? potWidth : 0.24;
    const actualMinY = validBounds ? minY : 0;
    const actualMaxY = validBounds ? maxY : 0.05;

    // Add ground plane to catch falling objects (in case pot has no bottom)
    const ground = rootEntity.createChild("ground");
    ground.transform.setPosition(0, actualMinY - 0.01, 0);
    const groundCollider = ground.addComponent(StaticCollider);
    const groundShape = new BoxColliderShape();
    groundShape.size = new Vector3(2, 0.02, 2);
    groundCollider.addShape(groundShape);

    // Create falling objects - use pot bounds to position correctly
    // Objects should be above pot and sized relative to pot
    const sphereRadius = actualPotWidth * 0.15; // 15% of pot width
    const boxSize = actualPotWidth * 0.12;
    const dropHeight = actualMaxY + actualPotWidth * 2; // Drop from above pot

    // 3 spheres with different colors
    const sphereColors = [
      new Color(0.9, 0.2, 0.2, 1.0), // Red
      new Color(0.2, 0.9, 0.2, 1.0), // Green
      new Color(0.2, 0.2, 0.9, 1.0) // Blue
    ];

    // Position objects to fall into the center of pot
    const offset = potWidth * 0.15;
    const spherePositions = [
      new Vector3(0, dropHeight, 0), // Center
      new Vector3(-offset, dropHeight + 0.1, offset),
      new Vector3(offset, dropHeight + 0.2, -offset)
    ];

    for (let i = 0; i < spherePositions.length; i++) {
      createFallingSphere(engine, rootEntity, spherePositions[i], sphereRadius, sphereColors[i]);
    }

    // 1 box - orange
    createFallingBox(
      engine,
      rootEntity,
      new Vector3(0, dropHeight + 0.3, 0),
      new Vector3(boxSize, boxSize, boxSize),
      new Color(0.9, 0.5, 0.2, 1.0)
    );

    console.log(`Objects: sphereRadius=${sphereRadius.toFixed(3)}, dropHeight=${dropHeight.toFixed(3)}`);

    // Run physics simulation
    updateForE2E(engine, 80, 50);
    initScreenshot(engine, camera);
  });
});
