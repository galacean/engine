import {
  BackgroundMode,
  DirectLight,
  Engine,
  Entity,
  FogMode,
  ModelMesh,
  PrimitiveMesh,
  ShadowCascadesMode,
  ShadowResolution,
  ShadowType,
  SkyProceduralMaterial,
  SunMode,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat
} from "@galacean/engine-core";
import {
  Color,
  SphericalHarmonics3,
  Vector3
} from "@galacean/engine-math";

export interface OceanDuskEnvironmentState {
  readonly timeOfDay: number;
  readonly weather: "clear";
  readonly sunDirection: Vector3;
  readonly sunColor: Color;
  readonly sunIntensity: number;
  readonly shadowStrength: number;
  readonly skyTint: Color;
  readonly groundTint: Color;
  readonly skyExposure: number;
  readonly atmosphereThickness: number;
  readonly ambientIntensity: number;
  readonly ambientSH: SphericalHarmonics3;
  readonly iblIntensity: number;
  readonly iblTexture?: TextureCube;
  readonly fogMode: FogMode;
  readonly fogColor: Color;
  readonly fogDensity: number;
  readonly aoEnabled: boolean;
  readonly aoIntensity: number;
  readonly aoRadius: number;
  readonly aoPower: number;
}

interface OceanEnvironmentLighting {
  enabled: boolean;
  applyState(state: OceanDuskEnvironmentState): void;
}

export interface OceanDuskEnvironmentMetrics {
  readonly enabled: boolean;
  readonly stateId: "ocean-beach-dusk-v1";
  readonly directLightCount: 1;
  readonly sceneSunOwned: boolean;
  readonly proceduralSkyEnabled: boolean;
  readonly proceduralSunDiskEnabled: boolean;
  readonly ambientSphericalHarmonicsEnabled: boolean;
  readonly iblIntensity: number;
  readonly iblTextureBound: boolean;
  readonly fogEnabled: boolean;
  readonly fogDensity: number;
  readonly ambientOcclusionEnabled: boolean;
  readonly sunDirectionX: number;
  readonly sunDirectionY: number;
  readonly sunDirectionZ: number;
  readonly sunGlitterEnabled: boolean;
  readonly resourceCount: number;
  readonly resourceBytes: number;
}

const OCEAN_DUSK_STATE_ID = "ocean-beach-dusk-v1";
const OCEAN_DUSK_IBL_SIZE = 64;

function clampByte(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}

function smoothstep(
  minimum: number,
  maximum: number,
  value: number
): number {
  const ratio = Math.min(
    1,
    Math.max(0, (value - minimum) / (maximum - minimum))
  );
  return ratio * ratio * (3 - ratio * 2);
}

function resolveCubeDirection(
  face: TextureCubeFace,
  u: number,
  v: number,
  out: Vector3
): Vector3 {
  switch (face) {
    case TextureCubeFace.PositiveX:
      out.set(1, -v, -u);
      break;
    case TextureCubeFace.NegativeX:
      out.set(-1, -v, u);
      break;
    case TextureCubeFace.PositiveY:
      out.set(u, 1, v);
      break;
    case TextureCubeFace.NegativeY:
      out.set(u, -1, -v);
      break;
    case TextureCubeFace.PositiveZ:
      out.set(u, -v, 1);
      break;
    case TextureCubeFace.NegativeZ:
      out.set(-u, -v, -1);
      break;
  }
  return out.normalize();
}

/**
 * Creates the tracked dusk CubeTexture required by Galacean PBR specular IBL.
 * It is authored directly in its final low-frequency form; no runtime HDRI
 * convolution or readback is introduced.
 */
export function createOceanDuskIblTexture(
  engine: Engine,
  sunlightDirection: Vector3
): TextureCube {
  const texture = new TextureCube(
    engine,
    OCEAN_DUSK_IBL_SIZE,
    TextureFormat.R8G8B8A8,
    true,
    true
  );
  texture.name = "OceanDuskSpecularIbl";
  texture.filterMode = TextureFilterMode.Trilinear;
  const direction = new Vector3();
  const sunViewDirection = sunlightDirection
    .clone()
    .scale(-1)
    .normalize();
  for (
    let faceIndex = TextureCubeFace.PositiveX;
    faceIndex <= TextureCubeFace.NegativeZ;
    faceIndex++
  ) {
    const face = faceIndex as TextureCubeFace;
    const pixels = new Uint8Array(
      OCEAN_DUSK_IBL_SIZE *
        OCEAN_DUSK_IBL_SIZE *
        4
    );
    for (let y = 0; y < OCEAN_DUSK_IBL_SIZE; y++) {
      const v =
        ((y + 0.5) / OCEAN_DUSK_IBL_SIZE) * 2 - 1;
      for (let x = 0; x < OCEAN_DUSK_IBL_SIZE; x++) {
        const u =
          ((x + 0.5) / OCEAN_DUSK_IBL_SIZE) * 2 - 1;
        resolveCubeDirection(face, u, v, direction);
        const upward = smoothstep(-0.08, 0.78, direction.y);
        const ground = smoothstep(0.04, -0.72, direction.y);
        const horizon = Math.exp(
          -Math.abs(direction.y) * 5.2
        );
        const sunDot = Math.max(
          0,
          Vector3.dot(direction, sunViewDirection)
        );
        const sunGlow = Math.pow(sunDot, 28);
        const sunCore = Math.pow(sunDot, 420);
        const offset =
          (y * OCEAN_DUSK_IBL_SIZE + x) * 4;
        pixels[offset] = clampByte(
          56 +
            upward * 22 +
            ground * -17 +
            horizon * 94 +
            sunGlow * 92 +
            sunCore * 118
        );
        pixels[offset + 1] = clampByte(
          61 +
            upward * 20 +
            ground * -24 +
            horizon * 48 +
            sunGlow * 45 +
            sunCore * 92
        );
        pixels[offset + 2] = clampByte(
          83 +
            upward * 27 +
            ground * -36 +
            horizon * 25 +
            sunGlow * 12 +
            sunCore * 38
        );
        pixels[offset + 3] = 255;
      }
    }
    texture.setPixelBuffer(face, pixels);
  }
  texture.generateMipmaps();
  return texture;
}

function createOceanDuskSphericalHarmonics(): SphericalHarmonics3 {
  const harmonics = new SphericalHarmonics3();
  harmonics.addLight(
    new Vector3(0, 1, 0),
    new Color(0.26, 0.235, 0.29),
    Math.PI * 0.68
  );
  harmonics.addLight(
    new Vector3(0, -1, 0),
    new Color(0.12, 0.075, 0.055),
    Math.PI * 0.34
  );
  harmonics.addLight(
    new Vector3(-0.29, 0.17, -0.942).normalize(),
    new Color(0.72, 0.24, 0.07),
    0.28
  );
  // A coastal sunset still receives broad blue-sky fill. This isotropic term
  // preserves detail on the camera-facing sides of back-lit PBR rocks without
  // inventing a second direct light or a second shadow direction.
  harmonics.coefficients[0] += 0.68;
  harmonics.coefficients[1] += 0.71;
  harmonics.coefficients[2] += 0.82;
  return harmonics;
}

/**
 * Creates the one authored environment state used by every Ocean dusk capture.
 *
 * The direction points from the procedural sun toward the scene. Both the sky
 * sun disk and the PBR/water light therefore consume the same scene.sun fact.
 */
export function createOceanDuskEnvironmentState(
  iblTexture?: TextureCube
): OceanDuskEnvironmentState {
  return {
    timeOfDay: 0.71,
    weather: "clear",
    sunDirection: new Vector3(0.29, -0.082, 0.954).normalize(),
    sunColor: new Color(1, 0.54, 0.29, 1),
    sunIntensity: 1.78,
    shadowStrength: 0.38,
    // SkyProceduralMaterial interprets this as a scattering-wavelength tint,
    // not as a literal background color. A near-neutral, slightly cool input
    // preserves the physical blue-to-amber gradient; the previous saturated
    // blue input shifted the low-angle atmosphere toward flat olive grey.
    skyTint: new Color(0.19, 0.215, 0.255, 1),
    groundTint: new Color(0.13, 0.072, 0.047, 1),
    skyExposure: 1.12,
    atmosphereThickness: 0.78,
    ambientIntensity: 1.24,
    ambientSH: createOceanDuskSphericalHarmonics(),
    iblIntensity: 1.02,
    iblTexture,
    fogMode: FogMode.ExponentialSquared,
    fogColor: new Color(0.25, 0.185, 0.19, 1),
    fogDensity: 0.0038,
    aoEnabled: true,
    aoIntensity: 0.42,
    aoRadius: 0.55,
    aoPower: 1.2
  };
}

/**
 * Demo-owned, deterministic dusk environment.
 *
 * It creates exactly one DirectLight, assigns it to scene.sun, and delegates
 * all sky, ambient SH, IBL intensity, fog and AO writes to EnvironmentLighting.
 */
export class OceanDuskEnvironmentController {
  readonly root: Entity;
  readonly state: OceanDuskEnvironmentState;
  private readonly _sun: DirectLight;
  private readonly _skyMaterial: SkyProceduralMaterial;
  private readonly _skyMesh: ModelMesh;
  private readonly _iblTexture: TextureCube;
  private _enabled = true;
  private _destroyed = false;

  constructor(private readonly _engine: Engine, parent: Entity) {
    const scene = _engine.sceneManager.activeScene;
    this.root = parent.createChild("ocean-dusk-environment");
    const sunEntity = this.root.createChild("ocean-dusk-sun");
    this._sun = sunEntity.addComponent(DirectLight);
    this._sun.shadowType = ShadowType.SoftHigh;
    this._sun.shadowBias = 0.035;
    this._sun.shadowNormalBias = 0.38;
    scene.sun = this._sun;
    scene.castShadows = true;
    scene.shadowResolution = ShadowResolution.High;
    scene.shadowCascades =
      ShadowCascadesMode.TwoCascades;
    scene.shadowDistance = 96;

    this._skyMaterial = new SkyProceduralMaterial(_engine);
    this._skyMaterial.name = "OceanDuskProceduralSky";
    this._skyMaterial.sunMode = SunMode.HighQuality;
    this._skyMaterial.sunSize = 0.0065;
    this._skyMaterial.sunSizeConvergence = 7;
    this._skyMesh = PrimitiveMesh.createCuboid(_engine, 1, 1, 1);
    this._skyMesh.name = "OceanDuskSkyMesh";
    scene.background.mode = BackgroundMode.Sky;
    scene.background.sky.material = this._skyMaterial;
    scene.background.sky.mesh = this._skyMesh;

    const baseState = createOceanDuskEnvironmentState();
    this._iblTexture = createOceanDuskIblTexture(
      _engine,
      baseState.sunDirection
    );
    this.state = createOceanDuskEnvironmentState(
      this._iblTexture
    );
    this._environmentLighting().applyState(this.state);
  }

  get metrics(): Readonly<OceanDuskEnvironmentMetrics> {
    const scene = this._engine.sceneManager.activeScene;
    return Object.freeze({
      enabled: this._enabled && !this._destroyed,
      stateId: OCEAN_DUSK_STATE_ID,
      directLightCount: 1,
      sceneSunOwned: scene.sun === this._sun,
      proceduralSkyEnabled:
        scene.background.mode === BackgroundMode.Sky &&
        scene.background.sky.material === this._skyMaterial &&
        scene.background.sky.mesh === this._skyMesh,
      proceduralSunDiskEnabled:
        this._skyMaterial.sunMode === SunMode.HighQuality,
      ambientSphericalHarmonicsEnabled:
        scene.ambientLight.diffuseSphericalHarmonics !== undefined,
      iblIntensity: scene.ambientLight.specularIntensity,
      iblTextureBound: scene.ambientLight.specularTexture !== null,
      fogEnabled: scene.fogMode !== FogMode.None,
      fogDensity: scene.fogDensity,
      ambientOcclusionEnabled: scene.ambientOcclusion.enabled,
      sunDirectionX: this.state.sunDirection.x,
      sunDirectionY: this.state.sunDirection.y,
      sunDirectionZ: this.state.sunDirection.z,
      sunGlitterEnabled:
        scene.sun === this._sun &&
        this._skyMaterial.sunMode !== SunMode.None,
      resourceCount: this._destroyed ? 0 : 4,
      resourceBytes: this._destroyed
        ? 0
        : Math.round(
            OCEAN_DUSK_IBL_SIZE *
              OCEAN_DUSK_IBL_SIZE *
              4 *
              6 *
              (4 / 3)
          )
    });
  }

  setEnabled(enabled: boolean): void {
    if (this._destroyed || enabled === this._enabled) return;
    this._enabled = enabled;
    this.root.isActive = enabled;
    const scene = this._engine.sceneManager.activeScene;
    const environmentLighting = this._environmentLighting();
    environmentLighting.enabled = enabled;
    if (enabled) {
      scene.sun = this._sun;
      scene.background.mode = BackgroundMode.Sky;
      environmentLighting.applyState(this.state);
    } else if (scene.sun === this._sun) {
      scene.sun = null;
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._enabled = false;
    const scene = this._engine.sceneManager.activeScene;
    this._environmentLighting().enabled = false;
    if (
      scene.ambientLight.specularTexture === this._iblTexture
    ) {
      scene.ambientLight.specularTexture = null!;
    }
    if (scene.sun === this._sun) scene.sun = null;
    if (scene.background.sky.material === this._skyMaterial) {
      scene.background.sky.material = null!;
    }
    if (scene.background.sky.mesh === this._skyMesh) {
      scene.background.sky.mesh = null!;
    }
    scene.background.mode = BackgroundMode.SolidColor;
    this.root.destroy();
    this._skyMaterial.destroy(true);
    this._skyMesh.destroy(true);
    this._iblTexture.destroy(true);
  }

  private _environmentLighting(): OceanEnvironmentLighting {
    const scene = this._engine.sceneManager.activeScene;
    // The runtime Scene source exposes EnvironmentLighting; this local shape
    // keeps the demo compatible while generated package declarations catch up.
    return (
      scene as typeof scene & {
        readonly environmentLighting: OceanEnvironmentLighting;
      }
    ).environmentLighting;
  }
}
