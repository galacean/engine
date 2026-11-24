import {
  BackgroundMode,
  BloomEffect,
  Camera,
  Color,
  DepthTextureMode,
  DirectLight,
  Material,
  MeshRenderer,
  PostProcess,
  PrimitiveMesh,
  Shader,
  ShadowResolution,
  ShadowType,
  SkyProceduralMaterial,
  TonemappingEffect,
  TonemappingMode,
  Vector3,
  VolumetricLightEffect,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { getOilPaintTextures } from "@galacean/engine-world-planning/spatial/oil-paint/OilPaintTextures";
import { OilPaintPostEffect } from "./OilPaintPostEffect";
import { OilPaintPostPass } from "./OilPaintPostPass";
import { createOilPaintControlPanel } from "./OilPaintControlPanel";

const PLAYGROUND_SHADER_NAME = "OilPaint/PlaygroundSurface";

/**
 * Clean test shader demonstrating how ONE unified `SCENE_OIL_PAINT_STYLE` macro adapts
 * brushstroke scale and direction across 6 distinct surface-area classes without changing geometry:
 *   0 = Terrain floor (world XZ horizontal dabs)
 *   1 = Tree trunk (4:1 vertically stretched bark strips with multi-hue side-by-side color blocks)
 *   2 = Small leaf cards (local UV bristle streaks + per-cluster discrete broken color)
 *   3 = Grass blades (blade-vertical brush flicks + per-tuft color variation)
 *   4 = Boulder rock (isotropic triplanar palette-knife slabs)
 *   5 = Animal curved mesh (object-space triplanar strokes)
 *   6 = Water surface (horizontal Impressionist broken-color ripples)
 */
const PLAYGROUND_SHADER = `Shader "${PLAYGROUND_SHADER_NAME}" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      RasterState = { CullMode = CullMode.Off; }

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Lighting/Light.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      vec3 material_BaseColor;
      // 0: terrain, 1: trunk, 2: leaf card, 3: grass blade, 4: rock, 5: animal, 6: water
      float material_SurfaceMode;

      #ifdef SCENE_OIL_PAINT_STYLE
        sampler2D scene_OilPaintBrushTexture;
        float scene_OilPaintImpasto;
        float scene_OilPaintBrushScale;
      #endif

      struct Varyings {
        vec3 positionWS;
        vec3 positionOS;
        vec3 normalWS;
        vec3 normalOS;
        vec2 uv;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings v;
        vec4 worldPos = renderer_ModelMat * vec4(attr.POSITION, 1.0);
        v.positionWS = worldPos.xyz;
        v.positionOS = attr.POSITION;
        v.normalWS = normalize(mat3(renderer_NormalMat) * attr.NORMAL);
        v.normalOS = normalize(attr.NORMAL);
        v.uv = attr.TEXCOORD_0;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        return v;
      }

      float pgHash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      vec4 frag(Varyings v) {
        vec3 N = normalize(v.normalWS) * (float(gl_FrontFacing) * 2.0 - 1.0);
        vec3 V = normalize(camera_Position - v.positionWS);
        vec3 sunDir = normalize(vec3(0.18, 0.34, -0.92));
        vec3 sunColor = vec3(1.08, 0.94, 0.72);
        #ifdef SCENE_DIRECT_LIGHT_COUNT
          sunDir = normalize(-scene_DirectLightDirection[0]);
          sunColor = scene_DirectLightColor[0];
        #endif

        float shadow = 1.0;
        #ifdef NEED_CALCULATE_SHADOWS
          shadow = sampleShadowMap(v.positionWS, (scene_ShadowMatrices[0] * vec4(v.positionWS + N * 0.04, 1.0)).xyz);
        #endif

        float ndl = dot(N, sunDir);
        vec3 albedo = material_BaseColor;

        #ifndef SCENE_OIL_PAINT_STYLE
          // Standard smooth lit look for clean A/B comparison.
          float diff = max(ndl, 0.0) * shadow;
          vec3 ambient = mix(vec3(0.24, 0.20, 0.28), vec3(0.46, 0.42, 0.38), N.y * 0.5 + 0.5);
          vec3 standardCol = albedo * (ambient + sunColor * diff * 0.95);
          if (material_SurfaceMode > 5.5) {
            float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            standardCol = mix(standardCol, vec3(0.88, 0.80, 0.60), fres * 0.65);
          }
          return vec4(max(standardCol, vec3(0.0)), 1.0);
        #else
          float scale = max(scene_OilPaintBrushScale, 0.05);
          float mode = material_SurfaceMode;
          vec4 brush = vec4(0.5);
          float extraColor = 0.5;

          if (mode < 0.5) {
            // 0: Terrain floor -> broad horizontal dabs
            brush = texture2D(scene_OilPaintBrushTexture, v.positionWS.xz * (0.34 * scale));
            extraColor = brush.a;
          } else if (mode < 1.5) {
            // 1: Vertical tree trunk -> 4:1 vertical bark strips + multi-hue blocks
            vec3 w = pow(abs(N), vec3(6.0));
            w /= max(w.x + w.y + w.z, 1e-4);
            vec2 sv = vec2(0.85 * scale, 0.16 * scale);
            brush = texture2D(scene_OilPaintBrushTexture, v.positionWS.zy * sv) * w.x
                  + texture2D(scene_OilPaintBrushTexture, v.positionWS.xz * (0.35 * scale)) * w.y
                  + texture2D(scene_OilPaintBrushTexture, v.positionWS.xy * sv) * w.z;
            extraColor = pgHash31(floor(vec3(v.positionWS.x * 3.8, v.positionWS.y * 0.55, v.positionWS.z * 3.8)));
            vec3 barkPlum = albedo * vec3(0.68, 0.50, 0.96);
            vec3 barkSlate = albedo * vec3(0.76, 0.94, 1.28);
            vec3 barkOlive = albedo * vec3(1.06, 1.14, 0.62);
            vec3 barkGold = albedo * vec3(1.42, 1.18, 0.70);
            float p = mix(brush.a, extraColor, 0.65);
            vec3 strip = p < 0.33
              ? mix(barkPlum, barkSlate, p * 3.0)
              : (p < 0.68 ? mix(barkSlate, barkOlive, (p - 0.33) * 2.85) : mix(barkOlive, barkGold, (p - 0.68) * 3.12));
            albedo = mix(albedo, strip, 0.78);
          } else if (mode < 2.5) {
            // 2: Small leaf cards -> local UV bristles + per-card cluster color
            brush = texture2D(scene_OilPaintBrushTexture, v.uv * (1.25 + 0.35 * scale));
            extraColor = pgHash31(floor(v.positionWS * 1.4));
            vec3 coolL = albedo * vec3(0.70, 0.96, 0.74);
            vec3 warmL = albedo * vec3(1.30, 1.10, 0.58);
            vec3 redL = albedo * vec3(1.40, 0.68, 0.48);
            albedo = mix(albedo, extraColor < 0.5 ? mix(coolL, warmL, extraColor * 2.0) : mix(warmL, redL, (extraColor - 0.5) * 2.0), 0.70);
          } else if (mode < 3.5) {
            // 3: Grass blades -> upward brush flicks + per-tuft contrast
            brush = texture2D(scene_OilPaintBrushTexture, v.uv * vec2(1.4, 0.85) * scale);
            extraColor = pgHash31(floor(vec3(v.positionWS.x * 2.2, 0.0, v.positionWS.z * 2.2)));
            vec3 coolG = albedo * vec3(0.60, 0.86, 0.74);
            vec3 warmG = albedo * vec3(1.36, 1.06, 0.52);
            albedo = mix(albedo, mix(coolG, warmG, extraColor), 0.68);
          } else if (mode < 4.5) {
            // 4: Rock boulders -> isotropic world-space palette-knife slabs
            vec3 w = pow(abs(N), vec3(6.0));
            w /= max(w.x + w.y + w.z, 1e-4);
            float sr = 0.38 * scale;
            brush = texture2D(scene_OilPaintBrushTexture, v.positionWS.zy * sr) * w.x
                  + texture2D(scene_OilPaintBrushTexture, v.positionWS.xz * sr) * w.y
                  + texture2D(scene_OilPaintBrushTexture, v.positionWS.xy * sr) * w.z;
            extraColor = brush.a;
          } else if (mode < 5.5) {
            // 5: Animal curved surface -> object-space triplanar strokes (cling to animated limbs)
            vec3 w = pow(abs(v.normalOS), vec3(6.0));
            w /= max(w.x + w.y + w.z, 1e-4);
            float sa = 0.75 * scale;
            brush = texture2D(scene_OilPaintBrushTexture, v.positionOS.zy * sa) * w.x
                  + texture2D(scene_OilPaintBrushTexture, v.positionOS.xz * sa) * w.y
                  + texture2D(scene_OilPaintBrushTexture, v.positionOS.xy * sa) * w.z;
            extraColor = brush.a;
          } else {
            // 6: Water -> horizontal Impressionist broken-color strokes
            vec2 wuv = v.positionWS.xz * vec2(0.28 * scale, 1.15 * scale);
            brush = texture2D(scene_OilPaintBrushTexture, wuv);
            extraColor = brush.a;
            float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
            albedo = mix(albedo, vec3(0.95, 0.82, 0.48), fres * 0.55);
          }

          float height = brush.r;
          float gx = brush.g * 2.0 - 1.0;
          float gy = brush.b * 2.0 - 1.0;
          float pigment = mix(brush.a, extraColor, 0.55);
          float rake = 0.58 * gx - 0.80 * gy;

          float backlit = pow(max(dot(-V, sunDir), 0.0), 1.9);
          float lit = clamp(shadow * (ndl * 0.80 + 0.34 + backlit * 0.38), 0.0, 1.0);
          float bandX = lit + (pigment - 0.5) * 0.44 + (height - 0.5) * 0.16;

          vec3 colLight = albedo * vec3(1.36, 1.16, 0.78) + vec3(0.03, 0.02, 0.0);
          vec3 colMid = albedo * 0.92;
          vec3 colShade = albedo * vec3(0.44, 0.38, 0.72) + vec3(0.025, 0.018, 0.052);
          vec3 painted = mix(colShade, colMid, smoothstep(0.22, 0.34, bandX));
          painted = mix(painted, colLight, smoothstep(0.52, 0.66, bandX));

          vec3 coolDab = painted * vec3(0.82, 0.90, 1.20);
          vec3 warmDab = painted * vec3(1.22, 1.07, 0.82);
          painted = mix(coolDab, warmDab, smoothstep(0.26, 0.74, pigment));

          painted += (albedo * 0.65 + vec3(0.05)) * vec3(0.95, 0.52, 0.16) * max(-N.y * 0.5 + 0.5, 0.0) * (1.0 - lit) * 0.42;
          painted = mix(painted, painted * vec3(0.80, 0.88, 1.24), (1.0 - lit) * max(N.y, 0.0) * 0.36);

          float lightLevel = mix(0.48, 1.16, smoothstep(0.20, 0.66, bandX));
          vec3 sunTint = mix(vec3(0.86, 0.84, 1.06), sunColor * 0.92, smoothstep(0.22, 0.66, bandX));
          painted *= lightLevel * sunTint;
          if (mode > 1.5 && mode < 3.5) {
            painted += albedo * vec3(1.0, 0.88, 0.48) * backlit * shadow * 0.42;
          }

          float impasto = max(scene_OilPaintImpasto, 0.0);
          painted *= mix(0.84, 1.16, height);
          painted *= max(0.35, 1.0 + rake * 0.92 * impasto);
          painted += vec3(1.0, 0.95, 0.84) * pow(max(rake, 0.0), 1.8) * 0.46 * impasto;

          return vec4(max(painted, vec3(0.0)), 1.0);
        #endif
      }
    }

    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }
      RasterState = { CullMode = CullMode.Off; }

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"

      VertexShader = depthVert;
      FragmentShader = depthFrag;

      void depthVert(Attributes attr) {
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
      }

      void depthFrag() {
      }
    }
  }
}`;

function srgbToLinearVec3(hex: string): Vector3 {
  const n = Number.parseInt(hex.slice(1), 16);
  const conv = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return new Vector3(conv(((n >> 16) & 255) / 255), conv(((n >> 8) & 255) / 255), conv((n & 255) / 255));
}

async function bootPlayground(): Promise<void> {
  const canvas = document.getElementById("playground-canvas") as HTMLCanvasElement;
  const shaderCompiler = new ShaderCompiler();
  const engine = await WebGLEngine.create({
    canvas,
    shaderCompiler
  });
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    engine.canvas.setResolution(
      Math.max(1, Math.round(canvas.clientWidth * dpr)),
      Math.max(1, Math.round(canvas.clientHeight * dpr))
    );
  };
  resize();

  const scene = engine.sceneManager.activeScene!;
  const root = scene.createRootEntity("PlaygroundRoot");

  // Sun light positioned behind the trees (-Z, +Y) shining downward & forward (+Z, -Y) toward the camera.
  const sunEntity = root.createChild("SunLight");
  sunEntity.transform.setRotation(-14, 174, 0);
  const sunLight = sunEntity.addComponent(DirectLight);
  sunLight.color = new Color(1.85, 1.62, 1.18, 1.0);
  sunLight.shadowType = ShadowType.SoftLow;
  sunLight.shadowStrength = 0.82;
  scene.sun = sunLight;
  scene.castShadows = true;
  scene.shadowResolution = ShadowResolution.High;
  scene.shadowDistance = 60;

  // Procedural sky synchronized to sunLight.direction (propagation vector pointing from sun toward ground).
  scene.background.mode = BackgroundMode.Sky;
  const skyMat = new SkyProceduralMaterial(engine);
  skyMat.sunDirection = sunLight.direction.clone().normalize();
  skyMat.sunSize = 0.065;
  skyMat.sunSizeConvergence = 4;
  skyMat.atmosphereThickness = 0.92;
  skyMat.customSkyTintStrength = 1;
  skyMat.customSkyZenithTint.set(0.76, 0.88, 1.05, 1);
  skyMat.customSkyHorizonTint.set(1.42, 1.24, 0.86, 1);
  skyMat.groundTint.set(0.45, 0.32, 0.18, 1);
  skyMat.exposure = 1.25;
  scene.background.sky.material = skyMat;
  scene.background.sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  // Camera + OrbitControl
  const camEntity = root.createChild("Camera");
  camEntity.transform.setPosition(0, 3.2, 11.5);
  const camera = camEntity.addComponent(Camera);
  camera.fieldOfView = 50;
  camera.farClipPlane = 240;
  camera.enableHDR = true;
  camera.enablePostProcess = true;
  camera.depthTextureMode = DepthTextureMode.PrePass;
  (camera as { _enableForwardDepthResolve?: boolean })._enableForwardDepthResolve = true;
  const orbit = camEntity.addComponent(OrbitControl);
  orbit.target.set(0, 2.2, -2);

  // Canonical Galacean PostProcess stack: Uber (Tonemap + Bloom + VolumetricLight) -> OilPaintPostPass
  const postEntity = root.createChild("GlobalPostProcess");
  const postProcess = postEntity.addComponent(PostProcess);
  postProcess.isGlobal = true;
  const tonemap = postProcess.addEffect(TonemappingEffect)!;
  tonemap.mode.value = TonemappingMode.ACES;
  const bloom = postProcess.addEffect(BloomEffect)!;
  bloom.threshold.value = 1.15;
  bloom.intensity.value = 0.25;

  const volumetricLightEffect = postProcess.addEffect(VolumetricLightEffect)!;
  const oilPaintEffect = postProcess.addEffect(OilPaintPostEffect)!;

  const oilPaintPass = new OilPaintPostPass(engine);
  engine.addPostProcessPass(oilPaintPass);

  // Bind unified scene-wide Oil Paint shader macro + seamless impasto texture.
  const { brush } = getOilPaintTextures(engine);
  let macroEnabled = true;
  const setMacro = (enabled: boolean) => {
    macroEnabled = enabled;
    if (enabled) {
      scene.shaderData.enableMacro("SCENE_OIL_PAINT_STYLE");
      scene.shaderData.setTexture("scene_OilPaintBrushTexture", brush);
      scene.shaderData.setFloat("scene_OilPaintImpasto", oilPaintEffect.impasto.value);
      scene.shaderData.setFloat("scene_OilPaintBrushScale", oilPaintEffect.brushScale.value);
    } else {
      scene.shaderData.disableMacro("SCENE_OIL_PAINT_STYLE");
    }
  };
  setMacro(true);

  const surfaceShader = Shader.find(PLAYGROUND_SHADER_NAME) ?? Shader.create(PLAYGROUND_SHADER);
  const makeMat = (hex: string, surfaceMode: number) => {
    const mat = new Material(engine, surfaceShader);
    mat.shaderData.setVector3("material_BaseColor", srgbToLinearVec3(hex));
    mat.shaderData.setFloat("material_SurfaceMode", surfaceMode);
    return mat;
  };

  // 0. Terrain ground plane
  const ground = root.createChild("TerrainGround");
  const groundMr = ground.addComponent(MeshRenderer);
  groundMr.mesh = PrimitiveMesh.createPlane(engine, 70, 70);
  groundMr.setMaterial(makeMat("#9a5c2c", 0));

  // 6. Calm lake pond in midground
  const pond = root.createChild("WaterPond");
  pond.transform.setPosition(0, 0.04, 1.5);
  const pondMr = pond.addComponent(MeshRenderer);
  pondMr.mesh = PrimitiveMesh.createCylinder(engine, 4.4, 0.04);
  pondMr.setMaterial(makeMat("#376b7e", 6));

  // 1 & 2. Trees: vertical bark trunks + small leaf cards encircling the sun (casts dappled shadows + volumetric gaps!)
  const trunkMat = makeMat("#5f443c", 1);
  const leafMats = [
    makeMat("#f0bc38", 2),
    makeMat("#e46e28", 2),
    makeMat("#c93d26", 2),
    makeMat("#a4a836", 2)
  ];
  const trunkMesh = PrimitiveMesh.createCylinder(engine, 0.48, 11.5);
  const leafCardMesh = PrimitiveMesh.createPlane(engine, 0.95, 0.65);

  const treeCoords: Array<[number, number, number]> = [
    [-4.8, -5.2, 1.15],
    [-1.4, -7.2, 1.05],
    [2.1, -6.8, 1.12],
    [5.2, -4.6, 1.2],
    [-7.8, -2.5, 0.95],
    [7.6, -1.8, 1.0],
    [-3.2, -12.5, 1.25],
    [0.6, -13.5, 1.18],
    [4.6, -11.5, 1.22]
  ];

  let rng = 1337;
  const nextRand = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);

  for (let t = 0; t < treeCoords.length; t++) {
    const [tx, tz, sc] = treeCoords[t];
    const trunk = root.createChild(`TreeTrunk_${t}`);
    trunk.transform.setPosition(tx, 5.5 * sc, tz);
    trunk.transform.setScale(sc, sc, sc);
    const mr = trunk.addComponent(MeshRenderer);
    mr.mesh = trunkMesh;
    mr.setMaterial(trunkMat);

    // Attach 26 small leaf cards clustered around upper branches
    for (let l = 0; l < 26; l++) {
      const ang = nextRand() * Math.PI * 2;
      const rad = 0.6 + nextRand() * 2.5 * sc;
      const ly = (4.6 + nextRand() * 4.4) * sc;
      const card = root.createChild(`Leaf_${t}_${l}`);
      card.transform.setPosition(tx + Math.cos(ang) * rad, ly, tz + Math.sin(ang) * rad);
      card.transform.setRotation(
        (nextRand() - 0.5) * 140,
        nextRand() * 360,
        (nextRand() - 0.5) * 120
      );
      const lScale = 0.7 + nextRand() * 0.7;
      card.transform.setScale(lScale, lScale, lScale);
      const lmr = card.addComponent(MeshRenderer);
      lmr.mesh = leafCardMesh;
      lmr.setMaterial(leafMats[Math.floor(nextRand() * leafMats.length)]);
    }
  }

  // 3. Foreground grass blades (narrow quads showing adaptation to tiny blades)
  const grassBladeMesh = PrimitiveMesh.createPlane(engine, 0.22, 0.92);
  const grassMat = makeMat("#c88e2e", 3);
  for (let g = 0; g < 90; g++) {
    const gx = (nextRand() - 0.5) * 13.5;
    const gz = 3.8 + nextRand() * 4.8;
    const blade = root.createChild(`Grass_${g}`);
    const h = 0.65 + nextRand() * 0.7;
    blade.transform.setPosition(gx, 0.42 * h, gz);
    blade.transform.setRotation(78 + (nextRand() - 0.5) * 24, nextRand() * 360, (nextRand() - 0.5) * 16);
    blade.transform.setScale(0.9 + nextRand() * 0.6, h, 1);
    const gmr = blade.addComponent(MeshRenderer);
    gmr.mesh = grassBladeMesh;
    gmr.setMaterial(grassMat);
  }

  // 4. Rocks along pond banks
  const rockMat = makeMat("#8a7463", 4);
  const rockMesh = PrimitiveMesh.createSphere(engine, 1.0, { subdivisionLevel: 3 });
  const rocks: Array<[number, number, number, number, number]> = [
    [-4.3, 2.2, 1.5, 0.9, 1.2],
    [-5.4, 0.6, 1.1, 0.7, 0.9],
    [4.6, 1.8, 1.7, 1.0, 1.3],
    [3.8, 3.3, 0.95, 0.6, 0.85]
  ];
  for (let r = 0; r < rocks.length; r++) {
    const [rx, rz, sx, sy, sz] = rocks[r];
    const rock = root.createChild(`Rock_${r}`);
    rock.transform.setPosition(rx, sy * 0.45, rz);
    rock.transform.setScale(sx, sy, sz);
    rock.transform.setRotation(8 * r, 35 * r, -6 * r);
    const rmr = rock.addComponent(MeshRenderer);
    rmr.mesh = rockMesh;
    rmr.setMaterial(rockMat);
  }

  // 5. Stylized curved animal silhouette (deer-like abstract bust/body on right shore)
  const animalMat = makeMat("#c8763e", 5);
  const animalGroup = root.createChild("StylizedAnimal");
  animalGroup.transform.setPosition(2.6, 0, 5.2);
  animalGroup.transform.setRotation(0, -35, 0);
  const body = animalGroup.createChild("Body");
  body.transform.setPosition(0, 1.05, 0);
  body.transform.setScale(0.65, 0.58, 1.15);
  body.addComponent(MeshRenderer).mesh = PrimitiveMesh.createSphere(engine, 1, { subdivisionLevel: 3 });
  body.getComponent(MeshRenderer)!.setMaterial(animalMat);
  const neck = animalGroup.createChild("Neck");
  neck.transform.setPosition(0, 1.75, 0.72);
  neck.transform.setRotation(22, 0, 0);
  neck.addComponent(MeshRenderer).mesh = PrimitiveMesh.createCylinder(engine, 0.26, 1.25);
  neck.getComponent(MeshRenderer)!.setMaterial(animalMat);
  const head = animalGroup.createChild("Head");
  head.transform.setPosition(0, 2.38, 1.02);
  head.transform.setScale(0.30, 0.26, 0.44);
  head.addComponent(MeshRenderer).mesh = PrimitiveMesh.createSphere(engine, 1, { subdivisionLevel: 3 });
  head.getComponent(MeshRenderer)!.setMaterial(animalMat);

  // Mount live tuning & A/B compare panel (expanded by default in playground)
  const panel = createOilPaintControlPanel(document.body, {
    oilPaintEffect,
    oilPaintPass,
    volumetricLightEffect,
    scene,
    getShaderMacroEnabled: () => macroEnabled,
    setShaderMacroEnabled: setMacro,
    initiallyExpanded: true
  });
  panel.setVisible(true);

  window.addEventListener("resize", resize);
  engine.run();
  canvas.dataset.status = "ready";
}

bootPlayground().catch((err) => {
  console.error("[oil-paint-playground] boot failed", err);
});
