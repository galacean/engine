/**
 * @title GPU Instancing Auto Batch
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*jjZMTrp-vU8AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl, Stats } from "@galacean/engine-toolkit";
import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
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

const _customColorProperty = ShaderProperty.getByName("renderer_CustomColor");

class SpiralAnimate extends Script {
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
  colorSpeed: number = 0;
  private _time: number = 0;
  private _color: Vector4 = new Vector4();
  private _hasColor: boolean = false;

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

    // Color animation (cubes only)
    if (this._hasColor) {
      const ct = t * this.colorSpeed + this.colorPhase;
      this._color.set(
        0.5 + 0.5 * Math.sin(ct),
        0.5 + 0.5 * Math.sin(ct + 2.094),
        0.5 + 0.5 * Math.sin(ct + 4.189),
        1.0
      );
      this.entity.getComponent(MeshRenderer).shaderData.setVector4(_customColorProperty, this._color);
    }
  }

  enableColor(): void {
    this._hasColor = true;
  }
}

// Custom shader for cubes
Shader.create(
  "CustomInstanceShader",
  `
  #include <transform_declare>
  attribute vec3 POSITION;
  attribute vec3 NORMAL;

  varying vec3 v_normal;

  void main() {
    gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
    v_normal = normalize((renderer_NormalMat * vec4(NORMAL, 0.0)).xyz);
  }
  `,
  `
  uniform vec4 renderer_CustomColor;

  varying vec3 v_normal;

  void main() {
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float NdotL = max(dot(v_normal, lightDir), 0.2);
    gl_FragColor = vec4(renderer_CustomColor.rgb * NdotL, 1.0);
  }
  `
);

WebGLEngine.create({ canvas: "canvas", graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 } }).then(async (engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("Root");

  // Camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 100);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 500;
  cameraEntity.addComponent(OrbitControl);

  // Stats
  cameraEntity.addComponent(Stats);

  // Light
  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-45, -45, 0);
  lightEntity.addComponent(DirectLight).color = new Color(1, 1, 1, 1);

  // Load Duck model and ambient light
  const [glTF, ambientLight] = await Promise.all([
    engine.resourceManager.load<GLTFResource>({
      url: "https://gw.alipayobjects.com/os/bmw-prod/6cb8f543-285c-491a-8cfd-57a1160dc9ab.glb",
      type: AssetType.GLTF
    }),
    engine.resourceManager.load<AmbientLight>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*eRJ8QKzf5zAAAAAAgBAAAAgAekp5AQ/ambient.ambLight",
      type: AssetType.AmbientLight
    })
  ]);
  scene.ambientLight = ambientLight;

  // Cube resources
  const cubeMesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const cubeMaterial = new Material(engine, Shader.find("CustomInstanceShader"));
  const customColorProperty = ShaderProperty.getByName("renderer_CustomColor");

  // Interleave ducks and cubes to break batching — instancing shines here
  const duckCount = 1500;
  const cubeCount = 1500;
  const totalCount = duckCount + cubeCount;

  for (let i = 0; i < totalCount; i++) {
    const ti = i / totalCount;
    const isDuck = i % 2 === 0 && i / 2 < duckCount;
    const isCube = !isDuck;

    let entity;
    if (isDuck) {
      entity = glTF.instantiateSceneRoot();
      rootEntity.addChild(entity);
    } else {
      entity = rootEntity.createChild("Cube" + i);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = cubeMesh;
      renderer.setMaterial(cubeMaterial);
      const initColor = new Vector4(Math.random(), Math.random(), Math.random(), 1.0);
      renderer.shaderData.setVector4(customColorProperty, initColor);
    }

    const anim = entity.addComponent(SpiralAnimate);
    anim.radius = 10 + Math.random() * 40;
    anim.radiusSpeed = 0.3 + Math.random() * 0.6;
    anim.theta = ti * Math.PI * 2 * 13.7;
    anim.phi = ti * Math.PI * 2 * 7.3;
    anim.thetaSpeed = (0.2 + Math.random() * 0.4) * (Math.random() > 0.5 ? 1 : -1);
    anim.phiSpeed = (0.3 + Math.random() * 0.5) * (Math.random() > 0.5 ? 1 : -1);
    anim.rotateSpeed = new Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
    anim.scaleBase = 0.6 + Math.random() * 0.8;
    anim.scaleFreq = 0.5 + Math.random() * 2;

    if (isCube) {
      anim.colorPhase = Math.random() * Math.PI * 2;
      anim.colorSpeed = 0.5 + Math.random() * 2;
      anim.enableColor();
    }
  }

  engine.run();
});
