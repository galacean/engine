import { Camera, Color, Entity, Script } from "@galacean/engine";
import { CanvasRenderMode, Text, UICanvas, UITransform } from "@galacean/engine-ui";
import type { AssetCategory } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";

/** Fixed production-showcase order used by both original and assembled views. */
export const ASSET_STAGE_CATEGORIES: readonly AssetCategory[] = ["tree", "shrub", "grass", "flower", "rock"];

const LABEL_WIDTH = 330;
const LABEL_HEIGHT = 48;
const LABEL_SCALE = 0.014;
/** One readable label width of empty space between assembled stands. */
export const ASSET_STAGE_CLEARANCE = LABEL_WIDTH * LABEL_SCALE;

/** Initial label centers; assembled placement is replaced by the measured stand layout. */
export const ASSET_STAGE_X: Readonly<Record<AssetCategory, number>> = {
  tree: -12,
  shrub: -6,
  grass: 0,
  flower: 6,
  rock: 12
};

/** One world-space GUI label attached below a production asset stand. */
export interface AssetStageLabel {
  /** Stable local identifier used only by the preview scene hierarchy. */
  readonly id: string;
  readonly text: string;
  /** Explicit preview-space X coordinate; standard categories fall back to their assembled stage column. */
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
}

/** Owns camera-facing world-space GUI labels without any DOM scene overlays. */
export class AssetStageLabels {
  private readonly _root: Entity;
  private readonly _texts: Text[] = [];
  private readonly _textsById = new Map<string, Text>();

  /**
   * Creates one shared GUI canvas and a label for every supplied asset stand.
   * @param owner Parent entity for the world-space canvas.
   * @param camera Camera that renders and faces every label.
   * @param labels Category-aligned label text and floor offsets.
   */
  constructor(owner: Entity, camera: Camera, labels: readonly AssetStageLabel[]) {
    this._root = owner.createChild("Asset stand GUI labels");
    const canvas = this._root.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.WorldSpace;
    canvas.renderCamera = camera;
    canvas.referenceResolutionPerUnit = 100;
    canvas.sortOrder = 20;
    for (const label of labels) {
      const x = label.x ?? ASSET_STAGE_X[label.id as AssetCategory];
      if (x === undefined) throw new RangeError(`Asset preview label "${label.id}" requires an X coordinate`);
      const entity = this._root.createChild(`${label.id} GUI label`);
      const text = entity.addComponent(Text);
      const transform = entity.transform as UITransform;
      transform.setPosition(x, label.y ?? 0.18, label.z ?? 4.2);
      transform.setScale(LABEL_SCALE, LABEL_SCALE, LABEL_SCALE);
      transform.size.set(LABEL_WIDTH, LABEL_HEIGHT);
      text.text = label.text;
      text.fontSize = 24;
      text.color = new Color(0.12, 0.17, 0.14, 1);
      this._texts.push(text);
      this._textsById.set(label.id, text);
      const facing = entity.addComponent(WorldGuiFacingCamera);
      facing.camera = camera;
    }
  }

  /**
   * Shows or hides the complete label row.
   * @param visible Whether text renderers remain enabled.
   */
  setVisible(visible: boolean): void {
    for (const text of this._texts) text.enabled = visible;
  }

  /** Filters one specimen together with its geometry. */
  setLabelVisible(id: string, visible: boolean): void {
    const text = this._textsById.get(id);
    if (!text) throw new Error(`Asset preview label "${id}" is unavailable`);
    text.enabled = visible;
  }

  /** Keeps label width proportional to the space reserved by a specimen group. */
  setLabelScale(id: string, scale: number): void {
    const text = this._textsById.get(id);
    if (!text) throw new Error(`Asset preview label "${id}" is unavailable`);
    text.entity.transform.setScale(LABEL_SCALE * scale, LABEL_SCALE * scale, LABEL_SCALE * scale);
  }

  /**
   * Replaces one existing world-space label without rebuilding its canvas.
   * @param id Stable label identifier supplied to the constructor.
   * @param value Complete replacement text.
   */
  setText(id: string, value: string): void {
    const text = this._textsById.get(id);
    if (!text) throw new Error(`Asset preview label "${id}" is unavailable`);
    text.text = value;
  }

  /** Keeps the label attached to its measured stand after size or population changes. */
  setPosition(id: string, x: number, z: number): void {
    const text = this._textsById.get(id);
    if (!text) throw new Error(`Asset preview label "${id}" is unavailable`);
    text.entity.transform.setPosition(x, text.entity.transform.position.y, z);
  }

  /** Releases the owned canvas and all label renderers. */
  destroy(): void {
    this._root.destroy();
    this._texts.length = 0;
    this._textsById.clear();
  }
}

class WorldGuiFacingCamera extends Script {
  camera: Camera | null = null;

  override onLateUpdate(): void {
    const camera = this.camera;
    if (!camera) return;
    this.entity.transform.lookAt(camera.entity.transform.worldPosition);
    this.entity.transform.rotate(0, 180, 0);
  }
}
