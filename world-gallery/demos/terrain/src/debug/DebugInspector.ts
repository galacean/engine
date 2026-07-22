import * as dat from "dat.gui";

interface DatGuiInternals {
  readonly __ul: HTMLUListElement;
  onResize(): void;
}

/** Configuration for a click-selectable image preview in a debug inspector. */
export interface DebugImagePreviewOptions {
  /** Text shown next to the image thumbnail. */
  label: string;
  /** Image resource displayed by the thumbnail. */
  src: string;
  /** Invoked after the preview becomes the active preview in its inspector. */
  onSelect?: () => void;
}

/** A shared dat.gui wrapper for diagnostic pages with folders and selectable texture previews. */
export class DebugInspector {
  /** Underlying dat.gui instance for standard controllers and folders. */
  readonly gui: dat.GUI;

  private _activePreview: HTMLButtonElement | null = null;

  /**
   * Creates a dark inspector panel suitable for a WebGL diagnostic page.
   * @param title Accessible label used to identify this inspector instance.
   */
  constructor(title: string) {
    installInspectorStyles();
    this.gui = new dat.GUI({ width: 352 });
    this.gui.domElement.classList.add("debug-inspector");
    this.gui.domElement.setAttribute("aria-label", title);
    const titleElement = this.gui.domElement.querySelector<HTMLElement>(".title");
    if (titleElement) titleElement.textContent = title;
  }

  /**
   * Creates a collapsible controller group.
   * @param title Group title.
   * @param open Whether the group starts expanded.
   * @returns The native dat.gui folder for standard controller registration.
   */
  folder(title: string, open = true): dat.GUI {
    return this._configureFolder(this.gui.addFolder(title), open);
  }

  /**
   * Creates a nested collapsible controller group.
   * @param parent Parent group that owns the nested group.
   * @param title Group title.
   * @param open Whether the group starts expanded.
   * @returns The native dat.gui folder for standard controller registration.
   */
  subfolder(parent: dat.GUI, title: string, open = true): dat.GUI {
    return this._configureFolder(parent.addFolder(title), open);
  }

  /**
   * Appends an image thumbnail that tracks its selected state within this inspector.
   * @param folder Folder that owns the preview.
   * @param options Preview label, image URL, and selection callback.
   * @returns A function that marks this preview active without invoking its callback.
   */
  addImagePreview(folder: dat.GUI, options: DebugImagePreviewOptions): () => void {
    const list = folderControllerList(folder);

    const item = document.createElement("li");
    item.className = "debug-inspector__preview-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "debug-inspector__preview";
    button.title = options.label;
    button.setAttribute("aria-label", options.label);

    const image = document.createElement("img");
    image.src = options.src;
    image.alt = "";
    image.loading = "lazy";
    const label = document.createElement("span");
    label.textContent = options.label;
    button.append(image, label);
    button.addEventListener("click", () => {
      this._selectPreview(button);
      options.onSelect?.();
    });
    item.append(button);
    list.append(item);
    refreshFolderLayout(folder);

    return () => this._selectPreview(button);
  }

  /**
   * Appends a read-only diagnostic text block.
   * @param folder Folder that owns the readout.
   * @param label Readout label.
   * @returns A function that replaces the displayed text.
   */
  addReadout(folder: dat.GUI, label: string): (value: string) => void {
    const list = folderControllerList(folder);

    const item = document.createElement("li");
    item.className = "debug-inspector__readout-row";
    const heading = document.createElement("span");
    heading.textContent = label;
    const output = document.createElement("pre");
    output.className = "debug-inspector__readout";
    item.append(heading, output);
    list.append(item);
    refreshFolderLayout(folder);
    return (value) => {
      output.textContent = value;
    };
  }

  /** Releases the dat.gui panel and its DOM listeners. */
  destroy(): void {
    this.gui.destroy();
  }

  private _configureFolder(folder: dat.GUI, open: boolean): dat.GUI {
    if (open) folder.open();
    else folder.close();
    this._installFolderToggle(folder);
    return folder;
  }

  private _selectPreview(button: HTMLButtonElement): void {
    this._activePreview?.classList.remove("is-active");
    button.classList.add("is-active");
    this._activePreview = button;
  }

  private _installFolderToggle(folder: dat.GUI): void {
    const title = folder.domElement.querySelector<HTMLElement>(".title");
    if (!title) return;
    const list = title.parentElement;
    if (!list) return;
    title.tabIndex = 0;
    title.setAttribute("role", "button");
    title.classList.add("debug-inspector__folder-title");
    const sync = () => {
      const collapsed = folder.closed;
      title.classList.toggle("is-collapsed", collapsed);
      title.setAttribute("aria-expanded", String(!collapsed));
    };
    const toggle = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (folder.closed) folder.open();
      else folder.close();
      sync();
    };
    title.addEventListener("click", toggle, true);
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") toggle(event);
    });
    sync();
  }
}

function folderControllerList(folder: dat.GUI): HTMLUListElement {
  const internals = folder as dat.GUI & DatGuiInternals;
  if (!internals.__ul) throw new Error(`[DebugInspector] folder "${folder.name}" has no controller list`);
  return internals.__ul;
}

function refreshFolderLayout(folder: dat.GUI): void {
  (folder as dat.GUI & DatGuiInternals).onResize();
}

function installInspectorStyles(): void {
  if (document.getElementById("debug-inspector-styles")) return;
  const style = document.createElement("style");
  style.id = "debug-inspector-styles";
  style.textContent = `
    .debug-inspector.dg.main { --debug-accent: #63b0ff; --debug-panel: #1d222b; --debug-field: #15191f; position: fixed; top: 0; right: 0; max-height: 100vh; margin-right: 0; overflow-x: hidden !important; overflow-y: auto !important; overscroll-behavior: contain; scrollbar-gutter: stable; background: var(--debug-panel); border: 1px solid #344151; box-shadow: 0 16px 42px rgba(0, 0, 0, 0.42); }
    .debug-inspector .close-button { display: none; }
    .debug-inspector > .title { background: #303d50; color: #f2f6fb; font-weight: 700; }
    .debug-inspector li.folder { margin-left: 9px; border-left: 1px solid #3a4b5f; }
    .debug-inspector li.folder > ul > .title { position: relative; padding-left: 23px; background: #232b36; color: #dce7f4; }
    .debug-inspector li.folder > ul > .title::before { position: absolute; left: 8px; color: var(--debug-accent); content: "▾"; transition: transform 0.14s ease; }
    .debug-inspector li.folder > ul > .title.is-collapsed::before { content: "▸"; }
    .debug-inspector .title { cursor: pointer; user-select: none; }
    .debug-inspector .title:focus-visible { outline: 2px solid var(--debug-accent); outline-offset: -2px; }
    .debug-inspector .c input[type=text],
    .debug-inspector .c input[type=number],
    .debug-inspector .c select { background: var(--debug-field); color: #eef5ff; border-left-color: #3d4b5c; }
    .debug-inspector .property-name { color: #c4cfdd; }
    .debug-inspector .cr.boolean .property-name { color: #e0e9f5; }
    .debug-inspector .slider { background: #3c4b5c; }
    .debug-inspector .slider-fg { background: var(--debug-accent); }
    .debug-inspector::-webkit-scrollbar { width: 8px; }
    .debug-inspector::-webkit-scrollbar-track { background: #131821; }
    .debug-inspector::-webkit-scrollbar-thumb { border-radius: 8px; background: #52657b; }
    .debug-inspector__preview-row { height: auto !important; padding: 5px !important; }
    .debug-inspector ul.closed > .debug-inspector__preview-row,
    .debug-inspector ul.closed > .debug-inspector__readout-row { height: 0 !important; overflow: hidden; padding-top: 0 !important; padding-bottom: 0 !important; }
    .debug-inspector__preview { display: grid; grid-template-columns: 54px minmax(0, 1fr); width: 100%; gap: 8px; align-items: center; padding: 5px; color: #d4e0ed; background: var(--debug-field); border: 1px solid transparent; border-radius: 3px; cursor: pointer; font: inherit; text-align: left; }
    .debug-inspector__preview:hover { border-color: #6a7f98; }
    .debug-inspector__preview.is-active { border-color: var(--debug-accent); box-shadow: inset 0 0 0 1px var(--debug-accent); background: #172536; }
    .debug-inspector__preview img { width: 54px; height: 54px; object-fit: cover; image-rendering: auto; background: #080a0d; }
    .debug-inspector__readout-row { height: auto !important; padding: 6px !important; color: #c5d0dc; }
    .debug-inspector__readout-row > span { display: block; margin-bottom: 4px; color: #8fa1b3; }
    .debug-inspector__readout { max-height: 160px; margin: 0; overflow: auto; padding: 7px; color: #d6e5f5; background: var(--debug-field); border: 1px solid #344151; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; }
  `;
  document.head.append(style);
}
