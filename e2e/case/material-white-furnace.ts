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

  // White Furnace Test:
  // Pure white uniform environment (no directional light, only solid color ambient)
  // Pure white metallic spheres (metallic=1, baseColor=white)
  // If energy is conserved, spheres should be indistinguishable from the white background
  scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
  scene.ambientLight.diffuseSolidColor = new Color(1, 1, 1, 1);
  scene.ambientLight.diffuseIntensity = 1.0;

  // Create a pure white specular cubemap for uniform specular IBL
  const cubeSize = 64;
  const whiteCube = new TextureCube(engine, cubeSize, TextureFormat.R8G8B8A8, true);
  const whitePixels = new Uint8Array(cubeSize * cubeSize * 4);
  for (let i = 0; i < whitePixels.length; i += 4) {
    whitePixels[i] = 255;
    whitePixels[i + 1] = 255;
    whitePixels[i + 2] = 255;
    whitePixels[i + 3] = 255;
  }
  for (let face = 0; face < 6; face++) {
    whiteCube.setPixelBuffer(face as TextureCubeFace, whitePixels);
  }
  whiteCube.generateMipmaps();
  whiteCube.filterMode = TextureFilterMode.Trilinear;
  whiteCube.wrapModeU = TextureWrapMode.Clamp;
  whiteCube.wrapModeV = TextureWrapMode.Clamp;

  scene.ambientLight.specularTexture = whiteCube;
  scene.ambientLight.specularIntensity = 1.0;

  // Set white background
  scene.background.solidColor = new Color(1, 1, 1, 1);

  // Row 1: White metal spheres (metallic=1), roughness 0.0 ~ 1.0
  // Row 2: White metal spheres (metallic=1), roughness 0.0 ~ 1.0
  // Row 3: White dielectric spheres (metallic=0), roughness 0.0 ~ 1.0
  const cols = 7;
  const rows = 3;
  const spacing = 1.2;
  const offsetX = ((cols - 1) * spacing) / 2;
  const offsetY = ((rows - 1) * spacing) / 2;

  const rowConfigs = [
    { metallic: 1.0, baseColor: new Color(1, 1, 1, 1) },
    { metallic: 1.0, baseColor: new Color(1, 1, 1, 1) },
    { metallic: 0.0, baseColor: new Color(1, 1, 1, 1) }
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
