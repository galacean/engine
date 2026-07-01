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
  engine.canvas.setResolution(1200, 800);

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 14);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);

  // Exact sRGB to linear transfer function matching GPU hardware (IEC 61966-2-1)
  function sRGBToLinear(value: number): number {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  // White Furnace Test:
  // Uniform environment with 100% reflective material (white baseColor)
  // If energy is conserved, spheres should be indistinguishable from the background
  // Environment color can be any uniform value; baseColor must be white (F0=1 for metal)
  // Use a linear value that round-trips exactly through sRGB 8-bit quantization
  const sRGBByte = 186;
  const envLinear = sRGBToLinear(sRGBByte / 255);
  const envColor = new Color(envLinear, envLinear, envLinear, 1);
  const whiteColor = new Color(1, 1, 1, 1);

  scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
  scene.ambientLight.diffuseSolidColor = envColor;
  scene.ambientLight.diffuseIntensity = 1.0;

  // Create a uniform specular cubemap for specular IBL
  // sRGB texture: hardware auto-converts sRGB->Linear on sampling
  const cubeSize = 64;
  const furnaceValue = sRGBByte;
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

  // Set background to same color
  scene.background.solidColor = envColor;

  // Row 1: Metal spheres (metallic=1), roughness 0.0 ~ 1.0
  // Row 2: Metal spheres (metallic=1), roughness 0.0 ~ 1.0
  // Row 3: Dielectric spheres (metallic=0), roughness 0.0 ~ 1.0
  const cols = 7;
  const rows = 3;
  const spacing = 1.2;
  const offsetX = ((cols - 1) * spacing) / 2;
  const offsetY = ((rows - 1) * spacing) / 2;

  const rowConfigs = [
    { metallic: 1.0, baseColor: whiteColor },
    { metallic: 1.0, baseColor: whiteColor },
    { metallic: 0.0, baseColor: whiteColor }
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
