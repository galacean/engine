/**
 * @title White Furnace Test
 * @category Material
 */
import {
  Camera,
  Color,
  DiffuseMode,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 14);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);

  // White Furnace Test (using gray to better visualize):
  // Uniform gray environment, gray baseColor, gray background
  // If energy is conserved, spheres should be indistinguishable from the background
  const furnaceColor = new Color(1, 1, 1, 1);

  scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
  scene.ambientLight.diffuseSolidColor = furnaceColor;
  scene.ambientLight.diffuseIntensity = 1.0;

  // Create a uniform gray specular cubemap for specular IBL
  // sRGB texture: hardware auto-converts sRGB->Linear on sampling
  const cubeSize = 64;
  const furnaceValue = 255; // 1.0 linear -> sRGB = 255
  const grayCube = new TextureCube(engine, cubeSize, TextureFormat.R8G8B8A8, true, true);
  const grayPixels = new Uint8Array(cubeSize * cubeSize * 4);
  for (let i = 0; i < grayPixels.length; i += 4) {
    grayPixels[i] = furnaceValue;
    grayPixels[i + 1] = furnaceValue;
    grayPixels[i + 2] = furnaceValue;
    grayPixels[i + 3] = 255;
  }
  for (let face = 0; face < 6; face++) {
    grayCube.setPixelBuffer(face as TextureCubeFace, grayPixels);
  }
  grayCube.generateMipmaps();
  grayCube.filterMode = TextureFilterMode.Trilinear;
  grayCube.wrapModeU = TextureWrapMode.Clamp;
  grayCube.wrapModeV = TextureWrapMode.Clamp;

  scene.ambientLight.specularTexture = grayCube;
  scene.ambientLight.specularIntensity = 1.0;

  // Set gray background
  scene.background.solidColor = furnaceColor;

  // Row 1: Gray metal spheres (metallic=1), roughness 0.0 ~ 1.0
  // Row 2: Gray metal spheres (metallic=1), roughness 0.0 ~ 1.0
  // Row 3: Gray dielectric spheres (metallic=0), roughness 0.0 ~ 1.0
  const cols = 7;
  const rows = 3;
  const spacing = 1.2;
  const offsetX = ((cols - 1) * spacing) / 2;
  const offsetY = ((rows - 1) * spacing) / 2;

  const rowConfigs = [
    { metallic: 1.0, baseColor: furnaceColor },
    { metallic: 1.0, baseColor: furnaceColor },
    { metallic: 0.0, baseColor: furnaceColor }
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

  updateForE2E(engine);
  initScreenshot(engine, camera);
});
