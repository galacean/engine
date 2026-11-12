/**
 * 临时交付工具：将当前 Engine Water 导出为 Editor 可消费的快照。
 * 使用指定 Editor 工作区的生成器，在仓库外生成快照、校验清单和 export.json 来源记录。
 *
 * 用法（在 Engine 仓库根目录执行，Editor 工作区需已安装依赖）：
 *   node packages/water/scripts/export-editor-snapshot.mjs --editor-runtime /path/to/editor/packages/water-runtime --out /tmp/water-editor-snapshot
 *
 * --editor-runtime：提供生成器的 Editor packages/water-runtime 目录。
 * --out：全新的输出目录，必须位于 Engine 和 Editor 仓库之外；已有目录不会被覆盖。
 *
 * 本文件是阶段性联调与快照交付使用的临时脚本，将来不再需要时可以清理掉。
 */
import { cp, mkdir, realpath, symlink, lstat, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";

// Use a pinned copy of the consumer's generator, without writing to the Editor.
const { values } = parseArgs({ options: { "editor-runtime": { type: "string" }, out: { type: "string" } } });
if (!values["editor-runtime"] || !values.out)
  throw new Error("Use --editor-runtime /path/to/editor/packages/water-runtime --out /new/artifact/directory");
const engine = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const consumer = await realpath(resolve(values["editor-runtime"]));
const consumerRoot = resolve(consumer, "../..");
const output = resolve(values.out);
for (const protectedRoot of [engine, consumerRoot])
  if (output === protectedRoot || output.startsWith(protectedRoot + "/"))
    throw new Error("Snapshot output must be outside both source repositories");
if (
  await lstat(output).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  })
)
  throw new Error("Snapshot output must be a new directory; existing artifacts are never overwritten");
const staged = join(output, "packages/water-runtime");
await mkdir(staged, { recursive: true });
for (const directory of ["src", "scripts"])
  await cp(join(consumer, directory), join(staged, directory), { recursive: true });
await symlink(join(consumerRoot, "node_modules"), join(output, "node_modules"));
await symlink(join(consumer, "node_modules"), join(staged, "node_modules"));
execFileSync(process.execPath, [join(staged, "scripts/prepare.mjs"), "--engine", engine], {
  cwd: engine,
  stdio: "inherit"
});
// Import directly: macOS /tmp resolves to /private/tmp, so argv-based main guards
// in a copied consumer script need not match its canonical module path.
const snapshot = await import(pathToFileURL(join(staged, "scripts/snapshot.mjs")));
await snapshot.packSnapshot(staged);
await snapshot.ensureSnapshot(staged);
const manifest = JSON.parse(await readFile(join(staged, "vendor/engine-water.snapshot.json"), "utf8"));
await writeFile(
  join(output, "export.json"),
  JSON.stringify(
    {
      engine,
      generatorSource: consumer,
      manifest: join(staged, "vendor/engine-water.snapshot.json"),
      archive: join(staged, "vendor/engine-water.snapshot.json.gz"),
      revision: manifest.source.revision,
      dirty: manifest.source.dirty,
      sha256: manifest.sha256,
      generatorFiles: manifest.source.generatorFiles
    },
    null,
    2
  ) + "\n"
);
console.log(`Verified snapshot: ${join(output, "export.json")}`);
