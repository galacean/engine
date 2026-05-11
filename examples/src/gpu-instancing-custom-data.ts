/**
 * @title GPU Instancing Custom Data
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*jjZMTrp-vU8AAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  Color,
  DirectLight,
  Logger,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  Script,
  Shader,
  ShaderProperty,
  Vector3,
  Vector4,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";

const shaderCompiler = new ShaderCompiler();
const _customColorProperty = ShaderProperty.getByName("renderer_CustomColor");

class SpiralFlash extends Script {
  radius: number = 0;
  radiusSpeed: number = 0;
  theta: number = 0;
  thetaSpeed: number = 0;
  phi: number = 0;
  phiSpeed: number = 0;
  rotateSpeed: Vector3 = new Vector3();
  scaleBase: number = 1;
  scaleFreq: number = 0;
  colorPhase: number = 0;
  colorSpeed: number = 1;
  private _time: number = 0;
  private _color: Vector4 = new Vector4();

  onUpdate(deltaTime: number): void {
    this._time += deltaTime;
    const t = this._time;
    const transform = this.entity.transform;

    // Spiral breathing motion
    const r = this.radius * (0.6 + 0.4 * Math.sin(t * this.radiusSpeed));
    const theta = this.theta + t * this.thetaSpeed;
    const phi = this.phi + t * this.phiSpeed;

    const sinTheta = Math.sin(theta);
    transform.setPosition(r * sinTheta * Math.cos(phi), r * Math.cos(theta), r * sinTheta * Math.sin(phi));

    // Rotation
    const { rotateSpeed } = this;
    transform.rotate(rotateSpeed.x * deltaTime, rotateSpeed.y * deltaTime, rotateSpeed.z * deltaTime);

    // Scale pulse
    const s = this.scaleBase * (0.7 + 0.3 * Math.sin(t * this.scaleFreq));
    transform.setScale(s, s, s);

    // Color cycles through hue based on time + unique phase
    const ct = t * this.colorSpeed + this.colorPhase;
    this._color.set(0.5 + 0.5 * Math.sin(ct), 0.5 + 0.5 * Math.sin(ct + 2.094), 0.5 + 0.5 * Math.sin(ct + 4.189), 1.0);
    this.entity.getComponent(MeshRenderer).shaderData.setVector4(_customColorProperty, this._color);
  }
}

Logger.enable();

const customInstanceShaderSource = `Shader "CustomInstanceShader" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes {
        vec3 POSITION;
        vec3 NORMAL;
      };

      struct Varyings {
        vec3 v_normal;
      };

      mat4 renderer_MVPMat;
      mat4 renderer_NormalMat;
      vec4 renderer_CustomColor;

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_normal = normalize((renderer_NormalMat * vec4(attr.NORMAL, 0.0)).xyz);
        return v;
      }

      vec4 frag(Varyings v) {
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float NdotL = max(dot(v.v_normal, lightDir), 0.2);
        return vec4(renderer_CustomColor.rgb * NdotL, 1.0);
      }
    }
  }
}`;

WebGLEngine.create({
  canvas: "canvas",
  graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 },
  shaderCompiler
}).then((engine) => {
  Shader.create(customInstanceShaderSource);
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("Root");

  // Camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 100);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 500;

  // Light
  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-45, -45, 0);
  lightEntity.addComponent(DirectLight).color = new Color(1, 1, 1, 1);

  const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const material = new Material(engine, Shader.find("CustomInstanceShader"));
  const customColorProperty = ShaderProperty.getByName("renderer_CustomColor");

  const count = 5000;
  for (let i = 0; i < count; i++) {
    const entity = rootEntity.createChild("Cube" + i);
    const ti = i / count;

    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);

    const initColor = new Vector4(Math.random(), Math.random(), Math.random(), 1.0);
    renderer.shaderData.setVector4(customColorProperty, initColor);

    const anim = entity.addComponent(SpiralFlash);
    anim.radius = 10 + Math.random() * 40;
    anim.radiusSpeed = 0.3 + Math.random() * 0.6;
    anim.theta = ti * Math.PI * 2 * 13.7;
    anim.phi = ti * Math.PI * 2 * 7.3;
    anim.thetaSpeed = (0.2 + Math.random() * 0.4) * (Math.random() > 0.5 ? 1 : -1);
    anim.phiSpeed = (0.3 + Math.random() * 0.5) * (Math.random() > 0.5 ? 1 : -1);
    anim.rotateSpeed = new Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
    anim.scaleBase = 0.6 + Math.random() * 0.8;
    anim.scaleFreq = 0.5 + Math.random() * 2;
    anim.colorPhase = Math.random() * Math.PI * 2;
    anim.colorSpeed = 0.5 + Math.random() * 2;
  }

  engine.run();
});
