const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { verifyEcosystemPackages } = require("./editor-preload-compat");

const ecosystemFile = path.resolve(__dirname, "../editor-preload-ecosystem/dist/browser.js");
const ecosystemManifestFile = path.resolve(__dirname, "../editor-preload-ecosystem/dist/versions.json");

// The bundle is an npm install concatenated into one file, so the manifest written at build time is
// the only record of what went into it; re-check it here, against what is actually published.
function assertPublishedVersions(engineVersion) {
  if (!fs.existsSync(ecosystemManifestFile)) {
    console.log("No ecosystem manifest (source build); skipping the published version check");
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(ecosystemManifestFile, "utf8"));
  const { compatible, problems } = verifyEcosystemPackages(manifest.packages, engineVersion);

  assert.ok(
    compatible,
    `${manifest.engineAlias} published packages that do not match Engine ${engineVersion}:\n  ${problems.join("\n  ")}`
  );
  console.log(
    `Published packages match Engine ${manifest.engineVersion}: ${manifest.packages
      .map(({ name, version }) => `${name}@${version}`)
      .join(", ")}`
  );
}

// Exercise the CDN host's loading order against the actual ecosystem artifact.
async function main() {
  // This is the exact Engine version; ecosystem uses a separate major.minor alias.
  const engineVersion = process.argv[2] || require("../package.json").version;
  const buildOfficial = process.argv.includes("--build-official");
  const cdn = "https://mdn.alipayobjects.com/oasis_be/uri/file/as";
  assertPublishedVersions(engineVersion);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const script of [
      { url: `${cdn}/@galacean/engine/${engineVersion}/browser.min.js` },
      buildOfficial
        ? { path: path.resolve(__dirname, "../editor-preload-official/dist/browser.js") }
        : { url: `${cdn}/@galacean/editor-preload-official/${engineVersion}/browser.js` },
      { path: ecosystemFile }
    ]) {
      await page.addScriptTag(script);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(
      await page.evaluate(() => [
        typeof Galacean.Toolkit.OrbitControl,
        typeof Galacean.Toolkit.XR.XROrigin,
        typeof Galacean.Spine.SpineAnimationRenderer
      ]),
      ["function", "function", "function"]
    );
    console.log(`Ecosystem bundle initializes with Engine ${engineVersion}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
