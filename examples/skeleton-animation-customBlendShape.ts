/**
 * @title Animation CustomBlendShape
 * @category Animation
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*kapsTY3USw8AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  BlendShape,
  Camera,
  Logger,
  ModelMesh,
  SkinnedMeshRenderer,
  SystemInfo,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.width = window.innerWidth * SystemInfo.devicePixelRatio;
  engine.canvas.height = window.innerHeight * SystemInfo.devicePixelRatio;
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("cameraNode");
  cameraEntity.transform.position = new Vector3(0, 0, 5);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  const meshEntity = rootEntity.createChild("meshEntity");
  const skinnedMeshRenderer = meshEntity.addComponent(SkinnedMeshRenderer);
  const modelMesh = new ModelMesh(engine);

  // Set vertices data.
  const positions = [
    new Vector3(-1.0, -1.0, 1.0),
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0),
    new Vector3(-1.0, 1.0, 1.0),
    new Vector3(-1.0, -1.0, 1.0),
  ];
  modelMesh.setPositions(positions);

  // Add SubMesh.
  modelMesh.addSubMesh(0, 6);

  // Add BlendShape.
  const deltaPositions = [
    new Vector3(0.0, 0.0, 0.0),
    new Vector3(0.0, 0.0, 0.0),
    new Vector3(-1.0, 0.0, 0.0),
    new Vector3(-1.0, 0.0, 0.0),
    new Vector3(1.0, 0.0, 0.0),
    new Vector3(0.0, 0.0, 0.0),
  ];
  const blendShape = new BlendShape("BlendShapeA");
  blendShape.addFrame(1.0, deltaPositions);
  modelMesh.addBlendShape(blendShape);

  skinnedMeshRenderer.mesh = modelMesh;
  skinnedMeshRenderer.setMaterial(new UnlitMaterial(engine));

  // Upload data.
  modelMesh.uploadData(false);

  engine.run();

  // Use `blendShapeWeights` property to adjust the mesh to the target BlendShape
  skinnedMeshRenderer.blendShapeWeights = new Float32Array([1.0]);

  // Add data GUI
  addDataGUI(skinnedMeshRenderer);

  /**
   * Add data GUI.
   */
  function addDataGUI(skinnedMeshRenderer: SkinnedMeshRenderer): void {
    const gui = new dat.GUI();
    const guiData = {
      blendShapeWeights: 1.0,
    };

    gui.add(guiData, "blendShapeWeights", 0, 1).onChange((value: number) => {
      skinnedMeshRenderer.blendShapeWeights[0] = value;
    });
  }
});
