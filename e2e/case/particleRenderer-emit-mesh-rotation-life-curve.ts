/**
 * @title Particle Rotation Over Lifetime (Mesh + Non-Separate Z)
 * @category Particle
 */
import {
  AssetType,
  BackgroundMode,
  Burst,
  Camera,
  Color,
  ConeShape,
  CurveKey,
  Engine,
  Entity,
  GLTFResource,
  Logger,
  ModelMesh,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

type Mode = "constant" | "curve";

Logger.enable();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  const scene = engine.sceneManager.activeScene;
  scene.background.mode = BackgroundMode.SolidColor;
  scene.background.solidColor.set(0.15, 0.15, 0.18, 1);

  const rootEntity = scene.createRootEntity("root");

  const cameraEntity = rootEntity.createChild("camera");
  // Tilted view so any X/Y Euler component is visible from the side; a head-on
  // Z-only view would hide the difference between correct and polluted X/Y.
  cameraEntity.transform.position = new Vector3(0, 6, 14);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 45;

  Promise.all([
    engine.resourceManager.load({
      url: "https://mdn.alipayobjects.com/huamei_9ahbho/afts/file/A*dtofQrHZU08AAAAAQOAAAAgAegDwAQ/rounded_cube.glb",
      type: AssetType.GLTF
    }),
    engine.resourceManager.load({
      url: "https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*QJvmQ6g4ujYAAAAAgCAAAAgAegDwAQ/original",
      type: AssetType.Texture
    })
  ]).then(([glTFModel, texture]) => {
    const mesh = (<GLTFResource>glTFModel).meshes[0][0];

    // All three spinners run computeParticleRotationVec3 (startRotation3D=true).
    // Non-zero startRotationX/Y (30°, 60°) make the "non-separate must not touch X/Y"
    // contract directly observable: post-fix the cube keeps that tilted pose while
    // spinning around Z; pre-fix the X/Y components are polluted by the Z increment
    // and the cube tumbles off-axis.
    // LEFT  — non-separate CONSTANT mode  → exercises the constant-branch fix (rotation.z += ageRot)
    // MID   — non-separate CURVE    mode  → exercises the curve-branch    fix (rotation.z += lifeRotation * lifetime)
    // RIGHT — separate (control)          → always-correct vec3 path, unaffected by fix
    createSpinner(engine, rootEntity, new Vector3(-5, 0, 0), false, "constant", mesh, <Texture2D>texture);
    createSpinner(engine, rootEntity, new Vector3(-1.5, 0, 0), false, "curve", mesh, <Texture2D>texture);
    createSpinner(engine, rootEntity, new Vector3(2, 0, 0), true, "constant", mesh, <Texture2D>texture);

    updateForE2E(engine, 500);
    initScreenshot(engine, camera);
  });
});

function createSpinner(
  engine: Engine,
  parent: Entity,
  position: Vector3,
  separateAxes: boolean,
  mode: Mode,
  mesh: ModelMesh,
  texture: Texture2D
): Entity {
  // Defer activation so the ParticleRenderer's playOnEnabled path doesn't fire a
  // non-deterministic Math.random()-seeded play() before randomSeed is set.
  const entity = parent.createChild(`${separateAxes ? "separate" : "non-separate"}-${mode}`);
  entity.isActive = false;
  entity.transform.position = position;

  const renderer = entity.addComponent(ParticleRenderer);
  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1, 1, 1, 1);
  material.baseTexture = texture;
  renderer.setMaterial(material);

  renderer.renderMode = ParticleRenderMode.Mesh;
  renderer.mesh = mesh;

  const generator = renderer.generator;

  const { main, emission, rotationOverLifetime } = generator;
  main.simulationSpace = ParticleSimulationSpace.Local;
  main.duration = 10;
  main.isLoop = true;
  main.startLifetime.constant = 10;
  main.startSpeed.constant = 0;
  main.startSize.constant = 1.5;
  // startRotation3D=true forces is3DRotation, so all sides go through
  // computeParticleRotationVec3 (the function the fix touches). The non-zero
  // X/Y values make the regression directly observable: with the fix the cube
  // stays tilted (30°, 60°) while only Z accumulates; without the fix the Z
  // delta leaks into X/Y and the cube tumbles off-axis.
  main.startRotation3D = true;
  main.startRotationX.constant = 30;
  main.startRotationY.constant = 60;
  main.startRotationZ.constant = 0;
  main.gravityModifier.constant = 0;

  emission.rateOverTime.constant = 0;
  emission.addBurst(new Burst(0, new ParticleCompositeCurve(1)));

  const cone = new ConeShape();
  cone.angle = 0;
  cone.radius = 0;
  emission.shape = cone;

  rotationOverLifetime.enabled = true;
  rotationOverLifetime.separateAxes = separateAxes;

  if (mode === "curve") {
    // Constant-valued curve produces the same total Z rotation as constant 90:
    // evaluateParticleCurveCumulative(y=90, t) * lifetime = 90 * normalizedAge * lifetime = 90 * age.
    const flat90 = () => new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 90), new CurveKey(1, 90)));
    rotationOverLifetime.rotationZ = flat90();
    if (separateAxes) {
      const flat0 = () => new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 0)));
      rotationOverLifetime.rotationX = flat0();
      rotationOverLifetime.rotationY = flat0();
    }
  } else {
    rotationOverLifetime.rotationZ.constant = 90;
    if (separateAxes) {
      rotationOverLifetime.rotationX.constant = 0;
      rotationOverLifetime.rotationY.constant = 0;
    }
  }

  // randomSeed setter also flips useAutoRandomSeed to false, so the upcoming
  // play() (triggered by isActive=true) will NOT re-seed from Math.random().
  generator.randomSeed = 0;
  entity.isActive = true;

  return entity;
}
