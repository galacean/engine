/**
 * @title Device restore
 * @category Advance
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*U3AXS7Iq-AQAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Animator,
  Camera,
  Color,
  GLTFResource,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity();
  rootEntity.scene.background.solidColor = new Color(0.39, 0.31, 0.55, 1.0);

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0.5, 7);
  cameraEntity.transform.lookAt(new Vector3(0, 0.5, 0));

  // Model from sketchfab: https://sketchfab.com/3d-models/cloud-station-26f81b24d83441ba88c7e80a52adbaaf
  // Created by Alex Kruckenberg, Licensed under CC BY 4.0
  engine.resourceManager
    .load<GLTFResource>(
      "https://mdn.alipayobjects.com/huamei_b4l2if/afts/file/A*AGAoTLQHpJoAAAAAAAAAAAAADil6AQ/cloud_station.glb"
    )
    .then((glTFResource) => {
      const { defaultSceneRoot, animations } = glTFResource;
      rootEntity.addChild(defaultSceneRoot);

      const animator = defaultSceneRoot.getComponent(Animator);
      animator.play(animations![0].name);

      engine.on("devicelost", () => {
        domText.textContent = "Device is lost!";
        restoreButton.disabled = false;
      });

      engine.on("devicerestored", () => {
        domText.textContent = "Device restored!";
        lostButton.disabled = false;
      });

      engine.run();

      // Simulate device loss and recovery
      // The actual project does not need to call `forceLoseDevice()` and `forceRestoreDevice()`
      // These two methods are only used to simulate whether the performance of device loss and restoration is correct
      initDomElement(engine);
    });
});

const domText = document.createElement("div");
const lostButton = document.createElement("button");
const restoreButton = document.createElement("button");

function initDomElement(engine: WebGLEngine): void {
  // Text
  const textStyle = domText.style;
  textStyle.whiteSpace = "nowrap";
  textStyle.position = "absolute";
  textStyle.top = "40%";
  textStyle.left = "50%";
  textStyle.transform = "translate(-50%, -50%)";
  textStyle.fontSize = "60px";
  textStyle.color = "orange";
  textStyle.fontWeight = "bold";
  document.body.appendChild(domText);

  // Lost button
  lostButton.textContent = "Force lost device";
  let lostStyle = lostButton.style;
  lostStyle.position = "absolute";
  lostStyle.bottom = "10%";
  lostStyle.left = "40%";
  lostStyle.transform = "translate(-50%, -50%)";
  lostStyle.width = "200px";
  lostStyle.height = "50px";
  document.body.appendChild(lostButton);
  lostButton.addEventListener("click", function () {
    engine.forceLoseDevice();
    domText.textContent = "Force lost device...";
    lostButton.disabled = true;
  });

  // Restore button
  restoreButton.textContent = "Force restore device";
  const restoreStyle = restoreButton.style;
  restoreStyle.position = "absolute";
  restoreStyle.bottom = "10%";
  restoreStyle.right = "40%";
  restoreStyle.transform = "translate(50%, -50%)";
  restoreStyle.width = "200px";
  restoreStyle.height = "50px";
  restoreButton.disabled = true;
  document.body.appendChild(restoreButton);
  restoreButton.addEventListener("click", function () {
    engine.forceRestoreDevice();
    domText.textContent = "Force restore device...";
    restoreButton.disabled = true;
  });
}
