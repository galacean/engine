const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("@playwright/test");

// Exercise the CDN host's loading order against the actual ecosystem artifact.
async function main() {
  const version = process.argv[2] || require("../package.json").version;
  const cdn = "https://mdn.alipayobjects.com/oasis_be/uri/file/as";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const url of [
      `${cdn}/@galacean/engine/${version}/browser.min.js`,
      `${cdn}/@galacean/editor-preload-official/${version}/browser.js`
    ]) {
      const response = await fetch(url);
      assert.ok(response.ok, `${url}: HTTP ${response.status}`);
      await page.addScriptTag({ content: await response.text() });
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
    console.log(`Ecosystem bundle initializes with Engine ${version}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
