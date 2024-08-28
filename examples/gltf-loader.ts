/**
 * @title GLTF Loader
 * @category Advance
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*omVHSr3cHpIAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AmbientLight,
  AnimationClip,
  Animator,
  AssetType,
  BackgroundMode,
  BoundingBox,
  Camera,
  Color,
  DirectLight,
  Entity,
  GLTFResource,
  Logger,
  Material,
  MeshRenderer,
  PBRBaseMaterial,
  PBRMaterial,
  PBRSpecularMaterial,
  PrimitiveMesh,
  Renderer,
  Scene,
  SkyBoxMaterial,
  Texture2D,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

Logger.enable();

const envList = {
  sunset: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
  pisa: "https://gw.alipayobjects.com/os/bmw-prod/6470ea5e-094b-4a77-a05f-4945bf81e318.bin",
  foot_2K: "https://gw.alipayobjects.com/os/bmw-prod/23c1893a-fe29-4e91-bd6a-bb1c4201a876.bin"
};

class Oasis {
  static guiToColor(gui: number[], color: Color) {
    color.set(gui[0] / 255, gui[1] / 255, gui[2] / 255, color.a);
  }

  static colorToGui(color: Color = new Color(1, 1, 1)): number[] {
    const v: number[] = [];
    v[0] = color.r * 255;
    v[1] = color.g * 255;
    v[2] = color.b * 255;
    return v;
  }

  textures: Record<string, Texture2D> = {};
  env: Record<string, AmbientLight> = {};

  engine: WebGLEngine;
  scene: Scene;
  skyMaterial: SkyBoxMaterial;

  // Entity
  rootEntity: Entity;
  cameraEntity: Entity;
  gltfRootEntity: Entity;
  lightEntity1: Entity;
  lightEntity2: Entity;

  // Component
  camera: Camera;
  controler: OrbitControl;
  light1: DirectLight;
  light2: DirectLight;

  // Debug
  gui = new dat.GUI();
  materialFolder = null;
  animationFolder = null;
  state = {
    // Scene
    background: false,
    // Lights
    env: "sunset",
    envIntensity: 1,
    addLights: true,
    lightColor: Oasis.colorToGui(new Color(1, 1, 1)),
    lightIntensity: 0.8,
    // GLTF Model List
    defaultGLTF: "fox",
    gltfList: {
      "2CylinderEngine": "https://gw.alipayobjects.com/os/bmw-prod/48a1e8b3-06b4-4269-807d-79274e58283a.glb",
      alphaBlendModeTest: "https://gw.alipayobjects.com/os/bmw-prod/d099b30b-59a3-42e4-99eb-b158afa8e65d.glb",
      animatedCube: "https://gw.alipayobjects.com/os/bmw-prod/8cc524dd-2481-438d-8374-3c933adea3b6.gltf",
      antiqueCamera: "https://gw.alipayobjects.com/os/bmw-prod/93196534-bab3-4559-ae9f-bcb3e36a6419.glb",
      avocado: "https://gw.alipayobjects.com/os/bmw-prod/0f978c4d-1cd6-4cec-9a4c-b58c8186e063.glb",
      avocado_draco: "https://gw.alipayobjects.com/os/bmw-prod/b3b73614-cf06-4f41-940d-c1bc04cf6410.gltf",
      avocado_specular: "https://gw.alipayobjects.com/os/bmw-prod/3cf50452-0015-461e-a172-7ea1f8135e53.gltf",
      avocado_quantized: "https://gw.alipayobjects.com/os/bmw-prod/6aff5409-8e82-4e77-a6ac-55b6adfd0cf5.gltf",
      barramundiFish: "https://gw.alipayobjects.com/os/bmw-prod/79d7935c-404b-4d8d-9ad3-5f8c273f0e4a.glb",
      boomBox: "https://gw.alipayobjects.com/os/bmw-prod/2e98b1c0-18e8-45d0-b54e-dcad6ef05e22.glb",
      boomBoxWithAxes: "https://gw.alipayobjects.com/os/bmw-prod/96e1b8b2-9be6-4b64-98ea-8c008c6dc422.gltf",
      boxVertexColors: "https://gw.alipayobjects.com/os/bmw-prod/6cff6fcb-5191-465e-9a38-dee42a07cc65.glb",
      brianStem: "https://gw.alipayobjects.com/os/bmw-prod/e3b37dd9-9407-4b5c-91b3-c5880d081329.glb",
      buggy: "https://gw.alipayobjects.com/os/bmw-prod/d6916a14-b004-42d5-86dd-d8520b719288.glb",
      cesiumMan: "https://gw.alipayobjects.com/os/bmw-prod/3a7d9597-7354-4bef-b314-b84509bef9b6.glb",
      cesiumMilkTruck: "https://gw.alipayobjects.com/os/bmw-prod/7701125a-7d0d-4281-a7d8-7f0dfc8d0792.glb",
      corset: "https://gw.alipayobjects.com/os/bmw-prod/3deaa5a4-5b2a-4a0d-8512-a8c4377a08ff.glb",
      DamagedHelmet: "https://gw.alipayobjects.com/os/bmw-prod/a1da72a4-023e-4bb1-9629-0f4b0f6b6fc4.glb",
      Duck: "https://gw.alipayobjects.com/os/bmw-prod/6cb8f543-285c-491a-8cfd-57a1160dc9ab.glb",
      environmentTest: "https://gw.alipayobjects.com/os/bmw-prod/7c7b887c-05d6-43dd-b354-216e738e81ed.gltf",
      flightHelmet: "https://gw.alipayobjects.com/os/bmw-prod/d6dbf161-48e2-4e6d-bbca-c481ed9f1a2d.gltf",
      fox: "https://gw.alipayobjects.com/os/bmw-prod/f40ef8dd-4c94-41d4-8fac-c1d2301b6e47.glb",
      animationInterpolationTest: "https://gw.alipayobjects.com/os/bmw-prod/4f410ef2-20b4-494d-85f1-a806c5070bfb.glb",
      lantern: "https://gw.alipayobjects.com/os/bmw-prod/9557420a-c622-4e9c-bb46-f7af8b19d7de.glb",
      materialsVariantsShoe: "https://gw.alipayobjects.com/os/bmw-prod/b1a414bb-61ea-4667-94d2-ef6cf179ac0d.glb",
      metalRoughSpheres: "https://gw.alipayobjects.com/os/bmw-prod/67b39ede-1c82-4321-8457-0ad83ca9413a.glb",
      normalTangentTest: "https://gw.alipayobjects.com/os/bmw-prod/4bb1a66c-55e3-4898-97d7-a9cc0f239686.glb",
      normalTangentMirrorTest: "https://gw.alipayobjects.com/os/bmw-prod/8335f555-2061-47f5-9252-366c6ebf882a.glb",
      orientationTest: "https://gw.alipayobjects.com/os/bmw-prod/16cdf390-ac42-411c-9d2b-8e112dfd723b.glb",
      sparseTest: "https://gw.alipayobjects.com/os/bmw-prod/f00de659-53ea-49d1-8f2c-d0a412542b80.gltf",
      specGlossVsMetalRough: "https://gw.alipayobjects.com/os/bmw-prod/4643bd7b-f988-4144-8245-4a390023d92d.glb",
      sponza: "https://gw.alipayobjects.com/os/bmw-prod/ca50859b-d736-4a3e-9fc3-241b0bd2afef.gltf",
      suzanne: "https://gw.alipayobjects.com/os/bmw-prod/3869e495-2e04-4e80-9d22-13b37116379a.gltf",
      sheenChair: "https://gw.alipayobjects.com/os/bmw-prod/34847225-bc1b-4bef-9cb9-6b9711ca2f8c.glb",
      sheenCloth: "https://gw.alipayobjects.com/os/bmw-prod/4529d2e8-22a8-47af-9b38-8eaff835f6bf.gltf",
      textureCoordinateTest: "https://gw.alipayobjects.com/os/bmw-prod/5fd23201-51dd-4eea-92d3-c4a72ecc1f2b.glb",
      textureEncodingTest: "https://gw.alipayobjects.com/os/bmw-prod/b8795e57-3c2c-4412-b4f0-7ffa796e4917.glb",
      textureSettingTest: "https://gw.alipayobjects.com/os/bmw-prod/a4b26d58-bd49-4051-8f05-0fe8b532e716.glb",
      textureTransformMultiTest: "https://gw.alipayobjects.com/os/bmw-prod/8fa18786-5188-4c14-94d7-77bf6b8483f9.glb",
      textureTransform: "https://gw.alipayobjects.com/os/bmw-prod/6c59d5d0-2e2e-4933-a737-006d431977fd.gltf",
      toyCar: "https://gw.alipayobjects.com/os/bmw-prod/8138b7d7-45aa-494a-8aea-0c67598b96d2.glb",
      transmissionTest: "https://gw.alipayobjects.com/os/bmw-prod/1dd51fe8-bdd3-42e4-99be-53de5dc106b8.glb",
      unlitTest: "https://gw.alipayobjects.com/os/bmw-prod/06a855be-ac8c-4705-b5d7-659b8b391189.glb",
      vc: "https://gw.alipayobjects.com/os/bmw-prod/b71c4212-25fb-41bb-af88-d79ce6d3cc58.glb",
      vertexColorTest: "https://gw.alipayobjects.com/os/bmw-prod/8fc70cc6-66d8-43c8-b460-f7d2aaa9edcf.glb",
      waterBottle: "https://gw.alipayobjects.com/os/bmw-prod/0f403530-96f5-455a-8a39-b31ac68b6ed5.glb"
    }
  };
  _materials: Material[] = [];

  // temporary
  _boundingBox: BoundingBox = new BoundingBox();
  _center: Vector3 = new Vector3();
  _extent: Vector3 = new Vector3();

  constructor() {
    WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
      this.engine = engine;
      this.scene = this.engine.sceneManager.activeScene;
      this.skyMaterial = new SkyBoxMaterial(this.engine);
      this.rootEntity = this.scene.createRootEntity("root");
      this.cameraEntity = this.rootEntity.createChild("camera");
      this.gltfRootEntity = this.rootEntity.createChild("gltf");
      this.lightEntity1 = this.rootEntity.createChild("direct_light1");
      this.lightEntity2 = this.rootEntity.createChild("direct_light2");
      this.camera = this.cameraEntity.addComponent(Camera);
      this.controler = this.cameraEntity.addComponent(OrbitControl);
      this.light1 = this.lightEntity1.addComponent(DirectLight);
      this.light2 = this.lightEntity2.addComponent(DirectLight);

      this.loadEnv(this.state.env).then(() => {
        this.initScene();
        this.addGLTFList();
        this.addSceneGUI();
      });
    });
  }

  loadEnv(envName: string) {
    return new Promise((resolve) => {
      this.engine.resourceManager
        .load<AmbientLight>({
          type: AssetType.Env,
          url: envList[envName]
        })
        .then((env) => {
          this.env[envName] = env;

          this.scene.ambientLight = env;
          this.skyMaterial.texture = env.specularTexture;
          this.skyMaterial.textureDecodeRGBM = true;
          resolve(true);
        });
    });
  }

  initScene() {
    this.engine.canvas.resizeByClientSize();
    this.controler.minDistance = 0;

    // debug sync
    if (this.state.background) {
      this.scene.background.mode = BackgroundMode.Sky;
    }
    if (!this.state.addLights) {
      this.light1.enabled = this.light2.enabled = false;
    }
    this.light1.intensity = this.light2.intensity = this.state.lightIntensity;
    this.lightEntity1.transform.setRotation(30, 0, 0);
    this.lightEntity2.transform.setRotation(-30, 180, 0);
    this.scene.ambientLight.specularIntensity = this.state.envIntensity;
    this.scene.background.sky.material = this.skyMaterial;
    this.scene.background.sky.mesh = PrimitiveMesh.createCuboid(this.engine, 1, 1, 1);
    this.engine.run();
  }

  addGLTFList() {
    this.loadGLTF(this.state.gltfList[this.state.defaultGLTF]);
    this.gui
      .add(this.state, "defaultGLTF", Object.keys(this.state.gltfList))
      .name("GLTF List")
      .onChange((v) => {
        this.loadGLTF(this.state.gltfList[v]);
      });
  }

  addSceneGUI() {
    const { gui } = this;
    // Display controls.
    const dispFolder = gui.addFolder("Scene");
    dispFolder.add(this.state, "background").onChange((v: boolean) => {
      if (v) {
        this.scene.background.mode = BackgroundMode.Sky;
      } else {
        this.scene.background.mode = BackgroundMode.SolidColor;
      }
    });

    // Lighting controls.
    const lightFolder = gui.addFolder("Lighting");
    lightFolder
      .add(this.state, "env", [...Object.keys(envList)])
      .name("IBL")
      .onChange((v) => {
        this.loadEnv(v);
      });

    lightFolder
      .add(this.state, "addLights")
      .onChange((v) => {
        this.light1.enabled = this.light2.enabled = v;
      })
      .name("直接光");
    lightFolder.addColor(this.state, "lightColor").onChange((v) => {
      Oasis.guiToColor(v, this.light1.color);
      Oasis.guiToColor(v, this.light2.color);
    });
    lightFolder
      .add(this.state, "lightIntensity", 0, 2)
      .onChange((v) => {
        this.light1.intensity = this.light2.intensity = v;
      })
      .name("直接光强度");
  }

  setCenter(renderers: Renderer[]) {
    const boundingBox = this._boundingBox;
    const center = this._center;
    const extent = this._extent;

    boundingBox.min.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    boundingBox.max.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    renderers.forEach((renderer) => {
      BoundingBox.merge(renderer.bounds, boundingBox, boundingBox);
    });
    boundingBox.getExtent(extent);
    const size = extent.length();

    boundingBox.getCenter(center);
    this.controler.target.set(center.x, center.y, center.z);
    this.cameraEntity.transform.setPosition(center.x, center.y, size * 3);

    this.camera.farClipPlane = size * 12;

    if (this.camera.nearClipPlane > size) {
      this.camera.nearClipPlane = size / 10;
    } else {
      this.camera.nearClipPlane = 0.1;
    }

    this.controler.maxDistance = size * 10;
  }

  loadGLTF(url: string) {
    this.destroyGLTF();
    this.engine.resourceManager
      .load<GLTFResource>({
        type: AssetType.GLTF,
        url
      })
      .then((asset) => {
        const { materials, animations } = asset;
        const defaultSceneRoot = asset.instantiateSceneRoot();
        this.gltfRootEntity = defaultSceneRoot;
        this.rootEntity.addChild(defaultSceneRoot);

        const meshRenderers = [];
        defaultSceneRoot.getComponentsIncludeChildren(MeshRenderer, meshRenderers);

        this.setCenter(meshRenderers);
        this.loadMaterialGUI(materials);
        this.loadAnimationGUI(animations as AnimationClip[]);
      })
      .catch((e) => {
        console.error(e);
      });
  }

  destroyGLTF() {
    this.gltfRootEntity.destroy();
  }

  loadMaterialGUI(materials?: Material[]) {
    const { gui } = this;
    if (this.materialFolder) {
      gui.removeFolder(this.materialFolder);
      this.materialFolder = null;
    }
    if (!materials) {
      materials = this._materials;
    }
    this._materials = materials;
    if (!materials.length) return;

    const folder = (this.materialFolder = gui.addFolder("Material"));
    const folderName = {};

    materials.forEach((material) => {
      if (!(material instanceof PBRBaseMaterial) && !(material instanceof UnlitMaterial)) return;
      if (!material.name) {
        material.name = "default";
      }
      const state = {
        opacity: material.baseColor.a,
        baseColor: Oasis.colorToGui(material.baseColor),
        emissiveColor: Oasis.colorToGui((material as PBRBaseMaterial).emissiveColor),
        specularColor: Oasis.colorToGui((material as PBRSpecularMaterial).specularColor),
        baseTexture: material.baseTexture ? "origin" : "",
        roughnessMetallicTexture: (material as PBRMaterial).roughnessMetallicTexture ? "origin" : "",
        normalTexture: (material as PBRBaseMaterial).normalTexture ? "origin" : "",
        emissiveTexture: (material as PBRBaseMaterial).emissiveTexture ? "origin" : "",
        occlusionTexture: (material as PBRBaseMaterial).occlusionTexture ? "origin" : "",
        specularGlossinessTexture: (material as PBRSpecularMaterial).specularGlossinessTexture ? "origin" : ""
      };

      const originTexture = {
        baseTexture: material.baseTexture,
        roughnessMetallicTexture: (material as PBRMaterial).roughnessMetallicTexture,
        normalTexture: (material as PBRBaseMaterial).normalTexture,
        emissiveTexture: (material as PBRBaseMaterial).emissiveTexture,
        occlusionTexture: (material as PBRBaseMaterial).occlusionTexture,
        specularGlossinessTexture: (material as PBRSpecularMaterial).specularGlossinessTexture
      };

      const f = folder.addFolder(
        folderName[material.name] ? `${material.name}_${folderName[material.name] + 1}` : material.name
      );

      folderName[material.name] = folderName[material.name] == null ? 1 : folderName[material.name] + 1;

      // metallic
      if (material instanceof PBRMaterial) {
        const mode1 = f.addFolder("金属模式");
        mode1.add(material, "metallic", 0, 1).step(0.01);
        mode1.add(material, "roughness", 0, 1).step(0.01);
        mode1.add(material, "ior", 0, 5).step(0.01);

        mode1
          .add(state, "roughnessMetallicTexture", ["None", "origin", ...Object.keys(this.textures)])
          .onChange((v) => {
            material.roughnessMetallicTexture =
              v === "None" ? null : this.textures[v] || originTexture.roughnessMetallicTexture;
          });
        mode1.open();
      }
      // specular
      else if (material instanceof PBRSpecularMaterial) {
        const mode2 = f.addFolder("高光模式");
        mode2.add(material, "glossiness", 0, 1).step(0.01);
        mode2.addColor(state, "specularColor").onChange((v) => {
          Oasis.guiToColor(v, material.specularColor);
        });
        mode2
          .add(state, "specularGlossinessTexture", ["None", "origin", ...Object.keys(this.textures)])
          .onChange((v) => {
            material.specularGlossinessTexture =
              v === "None" ? null : this.textures[v] || originTexture.specularGlossinessTexture;
          });
        mode2.open();
      } else if (material instanceof UnlitMaterial) {
        f.add(state, "baseTexture", ["None", "origin", ...Object.keys(this.textures)]).onChange((v) => {
          material.baseTexture = v === "None" ? null : this.textures[v] || originTexture.baseTexture;
        });

        f.addColor(state, "baseColor").onChange((v) => {
          Oasis.guiToColor(v, material.baseColor);
        });
      }

      // common
      if (!(material instanceof UnlitMaterial)) {
        const common = f.addFolder("通用");

        common
          .add(state, "opacity", 0, 1)
          .step(0.01)
          .onChange((v) => {
            material.baseColor.a = v;
          });
        common.add(material, "isTransparent");
        common.add(material, "alphaCutoff", 0, 1).step(0.01);

        common.addColor(state, "baseColor").onChange((v) => {
          Oasis.guiToColor(v, material.baseColor);
        });
        common.addColor(state, "emissiveColor").onChange((v) => {
          Oasis.guiToColor(v, material.emissiveColor);
        });
        common.add(state, "baseTexture", ["None", "origin", ...Object.keys(this.textures)]).onChange((v) => {
          material.baseTexture = v === "None" ? null : this.textures[v] || originTexture.baseTexture;
        });
        common.add(state, "normalTexture", ["None", "origin", ...Object.keys(this.textures)]).onChange((v) => {
          material.normalTexture = v === "None" ? null : this.textures[v] || originTexture.normalTexture;
        });
        common.add(state, "emissiveTexture", ["None", "origin", ...Object.keys(this.textures)]).onChange((v) => {
          material.emissiveTexture = v === "None" ? null : this.textures[v] || originTexture.emissiveTexture;
        });
        common.add(state, "occlusionTexture", ["None", "origin", ...Object.keys(this.textures)]).onChange((v) => {
          material.occlusionTexture = v === "None" ? null : this.textures[v] || originTexture.occlusionTexture;
        });
        common.open();
      }
    });
  }

  loadAnimationGUI(animations: AnimationClip[]) {
    if (this.animationFolder) {
      this.gui.removeFolder(this.animationFolder);
      this.animationFolder = null;
    }

    if (animations?.length) {
      this.animationFolder = this.gui.addFolder("Animation");
      this.animationFolder.open();
      const animator = this.gltfRootEntity.getComponent(Animator);
      animator.play(animations[0].name);
      const state = {
        animation: animations[0].name
      };
      this.animationFolder
        .add(state, "animation", ["None", ...animations.map((animation) => animation.name)])
        .onChange((name) => {
          if (name === "None") {
            animator.speed = 0;
          } else {
            animator.speed = 1;
            animator.play(name);
          }
        });
    }
  }
}

new Oasis();
