import { RetrievalClient } from "../index";

const client = new RetrievalClient(new URL("./library/catalog/manifest.json", location.href).href);
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const details = document.querySelector<HTMLPreElement>("#details")!;
const show = async (action: () => Promise<unknown>) => {
  try {
    const value = await action();
    details.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch (error) {
    details.textContent = String(error);
  }
};
document.querySelector("#search")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "搜索中…";
  try {
    const result = await client.searchAssets({ query: document.querySelector<HTMLInputElement>("#query")!.value });
    const rows = result.matches.map((candidate) => {
      const li = document.createElement("li");
      li.textContent = `${candidate.name}：${candidate.descriptionExcerpt}`;
      const description = document.createElement("button");
      description.textContent = "完整描述";
      description.onclick = () =>
        void show(() => client.readAssetDescriptions({ descriptionPaths: [candidate.descriptionPath] }));
      const readme = document.createElement("button");
      readme.textContent = "使用说明";
      readme.onclick = () =>
        void show(() => client.readText(candidate.descriptionPath.replace(/describe\.json$/, "README.md")));
      const resource = document.createElement("button");
      resource.textContent = "物料地址";
      resource.onclick = () => void show(() => client.resolveResource(`/oss/${candidate.assetPaths[0]}`));
      li.append(description, readme, resource);
      return li;
    });
    document.querySelector("#results")!.replaceChildren(...rows);
    status.textContent = `${result.matchedCount} 个候选；当前显示 ${result.matches.length} 个`;
  } catch (error) {
    status.textContent = String(error);
  }
});
window.addEventListener("pagehide", () => client.dispose());
