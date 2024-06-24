/**
 * @title Lottie Animation
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*tBbxSq6jdHcAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { Camera, Entity, WebGLEngine } from "@galacean/engine";
import { LottieAnimation } from "@galacean/engine-lottie";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const root = engine.sceneManager.activeScene.createRootEntity();

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 10);
  cameraEntity.addComponent(OrbitControl);

  engine.resourceManager
    .load<Entity>({
      urls: [
        "https://gw.alipayobjects.com/os/bmw-prod/b46be138-e48b-4957-8071-7229661aba53.json",
        "https://gw.alipayobjects.com/os/bmw-prod/6447fc36-db32-4834-9579-24fe33534f55.atlas",
      ],
      type: "lottie",
    })
    .then((lottieEntity) => {
      root.addChild(lottieEntity);
      const lottie = lottieEntity.getComponent(LottieAnimation);
      lottie.isLooping = true;
      lottie.play();
    });

  engine.run();
});
