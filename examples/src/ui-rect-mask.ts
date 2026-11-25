/**
 * @title RectMask2D Outside Preview
 * @category UI
 */
import { Camera, Color, Entity, Script, Sprite, Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";
import {
  CanvasRenderMode,
  Image,
  RectMask2D,
  RectMaskMode,
  ResolutionAdaptationMode,
  Text,
  UICanvas,
  UITransform
} from "@galacean/engine-ui";

class HitCounter extends Script {
  label: Text;
  title: string;
  count = 0;
  override onPointerClick(): void {
    this.label.text = `Hits: ${++this.count}`;
    document.getElementById("mask-status")!.textContent = `最近命中：${this.title} · ${this.count} 次`;
  }
}

async function main(): Promise<void> {
  const style = document.createElement("style");
  style.textContent = `
    html, body { background: #101722; color: #e8eef7; font: 14px/1.5 system-ui, sans-serif; }
    body { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
    header { padding: 18px 24px 12px; border-bottom: 1px solid #2b3544; }
    h1 { margin: 0; font-size: 21px; font-weight: 650; }
    p { margin: 5px 0 12px; color: #aab8ca; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 8px 0 12px; font-size: 13px; }
    .parent-key { color: #ff8cb9; } .child-key { color: #67edb0; }
    .controls { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 22px; }
    label { display: inline-flex; align-items: center; gap: 7px; }
    input { accent-color: #55d5c0; } input[type=range] { width: 115px; }
    output { min-width: 20px; font-variant-numeric: tabular-nums; }
    button { background: #243247; color: #e8eef7; border: 1px solid #3c4c63; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
    canvas { display: block; width: 100%; height: 100%; min-height: 0; touch-action: none; }
    footer { padding: 9px 24px; border-top: 1px solid #2b3544; color: #aab8ca; }
  `;
  document.head.appendChild(style);
  const header = document.createElement("header");
  header.innerHTML = `
    <h1>RectMask2D · Outside 验收</h1>
    <p>点击彩色区域应增加 Hits；深色区域已被裁掉。嵌套时同时满足父、子约束。</p>
    <div class="legend"><span class="parent-key">━ 父 / 单层遮罩</span><span class="child-key">━ 子遮罩</span><span>Inside 保留内部 · Outside 排除内部</span></div>
    <div class="controls">
      <label><input id="masks-enabled" type="checkbox" checked>启用遮罩</label>
      <label><input id="guides-enabled" type="checkbox" checked>显示边界</label>
      <button id="reset-hits">清零计数</button>
    </div>`;
  document.body.prepend(header);
  const footer = document.createElement("footer");
  footer.id = "mask-status";
  footer.textContent = "等待点击 · 嵌套遮罩逐层取交集，Image 和 Text 使用相同裁剪。";
  document.body.appendChild(footer);

  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.setAutoResolution();
  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor.set(0.063, 0.09, 0.133, 1);
  const root = scene.createRootEntity("root");
  root.createChild("camera").addComponent(Camera).entity.transform.setPosition(0, 0, 10);
  const ui = root.createChild("UI").addComponent(UICanvas);
  ui.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  ui.referenceResolution.set(1000, 620);
  ui.referenceResolutionPerUnit = 100;
  ui.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;
  const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  const sprite = new Sprite(engine, texture);
  const masks: RectMask2D[] = [];
  const guides: (Image | Text)[] = [];
  const counters: HitCounter[] = [];

  function graphic(
    parent: Entity,
    name: string,
    width: number,
    height: number,
    x: number,
    y: number,
    color: Color
  ): Image {
    const image = parent.createChild(name).addComponent(Image);
    const transform = image.entity.transform as UITransform;
    transform.size.set(width, height);
    transform.setPosition(x, y, 0);
    image.sprite = sprite;
    image.color = color;
    image.raycastEnabled = false;
    return image;
  }

  function label(parent: Entity, value: string, y: number, size = 20): Text {
    const text = parent.createChild("label").addComponent(Text);
    (text.entity.transform as UITransform).size.set(440, 36);
    text.entity.transform.setPosition(0, y, 0);
    text.text = value;
    text.fontSize = size;
    text.color.set(0.9, 0.95, 1, 1);
    return text;
  }

  function mask(parent: Entity, mode: RectMaskMode, width: number, height: number, x = 0): RectMask2D {
    const result = parent.createChild(RectMaskMode[mode]).addComponent(RectMask2D);
    (result.entity.transform as UITransform).size.set(width, height);
    result.entity.transform.setPosition(x, 0, 0);
    result.mode = mode;
    masks.push(result);
    return result;
  }

  function outline(card: Entity, width: number, height: number, mode: RectMaskMode, child = false, x = 0): void {
    const color = child ? new Color(0.13, 0.85, 0.44, 1) : new Color(1, 0.24, 0.48, 1);
    const role = child ? "子" : "父 / 单层";
    const area = mode === RectMaskMode.Inside ? "保留内部" : "排除内部";
    const caption = label(card, `${role}：${area}`, (child ? -1 : 1) * (height / 2 + 14), 18);
    caption.entity.transform.setPosition(x, caption.entity.transform.position.y, 0);
    caption.color = color;
    caption.raycastEnabled = false;
    guides.push(
      graphic(card, "top", width, 2, x, height / 2, color),
      graphic(card, "bottom", width, 2, x, -height / 2, color),
      graphic(card, "left", 2, height, x - width / 2, 0, color),
      graphic(card, "right", 2, height, x + width / 2, 0, color),
      caption
    );
  }

  const titles = ["01  Outside", "02  Inside → Outside", "03  Outside → Outside", "04  Outside → Inside"];
  const colors = [
    new Color(0.12, 0.7, 0.61, 1),
    new Color(0.2, 0.49, 0.88, 1),
    new Color(0.63, 0.39, 0.84, 1),
    new Color(0.91, 0.49, 0.2, 1)
  ];
  for (let i = 0; i < 4; i++) {
    const card = ui.entity.createChild(titles[i]);
    card.transform.setPosition(i % 2 === 0 ? -240 : 240, i < 2 ? 150 : -150, 0);
    graphic(card, "background", 420, 190, 0, 0, new Color(0.09, 0.13, 0.19, 1));
    label(card, titles[i], 118);
    const count = label(card, "Hits: 0", -120, 18);
    let contentParent: Entity;
    if (i === 0) {
      contentParent = mask(card, RectMaskMode.Outside, 120, 80).entity;
    } else if (i === 1) {
      const parent = mask(card, RectMaskMode.Inside, 320, 150);
      contentParent = mask(parent.entity, RectMaskMode.Outside, 120, 80, 30).entity;
    } else if (i === 2) {
      const parent = mask(card, RectMaskMode.Outside, 85, 120, -70);
      contentParent = mask(parent.entity, RectMaskMode.Outside, 85, 120, 140).entity;
    } else {
      const parent = mask(card, RectMaskMode.Outside, 140, 140);
      contentParent = mask(parent.entity, RectMaskMode.Inside, 320, 90).entity;
    }
    const offsetX = i === 1 ? -30 : i === 2 ? -70 : 0;
    const content = graphic(contentParent, "clickable content", 400, 180, offsetX, 0, colors[i]);
    content.raycastEnabled = true;
    label(content.entity, "IMAGE + TEXT · CLICK", 0, 24);
    const counter = content.entity.addComponent(HitCounter);
    counter.label = count;
    counter.title = titles[i];
    counters.push(counter);
    if (i === 0) outline(card, 120, 80, RectMaskMode.Outside);
    if (i === 1) {
      outline(card, 320, 150, RectMaskMode.Inside);
      outline(card, 120, 80, RectMaskMode.Outside, true, 30);
    }
    if (i === 2) {
      outline(card, 85, 120, RectMaskMode.Outside, false, -70);
      outline(card, 85, 120, RectMaskMode.Outside, true, 70);
    }
    if (i === 3) {
      outline(card, 140, 140, RectMaskMode.Outside);
      outline(card, 320, 90, RectMaskMode.Inside, true);
    }
  }

  document.getElementById("masks-enabled")!.addEventListener("change", (event) => {
    masks.forEach((m) => {
      m.enabled = (event.target as HTMLInputElement).checked;
    });
  });
  document.getElementById("guides-enabled")!.addEventListener("change", (event) => {
    guides.forEach((image) => {
      image.enabled = (event.target as HTMLInputElement).checked;
    });
  });
  document.getElementById("reset-hits")!.addEventListener("click", () => {
    counters.forEach((counter) => {
      counter.count = 0;
      counter.label.text = "Hits: 0";
    });
    footer.textContent = "计数已清零";
  });
  engine.run();
}

main();
