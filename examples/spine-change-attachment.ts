/**
 * @title Spine change Attachment
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*IALeTYOXMXwAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Entity, Logger, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "@galacean/engine-spine";

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 100);
  camera.nearClipPlane = 0.001;
  camera.farClipPlane = 20000;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_kz4wfo/uri/file/as/2/kz4wfo/4/mp/24ejL92gvbWxsXRi/mix-and-match/mix-and-match.json",
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = new Entity(engine);
      spineEntity.transform.setPosition(0, -18, 0);
      const spine = spineEntity.addComponent(SpineAnimationRenderer);
      spine.resource = spineResource;
      spine.defaultState.scale = 0.05;
      spine.defaultState.skinName = 'full-skins/girl';
      spine.defaultState.animationName = 'idle';
      rootEntity.addChild(spineEntity);
      const { skeleton } = spine;
      const slot = skeleton.findSlot('body')!;
      // If the attachment is in the same slot of the same skin,
      // you can use skeleton.getAttachment(slot.index, 'attachmentName') to get the attachment from the currentSkin or defaultSkin.
      const skin = skeleton.data.findSkin('full-skins/boy')!;
      const attachment = skin.getAttachment(slot.data.index, 'body');
      // If the attachment is in the same slot of the same skin,
      // you can use skeleton.setAttachment('slotName', 'attachmentName') to change the attachment.
      slot.attachment = attachment;
    });

  engine.run();
});
