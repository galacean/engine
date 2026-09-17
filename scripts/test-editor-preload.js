const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("@playwright/test");

// Exercise the CDN host's loading order against the actual ecosystem artifact.
async function main() {
  // This is the exact Engine version; ecosystem uses a separate major.minor alias.
  const engineVersion = process.argv[2] || require("../package.json").version;
  const buildOfficial = process.argv.includes("--build-official");
  const cdn = "https://mdn.alipayobjects.com/oasis_be/uri/file/as";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const url of [
      `${cdn}/@galacean/engine/${engineVersion}/browser.min.js`,
      ...(buildOfficial ? [] : [`${cdn}/@galacean/editor-preload-official/${engineVersion}/browser.js`])
    ]) {
      const response = await fetch(url);
      assert.ok(response.ok, `${url}: HTTP ${response.status}`);
      await page.addScriptTag({ content: await response.text() });
    }
    if (buildOfficial) {
      await page.addScriptTag({ path: path.resolve(__dirname, "../editor-preload-official/dist/browser.js") });
    }
    await page.addScriptTag({ path: path.resolve(__dirname, "../editor-preload-ecosystem/dist/browser.js") });
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
