import "./WorldTemplatePicker.css";
import { WORLD_TEMPLATES, worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";

/** Select a world style and Seed.
 * @param host Toolbar that owns the entry button.
 * @param apply Publish and persist the fully initialized document.
 * @param applyPalette Update only material colours in the current project.
 * @param startup Show an initial non-dismissible selection before world initialization.
 * @returns Controls for synchronizing and disposing the picker.
 */
export function mountWorldTemplatePicker(
  host: HTMLElement,
  apply: (id: string, seed: number) => Promise<void>,
  applyPalette?: (id: string) => Promise<void>,
  startup = false
) {
  const entry = document.createElement("button");
  entry.type = "button";
  entry.dataset.action = "world-style";
  entry.textContent = "风格选择";
  entry.setAttribute("aria-haspopup", "dialog");
  const dialog = document.createElement("dialog");
  dialog.className = "sp-template-dialog" + (startup ? " sp-template-startup" : "");
  dialog.setAttribute("aria-labelledby", "world-template-title");
  dialog.innerHTML = `<header><div><p>SEED WORLD / 世界风格</p><h2 id="world-template-title">选择你的世界</h2></div><button type="button" data-close aria-label="关闭风格选择">✕</button></header>
    <p class="sp-template-intro">保留主题布局，周边地貌随 Seed 小幅变化。同一风格与 Seed 可重建同一世界。</p>
    <div class="sp-template-grid" role="group" aria-label="世界风格"></div>
    <footer><label>Seed <input aria-label="风格世界 Seed" type="number" min="0" max="4294967295" step="1" required></label><button type="button" data-random>随机 Seed</button><button type="button" data-palette title="更新当前工程配色，保留布局、建筑、光照和后处理">仅应用配色</button><button type="button" data-apply>应用风格</button><p role="status" aria-live="polite"></p><small>应用风格会替换当前规划参数；仅应用配色保留现有布局与光照。</small></footer>`;
  if (startup) {
    dialog.querySelector("[data-close]")!.remove();
    dialog.querySelector(".sp-template-intro")!.textContent = "选择主题后生成世界。";
    dialog.querySelector("footer small")!.textContent = "同一 Seed 的已有世界保留编辑；切换主题会重新规划。";
    dialog.addEventListener("cancel", event => event.preventDefault());
    entry.hidden = true;
  }
  const input = dialog.querySelector("input")!;
  const submit = dialog.querySelector<HTMLButtonElement>("[data-apply]")!;
  const palette = dialog.querySelector<HTMLButtonElement>("[data-palette]")!;
  palette.hidden = !applyPalette;
  const state = dialog.querySelector<HTMLElement>('[role="status"]')!;
  let selected = "",
    seed = SEMANTIC_DEFAULTS.seed,
    pending = false;
  const entries = [
    {
      id: "",
      name: "原始 Seed World",
      icon: "🏝️",
      subject: "自然群岛 · 村落 · 原始 Seed 生成规则",
      colors: ["#91ae7e", "#e3ecdd", "#bdd8af", "#6f9ba9"]
    },
    ...WORLD_TEMPLATES
  ];
  const cards = entries.map((template) => {
    const card = document.createElement("button");
    card.type = "button";
    card.dataset.template = template.id;
    card.style.setProperty("--template-ground", template.colors[0]);
    card.style.setProperty("--template-accent", template.colors[2]);
    card.style.setProperty("--template-sky", template.colors[3]);
    const art = document.createElement("span");
    art.className = "sp-template-art";
    art.textContent = template.icon;
    const title = document.createElement("strong");
    title.textContent = template.name;
    const detail = document.createElement("span");
    detail.textContent = template.subject;
    card.append(art, title, detail);
    card.onclick = () => {
      selected = template.id;
      refresh();
    };
    dialog.querySelector(".sp-template-grid")!.append(card);
    return card;
  });
  function refresh() {
    cards.forEach((card) => {
      card.setAttribute("aria-pressed", String(card.dataset.template === selected));
      card.disabled = pending;
    });
    submit.textContent = pending ? "正在准备世界…" : `${startup ? "进入" : "应用"}「${worldTemplate(selected)?.name ?? "原始 Seed World"}」`;
    submit.disabled = pending;
    palette.disabled = pending || !selected;
    input.disabled = pending;
    dialog.querySelector<HTMLButtonElement>("[data-random]")!.disabled = pending;
  }
  entry.onclick = () => {
    input.value = String(seed);
    state.textContent = "";
    refresh();
    dialog.showModal();
  };
  const close = dialog.querySelector<HTMLButtonElement>("[data-close]");
  if (close) close.onclick = () => dialog.close();
  dialog.querySelector<HTMLButtonElement>("[data-random]")!.onclick = () => {
    input.value = String(crypto.getRandomValues(new Uint32Array(1))[0]);
  };
  submit.onclick = async () => {
    if (pending || !input.reportValidity() || !Number.isSafeInteger(input.valueAsNumber)) return;
    pending = true;
    refresh();
    state.textContent = "正在应用风格与 Seed…";
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await apply(selected, input.valueAsNumber);
      dialog.close();
    } catch (error) {
      state.textContent = "应用失败：" + String(error);
    } finally {
      pending = false;
      refresh();
    }
  };
  palette.onclick = async () => {
    if (pending || !selected || !applyPalette) return;
    pending = true;
    refresh();
    state.textContent = "正在更新配色…";
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await applyPalette(selected);
      dialog.close();
    } catch (error) {
      state.textContent = "配色更新失败：" + String(error);
    } finally {
      pending = false;
      refresh();
    }
  };
  host.prepend(entry);
  document.body.append(dialog);
  return {
    open() { entry.click(); },
    update(id: unknown, nextSeed: number, disabled: boolean) {
      seed = nextSeed;
      selected = worldTemplate(id)?.id ?? "";
      entry.textContent = worldTemplate(id) ? `风格 · ${worldTemplate(id)!.name}` : "风格选择";
      entry.disabled = disabled;
    },
    dispose() {
      dialog.remove();
      entry.remove();
    }
  };
}
