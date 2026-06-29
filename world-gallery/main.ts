// World Engine Gallery landing — same sidebar / search / iframe-preview UX as the engine Playground. A demo
// is any directory under demos/ that has a meta.ts (at any depth, so demos can be grouped under sub-folders);
// discovered via import.meta.glob, so there is no central registry to merge-conflict on.
interface DemoMeta {
  title: string;
  owner: string;
  category: string;
  description: string;
}
interface Demo extends DemoMeta {
  path: string;
}

const modules = import.meta.glob<{ meta: DemoMeta }>("./demos/**/meta.ts", { eager: true });
const demos: Demo[] = Object.entries(modules)
  .map(([file, mod]) => ({ path: file.replace("./demos/", "").replace("/meta.ts", ""), ...mod.meta }))
  .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

const itemListDOM = document.getElementById("itemList")!;
const searchBarDOM = document.getElementById("searchBar") as HTMLInputElement;
const iframe = document.getElementById("iframe") as HTMLIFrameElement;
const fullScreenDOM = document.getElementById("fullScreen")!;

const items: { el: HTMLElement; demo: Demo }[] = [];

const groups = new Map<string, Demo[]>();
for (const demo of demos) {
  if (!groups.has(demo.category)) groups.set(demo.category, []);
  groups.get(demo.category)!.push(demo);
}

let groupIndex = 0;
for (const [category, groupDemos] of groups) {
  const groupDOM = document.createElement("div");
  if (groupIndex++ > 0) groupDOM.classList.add("mt-6");
  const titleDOM = document.createElement("div");
  titleDOM.innerHTML = `
    <div class="flex items-center space-x-2 mb-3">
      <div class="w-1 h-4 bg-gradient-to-b from-galacean-500 to-galacean-700 rounded-full"></div>
      <h3 class="category-title text-sm font-semibold uppercase tracking-wider">${category}</h3>
    </div>`;
  const demosDOM = document.createElement("div");
  demosDOM.classList.add("space-y-1", "mb-4");
  itemListDOM.appendChild(groupDOM);
  groupDOM.appendChild(titleDOM);
  groupDOM.appendChild(demosDOM);

  for (const demo of groupDemos) {
    const el = document.createElement("a");
    el.className = "block cursor-pointer transition-all duration-200 overflow-hidden no-underline rounded-lg";
    el.innerHTML = `
      <div class="flex items-center space-x-3 p-3 rounded-lg demo-item group">
        <div class="w-2 h-2 rounded-full bg-slate-300 group-hover:bg-galacean-500 transition-colors duration-200"></div>
        <span class="flex-1 text-sm font-medium text-slate-700 group-hover:text-slate-900">${demo.title}</span>
        <span class="text-xs text-slate-400">${demo.owner}</span>
      </div>`;
    el.title = demo.description;
    el.onclick = () => {
      window.location.hash = `#${demo.path}`;
    };
    demosDOM.appendChild(el);
    items.push({ el, demo });
  }
}

searchBarDOM.oninput = () => {
  let reg: RegExp;
  try {
    reg = new RegExp(searchBarDOM.value, "i");
  } catch {
    reg = /.*/; // half-typed regex (e.g. a lone "[") — show everything until it's valid
  }
  for (const { el, demo } of items) {
    el.classList.toggle("hide", !(reg.test(demo.title) || reg.test(demo.owner) || reg.test(demo.path)));
  }
};

fullScreenDOM.onclick = () => {
  if (iframe.src) window.open(iframe.src, "_blank");
};

function onHashChange(): void {
  if (!items.length) return;
  const path = decodeURIComponent(window.location.hash.slice(1));
  if (!path) {
    window.location.hash = `#${items[0].demo.path}`;
    return;
  }
  iframe.src = `./demos/${path}/index.html`;
  for (const { el, demo } of items) {
    el.classList.toggle("active", demo.path === path);
  }
}

window.onhashchange = onHashChange;
onHashChange();
