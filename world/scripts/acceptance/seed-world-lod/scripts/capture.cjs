const fs = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { chromium } = require("@playwright/test");

const usage = `Usage:
  node capture.cjs asset --url <Vite base> --manifest <asset.json> --out <dir>
  node capture.cjs seed --url <Seed Demo page> --template <id> --seed <int> --out <dir>
Options: --width 1280 --height 720 --channel chrome --timeout 90000
Asset: --shares 0.22,0.08 --yaws 35,125 --supersample 2
Seed: --step 45 --time 12`;

const strings = [
  "url",
  "manifest",
  "out",
  "width",
  "height",
  "channel",
  "timeout",
  "shares",
  "yaws",
  "supersample",
  "template",
  "seed",
  "step",
  "time"
];
const { values, positionals } = parseArgs({
  options: { ...Object.fromEntries(strings.map((name) => [name, { type: "string" }])), help: { type: "boolean" } },
  allowPositionals: true
});

function option(name, fallback, valid) {
  const result = Number(values[name] ?? fallback);
  if (!Number.isFinite(result) || !valid(result)) throw new Error(`Invalid --${name}`);
  return result;
}

function list(name, fallback, valid) {
  const raw = (values[name] ?? fallback).split(",");
  const result = raw.map(Number);
  if (
    raw.some((x) => !x.trim()) ||
    result.some((x) => !Number.isFinite(x) || !valid(x)) ||
    new Set(result).size !== result.length
  )
    throw new Error(`Invalid --${name}`);
  return result;
}

async function assetCapture(page, base, out, width, height, timeout) {
  if (!values.manifest) throw new Error("--manifest is required for asset capture");
  const manifestPath = path.resolve(values.manifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (
    manifest.levels?.length < 2 ||
    !Array.isArray(manifest.levels) ||
    manifest.levels[0]?.id !== "lod0" ||
    !Array.isArray(manifest.center) ||
    manifest.center.length !== 3 ||
    !manifest.center.every(Number.isFinite) ||
    !Number.isFinite(manifest.size) ||
    manifest.size <= 0
  )
    throw new Error("Expected asset.json from build-lod.py");
  const shares = list("shares", "0.22,0.08", (v) => v > 0 && v < 1);
  const yaws = list("yaws", "35,125", () => true);
  const scale = option("supersample", 2, (v) => Number.isInteger(v) && v >= 1 && v <= 3);
  const levels = manifest.levels.map((level) => path.resolve(path.dirname(manifestPath), level.path));
  for (const level of levels) await fs.access(level);
  const relativeAssetRoute = "/__lod_review_assets__/";
  const endpoint = new URL(relativeAssetRoute, base);
  await page.route(`${endpoint.href}**`, async (route) => {
    const parts = decodeURIComponent(new URL(route.request().url()).pathname.slice(relativeAssetRoute.length)).split(
      "/"
    );
    const level = levels[Number(parts.shift())];
    if (!level || parts.some((item) => !item || item === "." || item === ".." || item.includes("\\")))
      return route.fulfill({ status: 404 });
    const file = path.resolve(path.dirname(level), ...parts);
    try {
      await route.fulfill({ path: file });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await page.goto(new URL("/world/scripts/acceptance/seed-world-lod/scripts/asset-view.html", base).href);
  await page.waitForFunction(() => window.lodAssetReview, null, { timeout });
  const counts = await page.evaluate(
    async (input) => {
      window.loadedAssetReview = await window.lodAssetReview.load(input);
      return window.loadedAssetReview.counts;
    },
    {
      width: width * scale,
      height: height * scale,
      center: manifest.center,
      size: manifest.size,
      levels: levels.map((file, index) => new URL(`${index}/${encodeURIComponent(path.basename(file))}`, endpoint).href)
    }
  );
  for (const [index, level] of manifest.levels.entries()) {
    if (level.triangles !== undefined && level.triangles !== counts[index])
      throw new Error(`Triangle count differs from manifest at LOD index ${index}`);
  }
  const frames = [];
  for (const [shareIndex, share] of shares.entries())
    for (const [yawIndex, yaw] of yaws.entries()) {
      const images = [];
      for (const [index, level] of manifest.levels.entries()) {
        const file = `share-${shareIndex}-yaw-${yawIndex}-level-${index}.png`;
        const shot = await page.evaluate(
          ([index, share, yaw]) => window.loadedAssetReview.shot(index, share, yaw),
          [index, share, yaw]
        );
        await fs.writeFile(path.join(out, file), Buffer.from(shot, "base64"));
        images.push({ file, id: level.id, triangles: counts[index] });
      }
      frames.push({ share, yaw, images });
    }
  return { kind: "asset", width, height, supersample: scale, frames };
}

async function seedCapture(page, url, out, width, height, timeout) {
  if (!values.template || values.seed === undefined)
    throw new Error("--template and --seed are required for Seed capture");
  const seed = option("seed", undefined, Number.isSafeInteger);
  const step = option("step", 45, (v) => Number.isInteger(v) && v >= 1 && 360 % v === 0);
  const hours = option("time", 12, (v) => v >= 0 && v <= 24);
  url.searchParams.set("template", values.template);
  url.searchParams.set("seed", String(seed));
  const probe = await fs.readFile(path.join(__dirname, "seed-probe.js"), "utf8");
  let injected = false;
  await page.route(
    (requestUrl) =>
      requestUrl.origin === url.origin && requestUrl.pathname.endsWith("/world/demos/seed-world/SeedWorldDemo.ts"),
    async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      const marker = '    canvas.dataset.status = "ready";';
      if (!response.ok() || !source.includes(marker)) return route.fulfill({ response });
      injected = true;
      return route.fulfill({ response, body: source.replace(marker, `${probe}\n${marker}`) });
    }
  );
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector('canvas[data-status="ready"], canvas[data-status="error"]'),
    null,
    { timeout }
  );
  const canvas = page.locator("canvas[data-status]");
  if ((await canvas.getAttribute("data-status")) !== "ready")
    throw new Error(`Seed Demo failed: ${await canvas.getAttribute("data-error")}`);
  if (!injected)
    throw new Error("No capture hook found. Use the Vite development demo and check seed-probe.js against its source.");
  const world = await page.evaluate((hours) => window.lodSpawnReview.setup(hours), hours);
  if (world.seed !== seed || world.template !== values.template)
    throw new Error(`Unexpected scene: ${JSON.stringify(world)}`);
  const frames = [];
  for (let yaw = 0; yaw < 360; yaw += step) {
    const pair = { yaw };
    for (const mode of ["lod0", "auto"]) {
      const visible = await page.evaluate(([yaw, mode]) => window.lodSpawnReview.shot(yaw, mode), [yaw, mode]);
      const file = `yaw-${yaw}-${mode}.png`;
      await canvas.screenshot({ path: path.join(out, file), timeout });
      pair[mode] = { file, visible, triangles: visible.reduce((total, item) => total + item.triangles, 0) };
    }
    frames.push(pair);
  }
  const horizontalFov =
    (2 * Math.atan(Math.tan((world.verticalFov * Math.PI) / 360) * world.aspectRatio) * 180) / Math.PI;
  if (step > horizontalFov) console.error("Warning: the chosen yaw step leaves gaps between frames.");
  return { kind: "seed", width, height, step, horizontalFov, ...world, frames };
}

async function main() {
  if (values.help || !positionals.length) return console.log(usage);
  const [mode] = positionals;
  if (positionals.length !== 1 || !["asset", "seed"].includes(mode) || !values.url || !values.out)
    throw new Error(usage);
  const url = new URL(values.url);
  const width = option("width", 1280, (v) => Number.isInteger(v) && v > 0);
  const height = option("height", 720, (v) => Number.isInteger(v) && v > 0);
  const timeout = option("timeout", 90_000, (v) => v > 0);
  const out = path.resolve(values.out);
  await fs.mkdir(out, { recursive: true });
  if ((await fs.readdir(out)).length) throw new Error("Capture needs an empty output directory");
  const args = process.platform === "darwin" ? ["--use-angle=metal"] : [];
  const browser = await chromium.launch({ channel: values.channel, args });
  const stop = () => void browser.close();
  process.once("SIGTERM", stop);
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(timeout);
    page.on("pageerror", (error) => console.error(error.message));
    const capture = mode === "asset" ? assetCapture : seedCapture;
    const data = await capture(page, url, out, width, height, timeout);
    await fs.writeFile(path.join(out, "measurements.json"), JSON.stringify(data, null, 2) + "\n");
    console.log(out);
  } finally {
    process.off("SIGTERM", stop);
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
