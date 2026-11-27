const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const root = path.resolve(__dirname, "../../../..");
const out = process.env.BENCH_OUTPUT;
if (!out) throw Error("Set BENCH_OUTPUT to an evidence directory outside the checkout");
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const working = process.env.BENCH_SNAPSHOT_MODE === "working";
const files = execFileSync(
  "git",
  working
    ? ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "packages", "world"]
    : ["ls-tree", "-rz", "--name-only", head, "--", "packages", "world"],
  {
    cwd: root,
    encoding: "utf8"
  }
)
  .split("\0")
  .filter((file) => /\.(ts|js|mjs|cjs|glsl|shaderc)$/.test(file));
const bytes = working
  ? undefined
  : execFileSync("git", ["cat-file", "--batch"], {
      cwd: root,
      input: files.map((file) => `${head}:${file}\n`).join(""),
      maxBuffer: 128 * 1024 * 1024
    });
const source = {};
let offset = 0;
for (const file of files) {
  if (working) {
    if (fs.existsSync(path.join(root, file))) source[file] = fs.readFileSync(path.join(root, file), "utf8");
    continue;
  }
  const end = bytes.indexOf(10, offset);
  const [, type, length] = bytes.subarray(offset, end).toString().split(" ");
  if (type !== "blob") throw Error(`Missing source blob: ${file}`);
  const size = Number(length);
  offset = end + 1;
  source[file] = bytes.subarray(offset, offset + size).toString();
  offset += size + 1;
}
if (working)
  for (const file of [
    "packages/shader/compiledShaders/index.ts",
    "packages/shader/compiledWebGPUShaders/index.ts",
    "packages/shader/src/ShaderLibrary/index.ts"
  ]) {
    if (fs.existsSync(path.join(root, file))) source[file] = fs.readFileSync(path.join(root, file), "utf8");
  }
fs.mkdirSync(out, { recursive: true });
const content = JSON.stringify(source);
fs.writeFileSync(path.join(out, "shared-source.json"), content);
fs.writeFileSync(
  path.join(out, "shared-source-manifest.json"),
  JSON.stringify(
    {
      head,
      mode: working ? "working" : "HEAD",
      fileCount: Object.keys(source).length,
      sha256: createHash("sha256").update(content).digest("hex")
    },
    null,
    2
  )
);
console.log(`Saved ${Object.keys(source).length} common source files from ${working ? "working tree" : head}`);
