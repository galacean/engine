/**
 * @title Energy Compensation
 * @category Material
 */
import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Light
  const lightEntity = rootEntity.createChild("light");
  const directLight = lightEntity.addComponent(DirectLight);
  directLight.color = new Color(1, 1, 1, 1);
  lightEntity.transform.setPosition(5, 5, 5);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  // Camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 14);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);

  // Row 1: Gold metal spheres (metallic=1, baseColor=gold), roughness 0.0 ~ 1.0
  // Row 2: Silver metal spheres (metallic=1, baseColor=silver), roughness 0.0 ~ 1.0
  // Row 3: Dielectric spheres (metallic=0), roughness 0.0 ~ 1.0
  const cols = 7;
  const rows = 3;
  const spacing = 1.2;
  const offsetX = ((cols - 1) * spacing) / 2;
  const offsetY = ((rows - 1) * spacing) / 2;

  const rowConfigs = [
    { metallic: 1.0, baseColor: new Color(1.0, 0.765, 0.336, 1.0) }, // Gold
    { metallic: 1.0, baseColor: new Color(0.972, 0.960, 0.915, 1.0) }, // Silver
    { metallic: 0.0, baseColor: new Color(1.0, 1.0, 1.0, 1.0) } // Dielectric
  ];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const entity = rootEntity.createChild(`sphere_${row}_${col}`);
      entity.transform.setPosition(col * spacing - offsetX, (rows - 1 - row) * spacing - offsetY, 0);

      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 32);

      const material = new PBRMaterial(engine);
      material.baseColor = rowConfigs[row].baseColor;
      material.metallic = rowConfigs[row].metallic;
      material.roughness = col / (cols - 1);
      renderer.setMaterial(material);
    }
  }

  // Load environment map
  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      updateForE2E(engine);
      initScreenshot(engine, camera);
    });
});
