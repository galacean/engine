import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KTX_SOFTWARE_VERSION = "v4.4.2";
const checkOnly = process.argv.includes("--check");
const ktx = process.env.OCEAN_KTX2_KTX ?? "ktx";
const assetRoot = fileURLToPath(new URL("../resources/ocean/", import.meta.url));

const textures = [
  {
    source: "textures/Normals/SmoothWaves.png",
    output: "textures/Normals/SmoothWaves.ktx2",
    format: "R8G8B8_UNORM",
    transferFunction: "linear"
  },
  {
    source: "textures/Normals/RoughWaves.png",
    output: "textures/Normals/RoughWaves.ktx2",
    format: "R8G8B8_UNORM",
    transferFunction: "linear"
  },
  {
    source: "textures/Caustics/Caustics_1.png",
    output: "textures/Caustics/Caustics_1.ktx2",
    format: "R8G8B8_SRGB",
    transferFunction: "srgb"
  },
  {
    source: "textures/Foam/Foam1.png",
    output: "textures/Foam/Foam1.ktx2",
    format: "R8G8B8_SRGB",
    transferFunction: "srgb"
  },
  {
    source: "textures/IntersectionNoise.png",
    output: "textures/IntersectionNoise.ktx2",
    format: "R8G8B8_SRGB",
    transferFunction: "srgb"
  }
];

const version = run(["--version"]).stdout.trim();
if (!version.includes(KTX_SOFTWARE_VERSION)) {
  throw new Error(`Ocean KTX2 generation requires KTX-Software ${KTX_SOFTWARE_VERSION}; received '${version}'.`);
}

const report = [];
for (const texture of textures) {
  const sourcePath = `${assetRoot}${texture.source}`;
  const outputPath = `${assetRoot}${texture.output}`;
  const generatedPath = `${outputPath}.tmp-${process.pid}.ktx2`;
  try {
    const result = run([
      "create",
      "--format",
      texture.format,
      "--encode",
      "uastc",
      "--uastc-quality",
      "4",
      "--zstd",
      "18",
      "--assign-tf",
      texture.transferFunction,
      "--assign-primaries",
      texture.transferFunction === "srgb" ? "srgb" : "none",
      "--width",
      "512",
      "--height",
      "512",
      "--generate-mipmap",
      "--mipmap-filter",
      "lanczos4",
      "--mipmap-wrap",
      "wrap",
      "--assign-texcoord-origin",
      "top-left",
      "--threads",
      "1",
      "--testrun",
      "--compare-ssim",
      "--compare-psnr",
      sourcePath,
      generatedPath
    ]);
    const generated = readFileSync(generatedPath);
    const generatedSha256 = sha256(generated);
    if (checkOnly) {
      const tracked = readFileSync(outputPath);
      const trackedSha256 = sha256(tracked);
      if (trackedSha256 !== generatedSha256) {
        throw new Error(`Ocean KTX2 drift for '${texture.output}': expected ${trackedSha256}, got ${generatedSha256}.`);
      }
    } else {
      renameSync(generatedPath, outputPath);
    }
    report.push({
      ...texture,
      width: 512,
      height: 512,
      byteLength: checkOnly ? statSync(outputPath).size : generated.byteLength,
      sha256: generatedSha256,
      quality: result.stdout.trim()
    });
  } finally {
    rmSync(generatedPath, { force: true });
  }
}

process.stdout.write(
  `${JSON.stringify({ tool: `KTX-Software ${KTX_SOFTWARE_VERSION}`, checkOnly, textures: report }, null, 2)}\n`
);

function run(args) {
  const result = spawnSync(ktx, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `KTX command failed (${result.status}): ${ktx} ${args.join(" ")}\n${result.stderr || result.stdout}`
    );
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
