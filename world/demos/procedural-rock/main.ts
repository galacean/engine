import "./OutlinePanel.js";
import { setViewerActive } from "./Viewer";
let rockPanel: Promise<unknown> | undefined;
const tabs = ["rock", "outline"] as const;
function selectTab(id: (typeof tabs)[number]) {
  for (const name of tabs) {
    const selected = name === id;
    document.getElementById(`${name}-panel`)!.hidden = !selected;
    const tab = document.getElementById(`${name}-tab`)!;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  if (id === "rock") rockPanel ??= import("./RockPanel.js");
  setViewerActive(id === "rock");
  history.replaceState(null, "", `#${id}`);
}
for (const [index, id] of tabs.entries()) {
  const button = document.getElementById(`${id}-tab`)!;
  button.addEventListener("click", () => selectTab(id));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "rock" : event.key === "End" ? "outline" : tabs[1 - index];
    selectTab(next);
    document.getElementById(`${next}-tab`)!.focus();
  });
}
function selectFromHash() {
  selectTab(location.hash === "#outline" ? "outline" : "rock");
}
window.addEventListener("hashchange", selectFromHash);
selectFromHash();
