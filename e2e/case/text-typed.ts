/**
 * @title TypedText
 * @category Text
 */

import {
  Camera,
  Logger,
  Script,
  TextHorizontalAlignment,
  TextRenderer,
  TextVerticalAlignment,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);

  const entity = rootEntity.createChild("text");
  const textRenderer = entity.addComponent(TextRenderer);
  textRenderer.fontSize = 64;
  textRenderer.horizontalAlignment = TextHorizontalAlignment.Left;
  textRenderer.verticalAlignment = TextVerticalAlignment.Top;
  textRenderer.enableWrapping = true;
  textRenderer.width = 4;

  class TypedText extends Script {
    private _renderer: TextRenderer;
    private _text: string;
    private _index = 0;
    private _charCount = 0;
    private _showText = "";
    private _curTime = 0;
    private _totalTime = 0.1;
    private _isPlaying = false;

    onUpdate(deltaTime: number): void {
      if (this._isPlaying) {
        if (this._curTime >= this._totalTime) {
          if (this._index >= this._charCount) {
            this._isPlaying = false;
            initScreenshot(engine, camera);
          } else {
            this._showText += this._text[this._index++];
            this._renderer.text = this._showText;
          }
          this._curTime = 0;
        } else {
          this._curTime += deltaTime;
        }
      }
    }

    play(textRenderer: TextRenderer, text: string = ""): void {
      this._renderer = textRenderer;
      this._text = text;
      this._index = 0;
      this._charCount = text.length;
      this._showText = "";
      this._curTime = this._totalTime;
      this._isPlaying = true;
    }
  }

  const typedText = entity.addComponent(TypedText);
  typedText.play(textRenderer, "我这一生，走过许多地方的桥儿");

  updateForE2E(engine, 100, 100);
});
