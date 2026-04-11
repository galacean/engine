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
  Entity,
  GLTFResource,
  Logger,
  Script,
  Vector3,
  WebGLEngine
} from "@galacean/engine";

class SpiralAnimate extends Script {
  // Spherical spiral parameters — unique per object
  radius: number = 0;
  radiusSpeed: number = 0;
  theta: number = 0;
  thetaSpeed: number = 0;
  phi: number = 0;
  phiSpeed: number = 0;
  rotateSpeed: Vector3 = new Vector3();
  scaleBase: number = 1;
  scaleFreq: number = 0;
  private _time: number = 0;

  onUpdate(deltaTime: number): void {
    this._time += deltaTime;
    const t = this._time;
    const transform = this.entity.transform;

    // Spiral outward and inward with a breathing motion
    const r = this.radius * (0.6 + 0.4 * Math.sin(t * this.radiusSpeed));
    const theta = this.theta + t * this.thetaSpeed;
    const phi = this.phi + t * this.phiSpeed;

    // Spherical to cartesian
    const sinTheta = Math.sin(theta);
    transform.setPosition(r * sinTheta * Math.cos(phi), r * Math.cos(theta), r * sinTheta * Math.sin(phi));

    // Rotation
    const { rotateSpeed } = this;
    transform.rotate(rotateSpeed.x * deltaTime, rotateSpeed.y * deltaTime, rotateSpeed.z * deltaTime);

    // Scale pulse
    const s = this.scaleBase * (0.7 + 0.3 * Math.sin(t * this.scaleFreq));
    transform.setScale(s, s, s);
  }
}

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then(async (engine) => {
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

  const count = 3000;
  for (let i = 0; i < count; i++) {
    const duck = glTF.instantiateSceneRoot();
    const t = i / count;

    const anim = duck.addComponent(SpiralAnimate);
    // Distribute across a sphere with varying radii
    anim.radius = 10 + Math.random() * 40;
    anim.radiusSpeed = 0.3 + Math.random() * 0.6;
    // Start at different points on the sphere
    anim.theta = t * Math.PI * 2 * 13.7; // Golden-angle-ish spread
    anim.phi = t * Math.PI * 2 * 7.3;
    // Different orbit speeds
    anim.thetaSpeed = (0.2 + Math.random() * 0.4) * (Math.random() > 0.5 ? 1 : -1);
    anim.phiSpeed = (0.3 + Math.random() * 0.5) * (Math.random() > 0.5 ? 1 : -1);
    anim.rotateSpeed = new Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
    anim.scaleBase = 0.6 + Math.random() * 0.8;
    anim.scaleFreq = 0.5 + Math.random() * 2;

    rootEntity.addChild(duck);
  }

  engine.run();
});
