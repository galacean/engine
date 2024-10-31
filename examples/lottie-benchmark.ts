/**
 * @title Lottie Benchmark
 * @category Benchmark
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*-d70TJt-KaUAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { Camera, Entity, WebGLEngine } from "@galacean/engine";
import { LottieAnimation } from "@galacean/engine-lottie";
import { Stats } from "@galacean/engine-toolkit-stats";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const root = engine.sceneManager.activeScene.createRootEntity();

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 30);
  cameraEntity.addComponent(OrbitControl);
  cameraEntity.addComponent(Stats);

  engine.resourceManager
    .load<Entity>({
      urls: [
        "https://gw.alipayobjects.com/os/bmw-prod/9ad65a42-9171-47ab-9218-54cf175f6201.json",
        "https://gw.alipayobjects.com/os/bmw-prod/58cde292-8675-4299-b400-d98029b48ac7.atlas",
      ],
      type: "lottie",
    })
    .then((lottieEntity) => {
      for (let i = -4; i < 5; i++) {
        for (let j = -5; j < 6; j++) {
          const clone = lottieEntity.clone();
          clone.transform.setPosition(i * 2, j * 2, 0);
          root.addChild(clone);
          const lottie = clone.getComponent(LottieAnimation);
          lottie.isLooping = true;
          lottie.speed = 0.2 + Math.random() * 2;
          lottie.play();
        }
      }
    });

  engine.run();
});
