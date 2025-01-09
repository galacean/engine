/**
 * @title Spine follow shoot
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*IALeTYOXMXwAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Logger, Script, Vector3, WebGLEngine } from "@galacean/engine";
import { Bone, SpineAnimationRenderer } from "@galacean/engine-spine";

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 20);

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_kz4wfo/uri/file/as/2/kz4wfo/4/mp/yKbdfgijyLGzQDyQ/spineboy/spineboy.json",
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = spineResource.instantiate();
      spineEntity.transform.setPosition(0, -1.8, 0);
      const spine = spineEntity.getComponent(SpineAnimationRenderer);
      rootEntity.addChild(spineEntity);
      const { state, skeleton } = spine;
      state.setAnimation(0, 'idle', true);
      state.setAnimation(1, 'aim', true);
      const shoot = () => {
        state.setAnimation(2, 'shoot', false);
      };
      spineEntity.addComponent(class extends Script {
        private _vec3 = new Vector3();
        onUpdate(): void {
          const { inputManager } = engine;
          const pointers = inputManager.pointers;
          if (pointers.length > 0) {
            const { position } = pointers[0];
            const worldPos = this._vec3;
            camera.screenToWorldPoint(
              new Vector3(position.x, position.y, 20),
              worldPos,
            );
            const targetBone = skeleton.findBone('crosshair') as Bone;
            targetBone.y = worldPos.y + 1.9;
            if (worldPos.x < 0) {
              skeleton.scaleX = -1;
              targetBone.x = -worldPos.x;
            } else {
              skeleton.scaleX = 1;
              targetBone.x = worldPos.x;
            }
          }
          if (inputManager.isPointerDown()) {
            shoot();
          }
        }
      });
    });

  engine.run();
});


