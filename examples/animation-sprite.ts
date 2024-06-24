/**
 * @title Sprite Animation
 * @category Animation
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*RXETR7ycqwoAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  AssetType,
  Camera,
  Sprite,
  SpriteAtlas,
  SpriteRenderer,
  Vector3,
  WebGLEngine,
  AnimationRefCurve,
  AnimationRectCurve,
  Keyframe,
  ReferResource,
  AnimationClip,
  Animator,
  Texture2D,
  Rect,
  InterpolationType,
} from "@galacean/engine";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Create root entity.
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 4);
  cameraEntity.addComponent(Camera).isOrthographic = true;

  const layer = new AnimatorControllerLayer("base");

  const stateMachine = (layer.stateMachine = new AnimatorStateMachine());
  const atlasState = stateMachine.addState("spriteAtlas");
  const regionState = stateMachine.addState("spriteRegion");

  engine.resourceManager
    .load<SpriteAtlas>({
      url: "https://gw.alipayobjects.com/os/bmw-prod/da0bccd4-020a-41d5-82e0-a04f4413d9a6.atlas",
      type: AssetType.SpriteAtlas,
    })
    .then((atlas) => {
      const spriteEntity = rootEntity.createChild();
      spriteEntity.transform.position = new Vector3();
      spriteEntity.transform.scale.set(100 / 32, 100 / 32, 100 / 32);
      spriteEntity.addComponent(SpriteRenderer).sprite =
      atlas.getSprite("npcs-11");

      const spriteCurve = new AnimationRefCurve();
      for (let i = 0; i < 10; ++i) {
        const key = new Keyframe<ReferResource>();
        key.time = i;
        key.value = atlas.getSprite(`npcs-${i}`);
        spriteCurve.addKey(key);
      }
      const spriteClip = new AnimationClip("sprite");
      spriteClip.addCurveBinding("", SpriteRenderer, "sprite", spriteCurve);
      atlasState.clip = spriteClip;

      const animator = spriteEntity.addComponent(Animator);
      const animatorController = new AnimatorController();
      animator.animatorController = animatorController;
      animatorController.addLayer(layer);
      animator.play(atlasState.name);
    });

  // Load texture and create sprite sheet animation.
  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*9nsHSpx28rAAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      const spriteEntity = rootEntity.createChild("Sprite");
      const sprite = new Sprite(engine, texture);
      spriteEntity.addComponent(SpriteRenderer).sprite = sprite;
      const region = sprite.region;
      spriteEntity.transform.position = new Vector3(2, 0, 0);
      const spriteCurve = new AnimationRectCurve();
      spriteCurve.interpolation = InterpolationType.Step;
      for (let i = 0; i <= 3; ++i) {
        const key = new Keyframe<Rect>();
        key.time = i;
        key.value = new Rect((i / 3) % 1, 0, 0.32, 1);
        spriteCurve.addKey(key);
      }
      const spriteClip = new AnimationClip("sprite");
      spriteClip.addCurveBinding(
        "",
        SpriteRenderer,
        "sprite.region",
        spriteCurve
      );
      regionState.clip = spriteClip;

      const animator = spriteEntity.addComponent(Animator);
      const animatorController = new AnimatorController();
      animator.animatorController = animatorController;
      animatorController.addLayer(layer);
      animator.play(regionState.name);
    });

  
  engine.run();
});
