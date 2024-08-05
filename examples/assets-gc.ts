/**
 * @title Sprite Garbage Collection
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*iPKuQKHfp1QAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AssetType,
  Camera,
  Entity,
  Sprite,
  SpriteRenderer,
  Texture2D,
  WebGLEngine,
} from "@galacean/engine";
import { GUI } from "dat.gui";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  const { resourceManager } = engine;

  let root: Entity | null = engine.sceneManager.scenes[0].createRootEntity();
  root.createChild().addComponent(Camera).isOrthographic = true;
  engine.canvas.resizeByClientSize();

  resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ApFPTZSqcMkAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      if (!root) return;
      const entity = root.createChild();
      entity.transform.position.set(0, 0, -1);
      const renderer = entity.addComponent(SpriteRenderer);
      renderer.sprite = new Sprite(engine, texture);
      engine.run();
    });

  new GUI().add(
    {
      GC: () => {
        if (!root) return;
        root.destroy();
        root = null;
        resourceManager.gc();
      },
    },
    "GC"
  );
});
