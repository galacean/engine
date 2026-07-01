/**
 * @title CharacterSpacing
 * @category Text
 */

import {
  Camera,
  TextHorizontalAlignment,
  TextRenderer,
  TextVerticalAlignment,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.setResolution(1200, 800);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);

  const text = "Character Spacing";

  // Default spacing (0)
  const entity0 = rootEntity.createChild("text0");
  entity0.transform.position = new Vector3(0, 2, 0);
  const tr0 = entity0.addComponent(TextRenderer);
  tr0.fontSize = 36;
  tr0.text = text;
  tr0.horizontalAlignment = TextHorizontalAlignment.Center;
  tr0.verticalAlignment = TextVerticalAlignment.Center;

  // Positive spacing (0.1 em)
  const entity1 = rootEntity.createChild("text1");
  entity1.transform.position = new Vector3(0, 1, 0);
  const tr1 = entity1.addComponent(TextRenderer);
  tr1.fontSize = 36;
  tr1.text = text;
  tr1.characterSpacing = 0.1;
  tr1.horizontalAlignment = TextHorizontalAlignment.Center;
  tr1.verticalAlignment = TextVerticalAlignment.Center;

  // Larger positive spacing (0.3 em)
  const entity2 = rootEntity.createChild("text2");
  entity2.transform.position = new Vector3(0, 0, 0);
  const tr2 = entity2.addComponent(TextRenderer);
  tr2.fontSize = 36;
  tr2.text = text;
  tr2.characterSpacing = 0.3;
  tr2.horizontalAlignment = TextHorizontalAlignment.Center;
  tr2.verticalAlignment = TextVerticalAlignment.Center;

  // Full em spacing (1 em)
  const entity3 = rootEntity.createChild("text3");
  entity3.transform.position = new Vector3(0, -0.5, 0);
  const tr3 = entity3.addComponent(TextRenderer);
  tr3.fontSize = 36;
  tr3.text = text;
  tr3.characterSpacing = 1;
  tr3.horizontalAlignment = TextHorizontalAlignment.Center;
  tr3.verticalAlignment = TextVerticalAlignment.Center;

  // Negative spacing (-0.05 em)
  const entity4 = rootEntity.createChild("text4");
  entity4.transform.position = new Vector3(0, -1.5, 0);
  const tr4 = entity4.addComponent(TextRenderer);
  tr4.fontSize = 36;
  tr4.text = text;
  tr4.characterSpacing = -0.05;
  tr4.horizontalAlignment = TextHorizontalAlignment.Center;
  tr4.verticalAlignment = TextVerticalAlignment.Center;

  updateForE2E(engine);
  initScreenshot(engine, camera);
});
