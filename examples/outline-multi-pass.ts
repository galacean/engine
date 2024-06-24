/**
 * @title Outline multi-pass
 * @category Advance
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*Vnw3R7c8HbcAAAAAAAAAAAAADiR2AQ/original
 */
import * as dat from "dat.gui";
import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  CompareFunction,
  CullMode,
  Engine,
  Entity,
  GLTFResource,
  Material,
  MeshRenderer,
  Script,
  Shader,
  StencilOperation,
  WebGLEngine,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

const gui = new dat.GUI();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.run();
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor.set(1, 1, 1, 1);

  // camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.setPosition(0, 1.3, 1);
  const camera = cameraNode.addComponent(Camera);
  camera.enableFrustumCulling = false;
  cameraNode.addComponent(OrbitControl).target.set(0, 1.3, 0);

  // ambient light
  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      ambientLight.specularIntensity = ambientLight.diffuseIntensity = 2;
    });

  engine.resourceManager
    .load({
      type: AssetType.GLTF,
      url: "https://gw.alipayobjects.com/os/OasisHub/440000554/3615/%25E5%25BD%2592%25E6%25A1%25A3.gltf",
    })
    .then((gltf: GLTFResource) => {
      const { defaultSceneRoot } = gltf;
      rootEntity.addChild(defaultSceneRoot);

      openDebug();
    });

  /** ------------------ Border ------------------ */
  // 外描边-模版测试
  class Border extends Script {
    material: Material;
    borderRenderer: MeshRenderer[] = [];

    private _size: number = 3;
    private _color: Color = new Color(0, 0, 0, 1);

    get size(): number {
      return this._size;
    }

    set size(value: number) {
      this.material.shaderData.setFloat("u_width", value * 0.001);
      this._size = value;
    }

    get color(): Color {
      return this._color;
    }

    set color(value: Color) {
      this.material.shaderData.setColor("u_color", value);
      this._color = value;
    }

    getBorderMaterial(engine: Engine) {
      if (!this.material) {
        if (!Shader.find("border-shader")) {
          const vertex = `
                 attribute vec3 POSITION;
                 attribute vec3 NORMAL;
   
                 uniform float u_width;
                 uniform mat4 renderer_MVPMat;
                 uniform mat4 renderer_ModelMat;
                 uniform mat4 camera_ViewMat;
                 uniform mat4 camera_ProjMat;
                 uniform mat4 renderer_NormalMat;
                 
                 void main() {
                    vec4 mPosition = renderer_ModelMat * vec4(POSITION, 1.0);
                    vec3 mNormal = normalize( mat3(renderer_NormalMat) * NORMAL );
                    mPosition.xyz += mNormal * u_width;
                    gl_Position = camera_ProjMat * camera_ViewMat * mPosition;
                 }
                 `;
          const fragment = `
                 uniform vec3 u_color;
 
                 void main(){
                   gl_FragColor = vec4(u_color, 1);
                 }
                 `;

          Shader.create("border-shader", vertex, fragment);
        }
        const material = new Material(engine, Shader.find("border-shader"));
        this.material = material;
        material.renderState.rasterState.cullMode = CullMode.Off;
        const stencilState = material.renderState.stencilState;
        stencilState.enabled = true;
        stencilState.referenceValue = 1;
        stencilState.compareFunctionFront = CompareFunction.NotEqual;
        stencilState.compareFunctionBack = CompareFunction.NotEqual;
        stencilState.writeMask = 0x00;
        this.size = this._size;
        this.color = this._color;
      }

      return this.material;
    }

    showBorder(renderer: MeshRenderer) {
      const entity = renderer.entity;
      const material = renderer.getMaterial();
      const stencilState = material.renderState.stencilState;

      stencilState.enabled = true;
      stencilState.referenceValue = 1;
      stencilState.passOperationFront = StencilOperation.Replace;

      const borderMaterial = this.getBorderMaterial(entity.engine);

      const borderRenderer = entity.addComponent(MeshRenderer);
      borderRenderer.mesh = renderer.mesh;
      borderRenderer.setMaterial(borderMaterial);
      borderRenderer.priority = 1;
      this.borderRenderer.push(borderRenderer);
    }

    constructor(entity: Entity) {
      super(entity);
      const meshes: MeshRenderer[] = [];
      rootEntity.getComponentsIncludeChildren(MeshRenderer, meshes);
      meshes.forEach((mesh) => {
        this.showBorder(mesh);
      });
    }

    onDestroy() {
      this.borderRenderer.forEach((renderer) => {
        renderer.destroy();
      });
      this.borderRenderer.length = 0;
    }
  }

  // 内描边-背面剔除
  class Border2 extends Script {
    material: Material;
    borderRenderer: MeshRenderer[] = [];
    private _size: number = 3;
    private _color: Color = new Color(0, 0, 0, 1);

    get size(): number {
      return this._size;
    }

    set size(value: number) {
      this.material.shaderData.setFloat("u_width", value * 0.001);
      this._size = value;
    }

    get color(): Color {
      return this._color;
    }

    set color(value: Color) {
      this.material.shaderData.setColor("u_color", value);
      this._color = value;
    }

    getBorderMaterial(engine: Engine) {
      if (!this.material) {
        if (!Shader.find("border-shader")) {
          const vertex = `
                 attribute vec3 POSITION;
                 attribute vec3 NORMAL;
   
                 uniform float u_width;
                 uniform mat4 renderer_MVPMat;
                 uniform mat4 renderer_ModelMat;
                 uniform mat4 camera_ViewMat;
                 uniform mat4 camera_ProjMat;
                 uniform mat4 renderer_NormalMat;
                 
                 void main() {
                    vec4 mPosition = renderer_ModelMat * vec4(POSITION, 1.0);
                    vec3 mNormal = normalize( mat3(renderer_NormalMat) * NORMAL );
                    mPosition.xyz += mNormal * u_width;
                    gl_Position = camera_ProjMat * camera_ViewMat * mPosition;
                 }
                 `;
          const fragment = `
                 uniform vec3 u_color;
 
                 void main(){
                   gl_FragColor = vec4(u_color, 1);
                 }
                 `;

          Shader.create("border-shader", vertex, fragment);
        }
        const material = new Material(engine, Shader.find("border-shader"));
        this.material = material;
        material.renderState.rasterState.cullMode = CullMode.Front;
        this.size = this._size;
        this.color = this._color;
      }

      return this.material;
    }

    showBorder(renderer: MeshRenderer) {
      const entity = renderer.entity;

      const borderMaterial = this.getBorderMaterial(entity.engine);
      const borderRenderer = entity.addComponent(MeshRenderer);
      borderRenderer.mesh = renderer.mesh;
      borderRenderer.setMaterial(borderMaterial);
      borderRenderer.priority = 1;
      this.borderRenderer.push(borderRenderer);
    }

    constructor(entity: Entity) {
      super(entity);
      const renderers: MeshRenderer[] = [];
      rootEntity.getComponentsIncludeChildren(MeshRenderer, renderers);
      renderers.forEach((renderer) => {
        this.showBorder(renderer);
      });
    }

    onDestroy() {
      this.borderRenderer.forEach((renderer) => {
        renderer.destroy();
      });
      this.borderRenderer.length = 0;
    }
  }

  function openDebug() {
    const borderEntity = rootEntity.createChild("border");
    const color = new Color();
    let border: Border | Border2 = borderEntity.addComponent(Border);

    const config = {
      plan: "外描边",
      size: 3,
      color: [0, 0, 0],
    };

    gui
      .add(config, "plan", ["外描边", "内描边"])
      .onChange((v) => {
        color.set(
          config.color[0] / 255,
          config.color[1] / 255,
          config.color[2] / 255,
          1
        );

        border.destroy();
        if (v === "外描边") {
          border = borderEntity.addComponent(Border);

          border.size = config.size;
          border.color = color;
          showSize();
        } else if (v === "内描边") {
          border = borderEntity.addComponent(Border2);
          border.size = config.size;
          border.color = color;
          showSize();
        }
      })
      .name("描边方案");

    let size;
    function showSize() {
      hideSize();
      size = gui.add(config, "size", 0, 5, 1).onChange((v) => {
        border.size = v;
      });
    }
    function hideSize() {
      size && size.remove();
      size = null;
    }

    showSize();
    gui.addColor(config, "color").onChange((v) => {
      color.set(v[0] / 255, v[1] / 255, v[2] / 255, 1);
      border.color = color;
    });
  }
});
