/**
 * @title Text Chunk Leak
 * @category 2D
 */
import {
  Camera,
  Color,
  Entity,
  Script,
  WebGLEngine,
  TextHorizontalAlignment,
} from "@galacean/engine";
import {
  CanvasRenderMode,
  registerGUI,
  Text,
  UICanvas,
  UITransform,
} from "@galacean/engine-ui";

registerGUI();

/**
 * Bug reproduction:
 *
 * Text components share a single PrimitiveChunk (vertex buffer).
 * When entity.isActive = false, _onDisableInScene does NOT call
 * _freeTextChunks(), so the inactive Text's vertices remain in the
 * shared buffer and are still drawn.
 *
 * Steps:
 * 1. Text A ("得分：48") renders at top (allocates SubChunk in shared buffer)
 * 2. After 3s, Text A's parent is disabled (isActive=false)
 *    → SubChunk NOT freed, vertices remain in buffer
 * 3. Text B ("历史最高：48") activates at center
 *    → allocates new SubChunk in SAME PrimitiveChunk
 * 4. Draw call submits entire buffer → Text A's old vertices still drawn
 */
class Controller extends Script {
  textA_parent: Entity;
  textB_parent: Entity;
  textAScore: Text;

  private _elapsed = 0;
  private _score = 0;
  private _switched = false;

  onUpdate(dt: number) {
    this._elapsed += dt;

    if (!this._switched) {
      // Update score every 0.3s to trigger chunk reallocation
      if (this._elapsed > 0.3) {
        this._elapsed -= 0.3;
        this._score += Math.floor(Math.random() * 10) + 1;
        this.textAScore.text = "" + this._score;
      }
      // After score > 40, switch panels
      if (this._score > 40) {
        this._switched = true;
        // Hide panel A → chunks NOT freed (the bug)
        this.textA_parent.isActive = false;
        // Show panel B
        this.textB_parent.isActive = true;
      }
    }
  }
}

async function main() {
  const engine = await WebGLEngine.create({
    canvas: document.getElementById("canvas") as HTMLCanvasElement,
  });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor.set(0.35, 0.3, 0.25, 1);
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;
  camera.orthographicSize = 5;

  // UICanvas
  const canvasEntity = rootEntity.createChild("Canvas");
  const uiCanvas = canvasEntity.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  uiCanvas.referenceResolutionX = 750;
  uiCanvas.referenceResolutionY = 1334;

  // ========== Panel A: HUD (visible initially) ==========
  const panelA = canvasEntity.createChild("panelA");

  const labelA = panelA.createChild("labelA");
  labelA.getComponent(UITransform).setPosition(-40, 300, 0);
  const textA = labelA.addComponent(Text);
  textA.text = "得分：";
  textA.fontSize = 36;
  textA.color = new Color(1, 1, 1, 1);
  textA.enableWrapping = true;

  const scoreA = panelA.createChild("scoreA");
  scoreA.getComponent(UITransform).setPosition(60, 300, 0);
  const textAScore = scoreA.addComponent(Text);
  textAScore.text = "0";
  textAScore.fontSize = 36;
  textAScore.color = new Color(1, 1, 1, 1);
  textAScore.enableWrapping = true;

  // ========== Panel B: GameOver (hidden initially) ==========
  const panelB = canvasEntity.createChild("panelB");
  panelB.isActive = false;

  const labelB1 = panelB.createChild("labelB1");
  labelB1.getComponent(UITransform).setPosition(-60, 50, 0);
  const textB1 = labelB1.addComponent(Text);
  textB1.text = "历史最高：";
  textB1.fontSize = 40;
  textB1.color = new Color(1, 1, 1, 1);
  textB1.enableWrapping = true;

  const scoreB1 = panelB.createChild("scoreB1");
  scoreB1.getComponent(UITransform).setPosition(120, 50, 0);
  const textBScore1 = scoreB1.addComponent(Text);
  textBScore1.text = "99";
  textBScore1.fontSize = 40;
  textBScore1.color = new Color(1, 1, 1, 1);
  textBScore1.enableWrapping = true;

  const labelB2 = panelB.createChild("labelB2");
  labelB2.getComponent(UITransform).setPosition(-60, -50, 0);
  const textB2 = labelB2.addComponent(Text);
  textB2.text = "当前得分：";
  textB2.fontSize = 40;
  textB2.color = new Color(1, 1, 1, 1);
  textB2.enableWrapping = true;

  const scoreB2 = panelB.createChild("scoreB2");
  scoreB2.getComponent(UITransform).setPosition(120, -50, 0);
  const textBScore2 = scoreB2.addComponent(Text);
  textBScore2.text = "0";
  textBScore2.fontSize = 40;
  textBScore2.color = new Color(1, 1, 1, 1);
  textBScore2.enableWrapping = true;

  // ========== Controller ==========
  const ctrl = rootEntity.addComponent(Controller);
  ctrl.textA_parent = panelA;
  ctrl.textB_parent = panelB;
  ctrl.textAScore = textAScore;

  engine.run();
}

main();
