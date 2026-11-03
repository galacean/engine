import {
  BackgroundMode,
  Color,
  DiffuseMode,
  PrimitiveMesh,
  RealtimeIBLBaker,
  Scene,
  SkyBoxMaterial,
  SphericalHarmonics3,
  TextureCube,
  TextureCubeFace,
  Vector3,
  type Engine
} from "@galacean/engine";
import { PROCEDURAL_SKY_REALTIME_IBL_OPTIONS } from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import { FARMLANDS_LIGHTING as profile, farmlandsSkyUV } from "./FarmlandsLightingProfile.ts";

export function farmlandsLinearColor(rgb: readonly number[], intensity = 1): Color {
  return new Color(...(rgb.map((value) => Color.gammaToLinearSpace(value) * intensity) as [number, number, number]));
}

/** Hidden environment preparation; never changes Water, Terrain or the PlanningSession. */
export class FarmlandsPreviewLighting {
  private readonly scene: Scene;
  readonly material: SkyBoxMaterial;
  readonly baker: RealtimeIBLBaker;
  private destroyed = false;

  private constructor(
    engine: Engine,
    private readonly texture: TextureCube
  ) {
    const scene = (this.scene = new Scene(engine, "Scene_Demo lighting preparation"));
    const material = (this.material = new SkyBoxMaterial(engine));
    material.texture = texture;
    material.rotation = profile.skyRotation;
    material.exposure = profile.skyExposure;
    // Unity's Skybox/Cubemap uses unity_ColorSpaceDouble; neutral tint is sRGB 0.5.
    material.tintColor = farmlandsLinearColor(profile.skyTint, 1 / Color.gammaToLinearSpace(0.5));
    scene.background.mode = BackgroundMode.Sky;
    scene.background.sky.material = material;
    scene.background.sky.mesh = PrimitiveMesh.createCuboid(engine);
    try {
      this.baker = new RealtimeIBLBaker(scene, PROCEDURAL_SKY_REALTIME_IBL_OPTIONS);
      this.baker.requestBake();
    } catch (error) {
      scene.background.sky.mesh.destroy(true);
      scene.background.sky.mesh = null!;
      scene.background.sky.material = null!;
      material.destroy(true);
      scene.destroy();
      throw error;
    }
  }

  static async create(engine: Engine, signal: AbortSignal): Promise<FarmlandsPreviewLighting> {
    const response = await fetch(new URL("./assets/farmlands-sky-day.png", import.meta.url), { signal });
    if (!response.ok) throw new Error(`Scene_Demo sky: HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    let texture: TextureCube | undefined;
    try {
      signal.throwIfAborted();
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      // Scene_Demo's reflection resolution. The original panorama remains unchanged.
      const size = 512;
      texture = new TextureCube(engine, size);
      for (let face = 0; face < 6; face++) {
        const pixels = new Uint8Array(size * size * 4);
        for (let row = 0; row < size; row++)
          for (let col = 0; col < size; col++) {
            const [u, v] = farmlandsSkyUV(face, (2 * (col + 0.5)) / size - 1, (2 * (row + 0.5)) / size - 1);
            const x = u * width - 0.5,
              y = v * height - 0.5;
            const x0 = Math.floor(x),
              y0 = Math.floor(y),
              fx = x - x0,
              fy = y - y0;
            for (let channel = 0; channel < 4; channel++) {
              let value = 0;
              for (let dy = 0; dy < 2; dy++)
                for (let dx = 0; dx < 2; dx++) {
                  const offset = (Math.max(0, Math.min(height - 1, y0 + dy)) * width + ((x0 + dx + width) % width)) * 4;
                  value += data[offset + channel] * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
                }
              pixels[(row * size + col) * 4 + channel] = Math.round(value);
            }
          }
        texture.setPixelBuffer(face as TextureCubeFace, pixels);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal.throwIfAborted();
      }
      texture.generateMipmaps();
      return new FarmlandsPreviewLighting(engine, texture);
    } catch (error) {
      texture?.destroy(true);
      throw error;
    } finally {
      bitmap.close();
    }
  }

  get ambientLight() {
    return this.scene.ambientLight;
  }

  async ready(): Promise<void> {
    await this.baker.waitForFirstBake();
    if (this.destroyed) throw new DOMException("Lighting disposed", "AbortError");
    // Unity ambientMode=Trilight: diffuse uses the three authored colors, not the skybox.
    const sh = new SphericalHarmonics3();
    const direction = new Vector3();
    const equator = farmlandsLinearColor(profile.ambientEquator);
    const sky = farmlandsLinearColor(profile.ambientSky),
      ground = farmlandsLinearColor(profile.ambientGround);
    const count = 512;
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count,
        angle = i * Math.PI * (3 - Math.sqrt(5));
      const radius = Math.sqrt(1 - y * y);
      direction.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      const pole = y >= 0 ? sky : ground,
        weight = Math.abs(y);
      const color = new Color(
        equator.r + (pole.r - equator.r) * weight,
        equator.g + (pole.g - equator.g) * weight,
        equator.b + (pole.b - equator.b) * weight
      );
      sh.addLight(direction, color, 4 / count);
    }
    this.ambientLight.diffuseSphericalHarmonics = sh;
    this.ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
    this.ambientLight.diffuseIntensity = 1;
    this.ambientLight.specularIntensity = profile.reflectionIntensity;
  }

  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.baker.destroy();
    const mesh = this.scene.background.sky.mesh;
    this.scene.background.sky.material = null!;
    this.scene.background.sky.mesh = null!;
    this.material.destroy(true);
    mesh?.destroy(true);
    this.texture.destroy(true);
    this.scene.destroy();
  }
}
