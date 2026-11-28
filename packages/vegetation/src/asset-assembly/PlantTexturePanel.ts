import type { PlantTexturePreview } from "./ProceduralPlantMaterialBindings";

const ROLE_NAMES = {
  bark: "树皮",
  leaf: "叶片",
  shrub: "植物枝叶",
  grass: "草",
  flower: "花卉",
  mushroom: "蘑菇"
};

/** Displays the same image URLs used by the plant materials, without creating texture assets. */
export class PlantTexturePanel {
  private readonly _events = new AbortController();
  private readonly _grid: HTMLElement;
  private readonly _summary: HTMLElement;
  private readonly _dialog: HTMLDialogElement;
  private _key = "";

  constructor(private readonly _root: HTMLElement) {
    _root.classList.add("plant-textures");
    _root.dataset.textureMode = "rgba";
    _root.innerHTML = `
      <h3>贴图预览</h3>
      <p class="plant-textures__summary" aria-live="polite"></p>
      <div class="plant-textures__modes" role="group" aria-label="贴图显示通道">
        <button type="button" data-texture-mode="rgba" aria-pressed="true">灰度＋透明</button>
        <button type="button" data-texture-mode="alpha" aria-pressed="false">Alpha 黑白</button>
      </div>
      <p class="plant-textures__hint">灰度保存明暗，Alpha 保存轮廓；颜色由独立实例参数控制 · 点击图片放大</p>
      <div class="plant-textures__grid"></div>
      <dialog class="plant-textures__dialog" aria-label="植被贴图大图">
        <header><div><strong data-texture-title></strong><p data-texture-details></p></div>
          <button type="button" data-texture-close aria-label="关闭贴图大图">关闭 ×</button></header>
        <div class="plant-textures__modes" role="group" aria-label="大图显示通道">
          <button type="button" data-texture-mode="rgba" aria-pressed="true">灰度＋透明</button>
          <button type="button" data-texture-mode="alpha" aria-pressed="false">Alpha 黑白</button>
        </div>
        <p class="plant-textures__hint">灰度保存明暗，Alpha 保存轮廓；颜色由独立实例参数控制 · 点击图片放大</p>
        <div class="plant-textures__image plant-textures__large"><img alt="" /></div>
        <a data-texture-original target="_blank" rel="noopener">打开原始 PNG ↗</a>
      </dialog>`;
    this._grid = _root.querySelector(".plant-textures__grid")!;
    this._summary = _root.querySelector(".plant-textures__summary")!;
    this._dialog = _root.querySelector("dialog")!;
    const { signal } = this._events;
    _root.addEventListener(
      "click",
      (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button[data-texture-mode]");
        if (button) this._setMode(button.dataset.textureMode!);
      },
      { signal }
    );
    this._dialog
      .querySelector("[data-texture-close]")!
      .addEventListener("click", () => this._dialog.close(), { signal });
    this._dialog.addEventListener(
      "click",
      (event) => {
        if (event.target !== this._dialog) return;
        const rect = this._dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          this._dialog.close();
      },
      { signal }
    );
  }

  render(previews: readonly PlantTexturePreview[], scope: string): void {
    const key = JSON.stringify([scope, previews]);
    if (key === this._key) return;
    this._key = key;
    this._dialog.close();
    this._summary.textContent = `${scope} · ${previews.length} 张独立灰度图（共用部件已去重，最长边 ≤256）`;
    this._grid.dataset.count = String(previews.length);
    this._grid.replaceChildren(
      ...previews.map((preview) => {
        const figure = document.createElement("figure");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "plant-textures__image";
        button.setAttribute("aria-label", `放大 ${preview.id}`);
        const image = document.createElement("img");
        image.alt = preview.id;
        image.loading = "lazy";
        image.decoding = "async";
        image.src = preview.url;
        const status = document.createElement("span");
        status.className = "plant-textures__error";
        status.hidden = true;
        status.textContent = "图片加载失败 · 点击打开原图";
        image.addEventListener(
          "error",
          () => {
            status.hidden = false;
          },
          { once: true }
        );
        button.append(image, status);
        button.addEventListener("click", () => this._open(preview));
        const caption = document.createElement("figcaption");
        const title = document.createElement("strong");
        title.textContent = preview.roles.map((role) => ROLE_NAMES[role]).join(" / ");
        const filename = document.createElement("span");
        filename.className = "plant-textures__filename";
        filename.textContent = preview.id;
        const size = document.createElement("span");
        size.textContent = `${preview.width} × ${preview.height} · ${preview.assetCount} 个当前样本使用`;
        caption.append(title, filename, size);
        const colours = document.createElement("span");
        colours.className = "plant-textures__colours";
        colours.append("实例颜色 ");
        for (const colour of preview.baseColors) {
          const swatch = document.createElement("span");
          const hex =
            "#" +
            colour
              .map((channel) => {
                const srgb = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
                return Math.round(srgb * 255)
                  .toString(16)
                  .padStart(2, "0");
              })
              .join("");
          swatch.className = "plant-textures__swatch";
          swatch.style.backgroundColor = hex;
          swatch.title = `实例颜色 ${hex}（独立于灰度贴图）`;
          swatch.setAttribute("role", "img");
          swatch.setAttribute("aria-label", swatch.title);
          colours.append(swatch);
        }
        caption.append(colours);
        figure.append(button, caption);
        return figure;
      })
    );
  }

  destroy(): void {
    this._dialog.close();
    this._events.abort();
    this._root.replaceChildren();
  }

  private _setMode(mode: string): void {
    this._root.dataset.textureMode = mode;
    this._root.querySelectorAll<HTMLButtonElement>("button[data-texture-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.textureMode === mode));
    });
    this._root.querySelectorAll<HTMLElement>(".plant-textures__hint").forEach((hint) => {
      hint.textContent =
        mode === "alpha"
          ? "同一张图的 Alpha 通道 · 白色可见，黑色透明"
          : "灰度保存明暗，Alpha 保存轮廓；颜色由独立实例参数控制 · 点击图片放大";
    });
  }

  private _open(preview: PlantTexturePreview): void {
    this._dialog.querySelector<HTMLElement>("[data-texture-title]")!.textContent = preview.id;
    this._dialog.querySelector<HTMLElement>("[data-texture-details]")!.textContent =
      `${preview.roles.map((role) => ROLE_NAMES[role]).join(" / ")} · ${preview.width} × ${preview.height} · ${preview.assetCount} 个当前样本使用`;
    const image = this._dialog.querySelector("img")!;
    image.src = preview.url;
    image.alt = preview.id;
    this._dialog.querySelector<HTMLAnchorElement>("[data-texture-original]")!.href = preview.url;
    this._dialog.showModal();
  }
}
