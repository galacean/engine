/**
 * @title Lottie Clips
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*MclFRodjyycAAAAAAAAAAAAADiR2AQ/original
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
        "https://gw.alipayobjects.com/os/bmw-prod/84c13df1-567c-4a67-aa1e-c378ee698c55.json",
        "https://gw.alipayobjects.com/os/bmw-prod/965eb2ca-ee3c-4c54-a502-7fdc0673f1d7.atlas",
      ],
      type: "lottie",
    })
    .then(async (lottieEntity) => {
      root.addChild(lottieEntity);
      lottieEntity.transform.setPosition(0, -3, 0);
      const lottie = lottieEntity.getComponent(LottieAnimation);

      lottie.repeats = 2;
      await lottie.play("beforePlay");
      lottie.repeats = 1;
      await lottie.play("onPlay");
      lottie.play("afterPlay");
    });

  engine.run();
});
