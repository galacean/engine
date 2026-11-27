import { WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { NativePreviewHost } from "./NativePreviewHost.ts";
declare global {
  interface Window {
    farmingNativePreview?: NativePreviewHost;
  }
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
async function main() {
  const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  const resize = () => {
    engine.canvas.setResolution(window.innerWidth, window.innerHeight);
  };
  resize();
  const host = new NativePreviewHost(engine);
  await host.initialize();
  window.farmingNativePreview = host;
  const plot = $<HTMLSelectElement>("plot"),
    seed = $<HTMLSelectElement>("seed"),
    error = $("error");
  plot.innerHTML = host.area.service
    .queryPlots()
    .map((p) => `<option value="${p.plotId}">${p.label}</option>`)
    .join("");
  seed.innerHTML = host.area
    .configuration!.catalog.data.seeds.map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join("");
  plot.onchange = () => {
    host.selectedPlotId = plot.value;
    render();
  };
  function render() {
    const p = host.area.service.getPlot(plot.value);
    $("state").textContent = JSON.stringify(
      {
        farmId: host.area.farmId,
        revision: host.area.service.getSnapshot().revision,
        crop: p?.crop,
        soil: p?.soil,
        inventory: host.area.service.getSnapshot().inventory
      },
      null,
      2
    );
  }
  async function run(task: () => Promise<unknown>) {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
      (b) => b.dataset.action !== "unloadBasket"
    );
    buttons.forEach((b) => (b.disabled = true));
    try {
      error.textContent = "";
      const result = await task();
      if ((result as any)?.ok === false) error.textContent = (result as any).error.message;
      render();
    } catch (e) {
      error.textContent = String(e);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
      $("restore").toggleAttribute("disabled", !saved);
    }
  }
  let saved: Awaited<ReturnType<NativePreviewHost["sceneFile"]>> | undefined;
  host.onChange = render;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]"))
    button.onclick = () => {
      const operation = button.dataset.action!;
      void run(() =>
        host.api.execute(
          operation === "plant"
            ? {
                operation,
                input: {
                  farmId: host.area.farmId,
                  plotId: plot.value,
                  seedId: seed.value
                }
              }
            : operation === "harvest"
              ? {
                  operation,
                  input: {
                    farmId: host.area.farmId,
                    plotId: plot.value,
                    cropInstanceId: host.area.service.getPlot(plot.value)?.crop?.instanceId ?? "missing"
                  }
                }
              : operation === "irrigate"
                ? {
                    operation,
                    input: { farmId: host.area.farmId, plotId: plot.value }
                  }
                : {
                    operation: "unloadBasket",
                    input: {
                      farmId: host.area.farmId,
                      basketId:
                        host.area.service.getSnapshot().items.carried &&
                        "itemId" in host.area.service.getSnapshot().items.carried!
                          ? (
                              host.area.service.getSnapshot().items.carried as {
                                itemId: string;
                              }
                            ).itemId
                          : "missing"
                    }
                  }
        )
      );
    };
  $("advance").onclick = () => void run(() => host.advance(30_000));
  $("save").onclick = () =>
    void run(async () => {
      saved = await host.sceneFile();
      error.textContent = "已保存当前 Scene 检查点";
    });
  $("restore").onclick = () => void run(() => host.restore(saved!));
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", () => void host.dispose().then(() => engine.destroy()), { once: true });
  error.textContent = "";
  render();
  engine.run();
}
void main().catch((error) => {
  $("error").textContent = String(error);
  console.error(error);
});
