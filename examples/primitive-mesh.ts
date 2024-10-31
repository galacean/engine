/**
 * @title Primitive Mesh
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*0MTbR5vkdFQAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AssetType,
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  Entity,
  Material,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh,
  RenderFace,
  Script,
  Texture2D,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

main();

async function main(): void {
  // Create engine
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  // Create root entity
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.ambientLight.diffuseSolidColor = new Color(0.6, 0.6, 0.6);

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 20);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  // Create direct light
  const lightEntity = rootEntity.createChild("DirectLight");
  const light = lightEntity.addComponent(DirectLight);
  light.intensity = 0.6;

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ArCHTbfVPXUAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      const distanceX = 2.5;
      const distanceY = 2.4;
      const position = new Vector3();

      // Create material
      const material = new BlinnPhongMaterial(engine);
      material.renderFace = RenderFace.Double;
      material.baseTexture = texture;

      for (let i = 0; i < 3; i++) {
        const posX = (i - 1) * distanceX;

        // Create cuboid
        position.set(posX, distanceY * 3, 0);
        generatePrimitiveEntity(
          rootEntity,
          "cuboid",
          position,
          material,
          PrimitiveMesh.createCuboid(engine)
        );

        // Create sphere
        position.set(posX, distanceY * 2, 0);
        generatePrimitiveEntity(
          rootEntity,
          "sphere",
          position,
          material,
          PrimitiveMesh.createSphere(engine)
        );

        // Create plane
        position.set(posX, distanceY * 1, 0);
        generatePrimitiveEntity(
          rootEntity,
          "plane",
          position,
          material,
          PrimitiveMesh.createPlane(engine)
        );

        // Create cylinder
        position.set(posX, -distanceY * 0, 0);
        generatePrimitiveEntity(
          rootEntity,
          "cylinder",
          position,
          material,
          PrimitiveMesh.createCylinder(engine)
        );

        // Create cone
        position.set(posX, -distanceY * 1, 0);
        generatePrimitiveEntity(
          rootEntity,
          "cone",
          position,
          material,
          PrimitiveMesh.createCone(engine)
        );

        // Create turos
        position.set(posX, -distanceY * 2, 0);
        generatePrimitiveEntity(
          rootEntity,
          "torus",
          position,
          material,
          PrimitiveMesh.createTorus(engine)
        );

        // Create capsule
        position.set(posX, -distanceY * 3, 0);
        generatePrimitiveEntity(
          rootEntity,
          "capsule",
          position,
          material,
          PrimitiveMesh.createCapsule(engine, 0.5, 1, 24, 1)
        );
      }
    });

  // Run engine
  engine.run();
}

/**
 * generate primitive mesh entity.
 */
function generatePrimitiveEntity(
  rootEntity: Entity,
  name: string,
  position: Vector3,
  material: Material,
  mesh: ModelMesh
): Entity {
  const entity = rootEntity.createChild(name);
  entity.transform.setPosition(position.x, position.y, position.z);
  entity.addComponent(RotateScript);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(material);

  return entity;
}

/**
 * Script for rotate.
 */
class RotateScript extends Script {
  /**
   * @override
   * The main loop, called frame by frame.
   * @param deltaTime - The deltaTime when the script update.
   */
  onUpdate(deltaTime: number): void {
    this.entity.transform.rotate(0.5, 0.6, 0);
  }
}
