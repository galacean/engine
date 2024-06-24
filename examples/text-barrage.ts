/**
 * @title Text Barrage
 * @category Benchmark
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*z0fYTriO8-YAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  Color,
  Font,
  Script,
  TextHorizontalAlignment,
  TextRenderer,
  WebGLEngine,
} from "@galacean/engine";
import { Stats } from "@galacean/engine-toolkit-stats";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  engine.run();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("camera_entity");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 10);
  camera.isOrthographic = true;
  cameraEntity.addComponent(Stats);

  // Create text barrage
  const textCount = 50;
  for (let i = 0; i < textCount; ++i) {
    const textEntity = rootEntity.createChild();

    // Init text renderer
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.font = Font.createFromOS(engine, "Arial");
    textRenderer.fontSize = 36;
    textRenderer.priority = i;
    textRenderer.horizontalAlignment = TextHorizontalAlignment.Right;

    // Init and reset text barrage animation
    const barrage = textEntity.addComponent(TextBarrageAnimation);
    barrage.camera = camera;
    barrage.priorityOffset = textCount;
    barrage.play();
  }
});

class TextBarrageAnimation extends Script {
  // prettier-ignore
  static words = [ "GALACEAN", "galacean", "HELLO", "hello", "WORLD", "world", "TEXT", "text", "PEACE", "peace", "LOVE", "love", "abcdefg", "hijklmn", "opqrst", "uvwxyz", "ABCDEFG", "HIJKLMN", "OPQRST", "UVWXYZ", "~!@#$", "%^&*", "()_+" ];
  static colors = [
    new Color(1, 1, 1, 1),
    new Color(1, 0, 0, 1),
    new Color(0, 1, 0.89, 1),
  ];

  public camera: Camera;
  public priorityOffset: number = 0;

  private _speed: number = 0;
  private _range: number = 0;
  private _isPlaying: boolean = false;
  private _textRenderer: TextRenderer;

  play() {
    this._isPlaying = true;
  }

  onStart(): void {
    this._textRenderer = this.entity.getComponent(TextRenderer);
    this._range = -this.camera.orthographicSize * this.camera.aspectRatio;
    this._reset(true);
  }

  onUpdate(dt: number): void {
    if (this._isPlaying) {
      const { position } = this.entity.transform;
      position.x += this._speed * dt;
      if (position.x < this._range) {
        this._reset(false);
      }
    }
  }

  private _reset(isFirst: boolean) {
    const textRenderer = this._textRenderer;
    const { words, colors } = TextBarrageAnimation;

    // Reset priority for renderer
    textRenderer.priority += this.priorityOffset;

    // Reset the text to render
    const wordLastIndex = words.length - 1;
    textRenderer.text = `${words[getRandomNum(0, wordLastIndex)]} ${
      words[getRandomNum(0, wordLastIndex)]
    } ${getRandomNum(0, 99)}`;

    // Reset color
    textRenderer.color = colors[getRandomNum(0, colors.length - 1)];

    // Reset position
    const { position } = this.entity.transform;
    const { orthographicSize } = this.camera;
    if (isFirst) {
      const halfOrthoWidth = orthographicSize * this.camera.aspectRatio;
      position.x = getRandomNum(-halfOrthoWidth, halfOrthoWidth);
    } else {
      const { bounds } = textRenderer;
      position.x =
        orthographicSize * this.camera.aspectRatio +
        bounds.max.x -
        bounds.min.x;
    }
    position.y = getRandomNum(-orthographicSize, orthographicSize);

    // Reset speed
    this._speed = getRandomNum(-500, -200) * 0.01;
  }
}

function getRandomNum(min: number, max: number): number {
  const range = max - min;
  const rand = Math.random();
  return min + Math.round(rand * range);
}
