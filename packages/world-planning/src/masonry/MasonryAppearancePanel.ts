import { masonryAppearance, masonryTintRoles } from "@galacean/engine-building/tiny-glade/runtime/MasonryAppearance";

/** Temporary scene-wide material preview. Native components own geometry;
 * this panel only controls shared preview colors, not saved authoring. */
export function mountMasonryAppearancePanel(host: HTMLElement, engine: object) {
  const appearance = masonryAppearance(engine);
  const panel = document.createElement("fieldset");
  panel.dataset.masonryAppearance = "";
  const legend = document.createElement("legend");
  legend.textContent = "建筑材质 · Color 染色";
  const description = document.createElement("p");
  description.textContent =
    "灰度底图 × 原素材 Color。默认还原各贴图层的颜色；建筑 Seed 决定材质变体。配色 Seed 只重排原素材颜色，不另造色相。";
  panel.append(legend, description);
  const seedLabel = document.createElement("label"),
    seedTitle = document.createElement("span"),
    seed = document.createElement("input"),
    random = document.createElement("button"),
    seedHint = document.createElement("small");
  seedTitle.textContent = "配色 Seed";
  seed.type = "number";
  seed.ariaLabel = "配色 Seed";
  seed.min = "0";
  seed.max = String(0xffffffff);
  seed.step = "1";
  seed.required = true;
  seed.style.width = "140px";
  seed.addEventListener("input", () => {
    if (seed.validity.valid) appearance.setSeed(seed.valueAsNumber);
  });
  seed.addEventListener("change", () => {
    if (!seed.validity.valid) seed.value = String(appearance.paletteSeed);
  });
  random.textContent = "随机换一组";
  random.type = "button";
  random.addEventListener("click", () => {
    const next = new Uint32Array(1);
    do crypto.getRandomValues(next);
    while (next[0] === appearance.paletteSeed);
    appearance.setSeed(next[0]);
  });
  seedHint.textContent = "Seed 0 还原原素材颜色。同一 Seed 可复现；当前为临时预览，刷新重置。";
  seedHint.style.cssText = "display:block;opacity:.72;margin:8px 0";
  seedLabel.append(seedTitle, seed);
  panel.append(seedLabel, random, seedHint);
  const labels = ["砖石", "屋瓦", "木材"];
  const fields = masonryTintRoles.map((role, i) => {
    const label = document.createElement("label"),
      title = document.createElement("span"),
      color = document.createElement("input"),
      hex = document.createElement("input"),
      mode = document.createElement("small");
    title.textContent = labels[i] + " Color";
    color.type = "color";
    color.ariaLabel = labels[i] + " Color";
    color.style.cssText = "width:48px;height:32px;padding:2px;flex-shrink:0";
    hex.type = "text";
    hex.ariaLabel = labels[i] + " HEX";
    hex.maxLength = 7;
    hex.pattern = "#[0-9a-fA-F]{6}";
    hex.spellcheck = false;
    hex.style.width = "74px";
    color.addEventListener("input", () => appearance.setColor(role, color.value));
    hex.addEventListener("input", () => {
      if (/^#[\da-f]{6}$/i.test(hex.value)) appearance.setColor(role, hex.value);
    });
    hex.addEventListener("change", () => {
      const value = hex.value.trim();
      if (/^#[\da-f]{6}$/i.test(value)) appearance.setColor(role, value);
      hex.value = appearance.color(role);
    });
    label.append(title, color, hex);
    panel.append(label);
    mode.style.cssText = "display:block;opacity:.72;margin-bottom:8px";
    panel.append(mode);
    return { role, color, hex, mode };
  });
  const reset = document.createElement("button");
  reset.textContent = "恢复 Seed 配色";
  reset.type = "button";
  reset.addEventListener("click", () => appearance.reset());
  panel.append(reset);
  const subscription = appearance.subscribe(() => {
    seed.value = String(appearance.paletteSeed);
    for (const { role, color, hex, mode } of fields) {
      color.value = hex.value = appearance.color(role);
      mode.textContent = appearance.isOverridden(role)
        ? "自定义 Color · 同类材料统一染色"
        : `原素材 Color · 各材质分层还原，色板为${appearance.referenceSeed !== undefined ? "首栋参考" : "加载中"}`;
    }
  });
  host.prepend(panel);
  return {
    destroy() {
      subscription.destroy();
      panel.remove();
    }
  };
}
