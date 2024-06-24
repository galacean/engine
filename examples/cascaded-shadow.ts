/**
 * @title Cascaded Stable Shadow
 * @category Light
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*Kw6RSoysvhoAAAAAAAAAAAAADiR2AQ/original
 */

import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  AmbientLight,
  AssetType,
  BaseMaterial,
  Camera,
  Color,
  DirectLight,
  Engine,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderFace,
  Script,
  Shader,
  ShadowCascadesMode,
  ShadowResolution,
  ShadowType,
  Vector3,
  WebGLEngine,
  WebGLMode,
} from "@galacean/engine";

async function main() {
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  createShadowMapVisualShader();

  const scene = engine.sceneManager.activeScene;
  scene.shadowResolution = ShadowResolution.High;
  scene.shadowDistance = 1000;
  scene.shadowCascades = ShadowCascadesMode.FourCascades;

  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 10, 50);
  cameraEntity.transform.lookAt(new Vector3());
  cameraEntity.addComponent(OrbitControl);
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 1000;

  // Create light
  const light = rootEntity.createChild("light");
  light.transform.setPosition(10, 10, 0);
  light.transform.lookAt(new Vector3());
  const rotation = light.addComponent(Rotation);
  const directLight = light.addComponent(DirectLight);
  directLight.shadowStrength = 1.0;
  directLight.shadowType = ShadowType.SoftLow;

  // Create plane
  const planeEntity = rootEntity.createChild("PlaneEntity");
  const planeRenderer = planeEntity.addComponent(MeshRenderer);
  planeRenderer.mesh = PrimitiveMesh.createPlane(engine, 10, 400);

  const planeMaterial = new PBRMaterial(engine);
  planeMaterial.baseColor = new Color(1.0, 0.2, 0, 1.0);
  planeMaterial.roughness = 0.8;
  planeMaterial.metallic = 0.2;
  planeMaterial.renderFace = RenderFace.Double;

  planeRenderer.setMaterial(planeMaterial);

  // Create box
  const boxRenderers = new Array<MeshRenderer>();
  const boxMesh = PrimitiveMesh.createCuboid(engine, 2.0, 2.0, 2.0);
  const boxMaterial = new PBRMaterial(engine);
  boxMaterial.roughness = 0.2;
  boxMaterial.metallic = 1;
  for (let i = 0; i < 40; i++) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(0, 2, i * 10 - 200);

    const boxRenderer = boxEntity.addComponent(MeshRenderer);
    boxRenderer.mesh = boxMesh;
    boxRenderer.setMaterial(boxMaterial);
    boxRenderers.push(boxRenderer);
  }

  const visualMaterial = new CSSMVisualMaterial(engine);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      openDebug();
      engine.run();
    });

  function openDebug(): void {
    const info = {
      rotation: false,
      debugMode: false,
      cascadeMode: ShadowCascadesMode.FourCascades,
      resolution: ShadowResolution.High,
      shadowType: ShadowType.SoftLow,
      shadowTwoCascadeSplitRatio: 1.0 / 3,
      shadowFourCascadeSplitRatioX: 1.0 / 15,
      shadowFourCascadeSplitRatioY: 3.0 / 15.0,
      shadowFourCascadeSplitRatioZ: 7.0 / 15.0,
    };

    const gui = new dat.GUI();
    gui.add(info, "rotation").onChange((v) => {
      rotation.pause = !v;
    });

    gui.add(info, "debugMode").onChange((v) => {
      if (v) {
        planeRenderer.setMaterial(visualMaterial);
        for (let i = 0; i < boxRenderers.length; i++) {
          const boxRenderer = boxRenderers[i];
          boxRenderer.setMaterial(visualMaterial);
        }
      } else {
        planeRenderer.setMaterial(planeMaterial);
        for (let i = 0; i < boxRenderers.length; i++) {
          const boxRenderer = boxRenderers[i];
          boxRenderer.setMaterial(boxMaterial);
        }
      }
    });

    gui.add(directLight, "shadowBias", 0, 10);
    gui.add(directLight, "shadowNormalBias", 0, 10);
    gui.add(directLight, "shadowStrength", 0, 1);
    gui
      .add(info, "shadowType", {
        None: ShadowType.None,
        Hard: ShadowType.Hard,
        SoftLow: ShadowType.SoftLow,
        VerySoft: ShadowType.SoftHigh,
      })
      .onChange((v) => {
        directLight.shadowType = parseInt(v);
      });

    gui
      .add(info, "cascadeMode", {
        NoCascades: ShadowCascadesMode.NoCascades,
        TwoCascades: ShadowCascadesMode.TwoCascades,
        FourCascades: ShadowCascadesMode.FourCascades,
      })
      .onChange((v) => {
        scene.shadowCascades = parseInt(v);
      });

    gui
      .add(info, "resolution", {
        Low: ShadowResolution.Low,
        Medium: ShadowResolution.Medium,
        High: ShadowResolution.High,
        VeryHigh: ShadowResolution.VeryHigh,
      })
      .onChange((v) => {
        scene.shadowResolution = parseInt(v);
      });
    gui.add(info, "shadowTwoCascadeSplitRatio", 0, 1).onChange((v) => {
      scene.shadowTwoCascadeSplits = v;
    });
    gui.add(info, "shadowFourCascadeSplitRatioX", 0, 1).onChange((v) => {
      scene.shadowFourCascadeSplits.x = v;
    });
    gui.add(info, "shadowFourCascadeSplitRatioY", 0, 1).onChange((v) => {
      scene.shadowFourCascadeSplits.y = v;
    });
    gui.add(info, "shadowFourCascadeSplitRatioZ", 0, 1).onChange((v) => {
      scene.shadowFourCascadeSplits.z = v;
    });
  }

  function createShadowMapVisualShader(): void {
    Shader.create(
      "shadow-map-visual",
      `
    #include <common>
    #include <common_vert>
    #include <blendShape_input>
    #include <uv_share>
    #include <color_share>
    #include <normal_share>
    #include <worldpos_share>
    #include <shadow_share>
    
    #include <fog_share>
    #include <shadow_vert_share>
    
    void main() {
    
        #include <begin_position_vert>
        #include <begin_normal_vert>
        #include <blendShape_vert>
        #include <skinning_vert>
        #include <uv_vert>
        #include <color_vert>
        #include <normal_vert>
        #include <worldpos_vert>
        #include <position_vert>
    
        #include <shadow_vert>
    
        #include <fog_vert>
    
    }`,
      `
    #include <common>
    #include <common_frag>
    
    #include <uv_share>
    #include <normal_share>
    #include <color_share>
    #include <worldpos_share>
    
    #include <light_frag_define>
    #include <shadow_frag_share>
    #include <mobile_material_frag>
    
    void main() {
        vec4 emission = material_EmissiveColor;
        vec4 diffuse = material_BaseColor;
        vec4 specular = material_SpecularColor;
        vec4 ambient = vec4(scene_EnvMapLight.diffuse * scene_EnvMapLight.diffuseIntensity, 1.0) * diffuse;
    
    #ifdef SCENE_IS_CALCULATE_SHADOWS
        int cascadeIndex = computeCascadeIndex(v_pos);
        if (cascadeIndex == 0) {
            diffuse = vec4(1.0, 1.0, 1.0, 1.0);
        } else if (cascadeIndex == 1) {
            diffuse = vec4(1.0, 0.0, 0.0, 1.0);
        } else if (cascadeIndex == 2) {
            diffuse = vec4(0.0, 1.0, 0.0, 1.0);
        } else if (cascadeIndex == 3) {
            diffuse = vec4(0.0, 0.0, 1.0, 1.0);
        }
    #endif
    
        gl_FragColor = emission + ambient + diffuse + specular;
        gl_FragColor.a = diffuse.a;
    }
    `
    );
  }
}

class CSSMVisualMaterial extends BaseMaterial {
  constructor(engine: Engine) {
    super(engine, Shader.find("shadow-map-visual"));
    this.shaderData.enableMacro("SCENE_SHADOW_CASCADED_COUNT", "1");
    this.shaderData.enableMacro("MATERIAL_NEED_WORLDPOS");
  }
}

class Rotation extends Script {
  pause = true;
  private _time = 0;
  private _center = new Vector3();

  onUpdate(deltaTime: number) {
    if (!this.pause) {
      this._time += deltaTime / 1000;
      this.entity.transform.setPosition(
        10 * Math.cos(this._time),
        10,
        10 * Math.sin(this._time)
      );
      this.entity.transform.lookAt(this._center);
    }
  }
}

main();
