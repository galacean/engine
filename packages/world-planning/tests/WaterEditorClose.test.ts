import { expect, it, vi } from "vitest";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";

it("drains a pending edit, restores the real editor after close-save failure, and retries through the panel", async () => {
  const iframe = document.createElement("iframe");
  iframe.src = "/world/demos/water/editor/index.html";
  document.body.append(iframe);
  const view = iframe.contentWindow as Window & {
    nativeWaterEditor: { native: RuntimeNativeEditor; project: RuntimeProjectSession };
    closeNativeWaterEditor(): Promise<void>;
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let restore = () => {};
  try {
    await vi.waitFor(() => expect(view.document.body.dataset.ready).toBe("true"), { timeout: 45000 });
    const { native, project } = view.nativeWaterEditor;
    const panel = view.document.querySelector<HTMLDetailsElement>("#native-water-editor")!;
    panel.open = true;
    const button = (selector: string) => panel.querySelector<HTMLButtonElement>(selector)!;
    const output = () => panel.querySelector("output")!.textContent;
    const target = native.projection.queryComponents({ type: "WaterBodyComponent" })[0];
    const visible = () => (native.projection.readComponent(target).props!.authoring as { visible: boolean }).visible;
    const initialVisible = visible();
    const begin = native.beginEdit.bind(native);
    let preparing = false;
    const editSpy = vi.spyOn(native, "beginEdit").mockImplementation((...args) => {
      const edit = begin(...args),
        prepare = edit.prepare.bind(edit);
      edit.prepare = async (signal) => {
        preparing = true;
        await gate;
        return prepare(signal);
      };
      return edit;
    });
    const flush = project.flush.bind(project);
    const flushSpy = vi
      .spyOn(project, "flush")
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockImplementation(flush);
    restore = () => {
      editSpy.mockRestore();
      flushSpy.mockRestore();
    };
    panel.querySelector<HTMLInputElement>("[data-visible]")!.checked = !initialVisible;
    button("[data-apply]").click();
    await vi.waitFor(() => expect(preparing).toBe(true));
    const closing = view.closeNativeWaterEditor().catch((error: unknown) => error);
    expect(flushSpy).not.toHaveBeenCalled();
    expect(button("[data-save]").disabled).toBe(true);
    release();
    expect(String(await closing)).toContain("Storage unavailable");
    expect(panel.isConnected).toBe(true);
    expect(visible()).toBe(!initialVisible);
    expect(output()).toContain("Storage unavailable");
    expect(button("[data-save]").disabled).toBe(false);
    button("[data-save]").click();
    await vi.waitFor(() => expect(output()).toBe("保存完成。"));
    expect(panel.isConnected).toBe(true);
    // Interactions, rather than just enabled button styles, must recover.
    button("[data-undo]").click();
    await vi.waitFor(() => expect(visible()).toBe(initialVisible));
    await vi.waitFor(() => expect(button("[data-close]").disabled).toBe(false));
    button("[data-close]").click();
    await vi.waitFor(() => expect(view.document.body.dataset.ready).toBe("false"));
    expect(panel.isConnected).toBe(false);
    expect(view.document.body.textContent).toContain("工程已保存并关闭");
    expect(flushSpy).toHaveBeenCalledTimes(3);
  } finally {
    release();
    restore();
    await view.closeNativeWaterEditor?.().catch(() => {});
    iframe.remove();
  }
});
