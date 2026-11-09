import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// Use the same public encoder as Editor/CLI. A source checkout can be supplied
// without making Engine depend on Editor or vendoring another codec/WASM copy.
const entry = process.env.WATER_KTX2_ENCODER ?? require.resolve("@galacean/tools-ktx2-encoder");
if (entry.endsWith(".ts"))
  require("ts-node").register({
    transpileOnly: true,
    skipProject: true,
    compilerOptions: { module: "CommonJS", moduleResolution: "Node" }
  });
const { NodeKtx2Encoder } = require(entry);
const encoder = new NodeKtx2Encoder();
const check = process.argv.includes("--check");
const assets = fileURLToPath(new URL("../resources/river/assets/", import.meta.url));
const output = check ? mkdtempSync(path.join(tmpdir(), "water-river-ktx2-")) : assets;
const definitions = [
  [
    "wave",
    "farmlands-wave-large.png",
    false,
    false,
    "25a717a13b29082b65a62b6ca489412ce9620d8c99ee65a96f626ac153ac3400"
  ],
  [
    "caustics",
    "farmlands-caustics.png",
    true,
    true,
    "82024c671895a0a84b362cb2d5170d1ae1ab78139a022dcfc9d00f77bfde299f"
  ],
  [
    "directional",
    "drops/directional.png",
    true,
    false,
    "4304ca4bdf11e1cc0d1073018480339874ae0506f0adbe74e2983c3601784f9f"
  ],
  ["cloud", "drops/cloud-linear.png", false, true, "b22b11325d1c8e9bc4d3171d27b63e40356c4c2fec46e9b8e21f7e43564807d9"],
  ["lines", "drops/lines.png", true, false, "6fe94736b5507d1b1ea9b8add09bd3f3f1011479afe4b2ea0506646b5b6bae8e"],
  ["edge", "drops/edge.png", true, true, "dc94d20f448ce892b063628ad6a0b611af72111eaa71915dbca103305f02765c"],
  ["voronoi", "drops/voronoi.png", true, false, "51c2adc8a4fc854a39eecad6f834bd11a2718dc52e1125c8abe09f49de7f80ef"],
  ["foam", "drops/foam.png", true, true, "0f224383d8632bc5b5b439b7f3e88eac63f8f63bba79c23e7fb7c6d77ebcde9d"],
  ["mist", "drops/mist.png", true, true, "a9a0dc6664305b58139f3fe736fee3d10f1f022131e524f06b222fdf2d54a705"],
  ["splash", "drops/splash.png", true, true, "a7c315f60c0cec3a7ba2847c239c9eb2659a4d00e1d3ae40292a723f95267046"]
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const textures = {};
try {
  for (const [id, source, srgb, alpha, expected] of definitions) {
    const sourcePath = path.join(assets, source),
      png = readFileSync(sourcePath);
    if (sha(png) !== expected) throw new Error(`Changed Water texture source: ${source}`);
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    const file = `ktx2/${source.replace(/\.png$/, ".ktx2")}`;
    const destination = path.join(output, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    process.stderr.write(`Encoding ${source} (${width}x${height})\n`);
    const format = `${alpha ? "R8G8B8A8" : "R8G8B8"}_${srgb ? "SRGB" : "UNORM"}`;
    const options = {
      isUASTC: true,
      uastcLDRQualityLevel: 3,
      needSupercompression: true,
      generateMipmap: true,
      isKTX2File: true,
      isYFlip: false,
      isNormalMap: id === "wave",
      isPerceptual: srgb,
      isSetKTX2SRGBTransferFunc: srgb
    };
    const encoded = await encoder.encode(new Uint8Array(png), options);
    writeFileSync(destination, encoded);
    const bytes = readFileSync(destination);
    textures[id] = {
      id:
        id === "wave"
          ? "farmlands-wave-large-normal"
          : id === "caustics"
            ? "farmlands-caustics-color"
            : `farmlands-drop-${id}`,
      source,
      sourceSha256: expected,
      sourceByteLength: png.length,
      output: file,
      width,
      height,
      format,
      isSRGBColorSpace: srgb,
      alpha,
      mipLevels: bytes.readUInt32LE(40),
      sha256: sha(bytes),
      byteLength: bytes.length
    };
    if (check && sha(readFileSync(path.join(assets, file))) !== textures[id].sha256)
      throw new Error(`Non-reproducible Water KTX2: ${file}`);
  }
  const manifest =
    JSON.stringify(
      {
        schemaVersion: 1,
        encoder: {
          tool: "@galacean/tools-ktx2-encoder",
          codec: "UASTC",
          quality: 3,
          supercompression: "Zstd",
          mipmaps: true,
          dimensions: "preserved",
          orientation: "top-left"
        },
        textures
      },
      null,
      2
    ) + "\n";
  if (check) {
    if (readFileSync(path.join(assets, "ktx2-manifest.json"), "utf8") !== manifest)
      throw new Error("Water KTX2 manifest differs from its sources.");
  } else writeFileSync(path.join(assets, "ktx2-manifest.json"), manifest);
  process.stdout.write(JSON.stringify({ check, textures }, null, 2) + "\n");
} finally {
  if (check) rmSync(output, { recursive: true, force: true });
}
