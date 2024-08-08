/**
 * @title Particle Main Module
 * @category Particle
 * @thumbnail https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*N9wCSLFJoMcAAAAAAAAAAAAADtKFAQ/original
 */
import {
  AssetType,
  BlendMode,
  Camera,
  Color,
  ConeShape,
  Logger,
  ParticleCurveMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleScaleMode,
  ParticleSimulationSpace,
  Vector3,
  WebGLEngine,
  MainModule,
  Layer
} from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { Gizmo, GridControl, Group, State } from "@galacean/engine-toolkit";
import * as dat from "dat.gui";

const gui = new dat.GUI();
const initGUI = (main: MainModule) => {
  const debugInfo = {
    duration: 5,
    isLoop: true,
    startDelay: 0,
    startLifetime: 5,

    speedMode: "constant",
    speedConstant: 5,
    speedMin: 0,
    speedMax: 5,

    startSize3D: false,
    startSize: 1,
    startSizeX: 1,
    startSizeY: 1,
    startSizeZ: 1,

    startRotation3D: false,
    startRotation: 0,
    startRotationX: 0,
    startRotationY: 0,
    startRotationZ: 0,

    flipRotation: 0,
    startColor: [255, 255, 255],
    gravityModifier: 0,
    simulationSpace: "Local",
    simulationSpeed: 1,
    scalingMode: "Local",
    playOnEnabled: true,
    maxParticles: 1000
  };

  gui.add(debugInfo, "duration", 0, 10, 1).onChange((v) => {
    main.duration = v;
  });

  gui.add(debugInfo, "isLoop").onChange((v) => {
    main.isLoop = v;
  });

  gui.add(debugInfo, "startDelay", 0, 50, 1).onChange((v) => {
    main.startDelay.constant = v;
  });

  gui.add(debugInfo, "startLifetime", 0, 50, 1).onChange((v) => {
    main.startLifetime.constant = v;
  });

  // start speed module
  const particleSpeedFolder = gui.addFolder("Start Speed");
  particleSpeedFolder.add(debugInfo, "speedMode", ["constant", "two constants"]).onChange((v) => {
    switch (v) {
      case "constant":
        main.startSpeed.mode = ParticleCurveMode.Constant;
        break;
      case "two constants":
        main.startSpeed.mode = ParticleCurveMode.TwoConstants;
        break;
    }
    updateStartSpeedOptions();
  });

  const speedMinController = particleSpeedFolder.add(debugInfo, "speedMin", 0, 100).onChange((v) => {
    main.startSpeed.constantMin = v;
  });

  const speedMaxController = particleSpeedFolder.add(debugInfo, "speedMax", 0, 100).onChange((v) => {
    main.startSpeed.constantMax = v;
  });

  const speedConstantController = particleSpeedFolder.add(debugInfo, "speedConstant", 0, 100).onChange((v) => {
    main.startSpeed.constant = v;
  });

  const updateStartSpeedOptions = () => {
    switch (debugInfo.speedMode) {
      case "constant":
        speedMinController.domElement.parentElement.style.display = "none";
        speedMaxController.domElement.parentElement.style.display = "none";
        speedConstantController.domElement.parentElement.style.display = "block";
        break;
      case "two constants":
        speedMinController.domElement.parentElement.style.display = "block";
        speedMaxController.domElement.parentElement.style.display = "block";
        speedConstantController.domElement.parentElement.style.display = "none";
        break;
    }
  };
  updateStartSpeedOptions();

  // start size
  const startSizeFolder = gui.addFolder("Start Size");
  startSizeFolder.add(debugInfo, "startSize3D").onChange((v) => {
    main.startSize3D = v;
    updateStartSizeOptions();
  });

  const sizeConstantController = startSizeFolder.add(debugInfo, "startSize", 0, 10, 0.2).onChange((v) => {
    main.startSize.constant = v;
  });

  const sizeXController = startSizeFolder.add(debugInfo, "startSizeX", 0, 10, 0.2).onChange((v) => {
    main.startSizeX.constant = v;
  });
  const sizeYController = startSizeFolder.add(debugInfo, "startSizeY", 0, 10, 0.2).onChange((v) => {
    main.startSizeY.constant = v;
  });
  const sizeZController = startSizeFolder.add(debugInfo, "startSizeZ", 0, 10, 0.2).onChange((v) => {
    main.startSizeZ.constant = v;
  });

  const updateStartSizeOptions = () => {
    switch (debugInfo.startSize3D) {
      case true:
        sizeXController.domElement.parentElement.style.display = "none";
        sizeYController.domElement.parentElement.style.display = "none";
        sizeZController.domElement.parentElement.style.display = "none";
        sizeConstantController.domElement.parentElement.style.display = "block";
        break;
      case false:
        sizeXController.domElement.parentElement.style.display = "block";
        sizeYController.domElement.parentElement.style.display = "block";
        sizeZController.domElement.parentElement.style.display = "block";
        sizeConstantController.domElement.parentElement.style.display = "none";
        break;
    }
  };
  updateStartSizeOptions();

  // startRotation
  const startRotationFolder = gui.addFolder("Start Rotation");
  startRotationFolder.add(debugInfo, "startRotation3D").onChange((v) => {
    main.startRotation3D = v;
    updateStartRotationOptions();
  });

  const rotationConstantController = startRotationFolder.add(debugInfo, "startRotation", 0, 360).onChange((v) => {
    main.startRotationZ.constant = v;
  });

  const rotationXController = startRotationFolder.add(debugInfo, "startRotationX", 0, 360).onChange((v) => {
    main.startRotationX.constant = v;
  });
  const rotationYController = startRotationFolder.add(debugInfo, "startRotationY", 0, 360).onChange((v) => {
    main.startRotationY.constant = v;
  });
  const rotationZController = startRotationFolder.add(debugInfo, "startRotationZ", 0, 360).onChange((v) => {
    main.startRotationZ.constant = v;
  });

  const updateStartRotationOptions = () => {
    switch (debugInfo.startRotation3D) {
      case true:
        rotationXController.domElement.parentElement.style.display = "none";
        rotationYController.domElement.parentElement.style.display = "none";
        rotationZController.domElement.parentElement.style.display = "none";
        rotationConstantController.domElement.parentElement.style.display = "block";
        break;
      case false:
        rotationXController.domElement.parentElement.style.display = "block";
        rotationYController.domElement.parentElement.style.display = "block";
        rotationZController.domElement.parentElement.style.display = "block";
        rotationConstantController.domElement.parentElement.style.display = "none";
        break;
    }
  };
  updateStartRotationOptions();

  gui.add(debugInfo, "flipRotation", 0, 1, 0.05).onChange((v) => {
    main.flipRotation = v;
  });

  gui.addColor(debugInfo, "startColor").onChange((v) => {
    main.startColor.constant.set(v[0] / 255, v[1] / 255, v[2] / 255, 1);
  });

  gui.add(debugInfo, "gravityModifier", 0, 10, 0.1).onChange((v) => {
    main.gravityModifier.constant = v;
  });

  gui.add(debugInfo, "simulationSpace", ["World", "Local"]).onChange((v) => {
    switch (debugInfo.simulationSpace) {
      case "World":
        main.simulationSpace = ParticleSimulationSpace.World;
        "block";
        break;
      case "Local":
        main.simulationSpace = ParticleSimulationSpace.Local;
        break;
    }
  });

  gui.add(debugInfo, "simulationSpeed", -5, 5, 0.2).onChange((v) => {
    main.simulationSpeed = v;
  });

  gui.add(debugInfo, "scalingMode", ["Local", "World", "Hierarchy"]).onChange((v) => {
    switch (v) {
      case "Local":
        main.scalingMode = ParticleScaleMode.Local;
        break;
      case "World":
        main.scalingMode = ParticleScaleMode.World;
        break;
      case "Hierarchy":
        main.scalingMode = ParticleScaleMode.Hierarchy;
        break;
    }
  });

  gui.add(debugInfo, "playOnEnabled").onChange((v) => {
    main.playOnEnabled = v;
  });

  gui.add(debugInfo, "maxParticles", 0, 5000).onChange((v) => {
    main.maxParticles = v;
  });
};

const LayerSetting = {
  Entity: Layer.Layer22,
  NavigationGizmo: Layer.Layer30,
  Gizmo: Layer.Layer31
};

// Create engine
WebGLEngine.create({
  canvas: "canvas",
  physics: new LitePhysics()
}).then((engine) => {
  Logger.enable();
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;

  const ambientLight = scene.ambientLight;
  ambientLight.diffuseSolidColor.set(0.8, 0.8, 1, 1);
  ambientLight.diffuseIntensity = 0.5;

  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(25 / 255, 25 / 255, 112 / 255, 1);

  // Create camera
  const cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.transform.position = new Vector3(0, 10, 30);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  const grid = rootEntity.addComponent(GridControl);
  grid.camera = camera;
  grid.distance = 2;

  const controlEntity = rootEntity.createChild("control");
  const gizmoEntity = controlEntity.createChild("gizmo");
  const gizmo = gizmoEntity.addComponent(Gizmo);
  const group = new Group();
  gizmo.init(camera, group);
  gizmo.state = State.all;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*JPsCSK5LtYkAAAAAAAAAAAAADil6AQ/original",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const particleEntity = rootEntity.createChild("Fire");
      particleEntity.layer = LayerSetting.Entity;
      group.addEntity(particleEntity);

      particleEntity.transform.rotate(90, 0, 0);
      const particleRenderer = particleEntity.addComponent(ParticleRenderer);

      const material = new ParticleMaterial(engine);
      material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
      material.blendMode = BlendMode.Additive;
      material.baseTexture = texture;
      particleRenderer.setMaterial(material);

      particleRenderer.generator.emission.shape = new ConeShape();

      initGUI(particleRenderer.generator.main);
    });

  engine.run();
});
