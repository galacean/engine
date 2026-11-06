/** Local fixture generation only; OSS synchronization belongs to the caller's skill. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRetrievalCatalog } from "../src/build";
import type { SourceAsset } from "../src/contracts";

async function main() {
  const root = resolve(
    process.argv[3] ?? resolve(dirname(fileURLToPath(import.meta.url)), "../examples/public/library")
  );
  const baseUrl = process.argv[2] ?? "http://127.0.0.1:4176/library/";
  const samples = [
    {
      id: "box",
      name: "高方盒",
      description: "两米宽三米高四米深的方盒网格，用于箱子和建筑占位。",
      width: 2,
      height: 3,
      depth: 4
    },
    {
      id: "platform",
      name: "宽平台",
      description: "六米宽一米高六米深的方形平台网格，用于地台和台阶。",
      width: 6,
      height: 1,
      depth: 6
    },
    {
      id: "pillar",
      name: "细立柱",
      description: "半米宽五米高的细长立柱网格，用于柱子和支撑结构。",
      width: 0.5,
      height: 5,
      depth: 0.5
    }
  ];
  const sources: SourceAsset[] = [];
  for (const sample of samples) {
    const directory = `assets/meshes/${sample.id}`;
    const key = `${directory}/describe.json`,
      mesh = `${directory}/${sample.id}.mesh`,
      readme = `${directory}/README.md`;
    const metadata = {
      version: "0.0.1",
      assetType: "mesh",
      assetPaths: [mesh],
      overview: { name: sample.name, description: sample.description, tags: ["方盒", "网格"] },
      usage: { description: "导入为 PrimitiveMesh，绑定到渲染器后使用。" },
      technical: { width: sample.width, height: sample.height, depth: sample.depth }
    };
    await mkdir(resolve(root, directory), { recursive: true });
    await writeFile(resolve(root, key), JSON.stringify(metadata, null, 2) + "\n");
    await writeFile(
      resolve(root, mesh),
      JSON.stringify(
        { type: "cuboid", cuboidWidth: sample.width, cuboidHeight: sample.height, cuboidDepth: sample.depth },
        null,
        2
      ) + "\n"
    );
    await writeFile(
      resolve(root, readme),
      `# ${sample.name}\n\n${sample.description}\n\n这是 PrimitiveMesh 示例资产。导入后按项目虚拟路径引用，并绑定到渲染器。尺寸单位为米。\n`
    );
    sources.push({
      key,
      metadata,
      descriptionUrl: new URL(key, baseUrl).href,
      resources: [mesh, readme].map((path) => ({ path, url: new URL(path, baseUrl).href }))
    });
  }
  const built = buildRetrievalCatalog(sources, { summaryBlockBytes: 1024 });
  const output = resolve(root, "catalog");
  for (const [path, bytes] of built.artifacts) {
    await mkdir(dirname(resolve(output, path)), { recursive: true });
    await writeFile(resolve(output, path), bytes);
  }
  await writeFile(resolve(output, "manifest.json"), built.manifestBytes);
  console.log(
    JSON.stringify({
      count: sources.length,
      corpusHash: built.corpusHash,
      output,
      indexBytes: built.manifest.index.bytes,
      summaryBlocks: built.manifest.summaries.length
    })
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
