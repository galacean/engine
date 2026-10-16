import { Page } from "@playwright/test";
import { compare } from "odiff-bin";
import * as path from "path";

export interface ScreenshotOptions {
  category: string;
  name: string;
  threshold?: number;
  diffPercentage?: number;
}

export async function screenshotWithThreshold(page: Page, options: ScreenshotOptions) {
  const { category, name, threshold = 0, diffPercentage = 0 } = options;
  const imageName = `${category}_${name}.jpg`;
  const testId = `${category}_${name}`;
  const startTime = Date.now();

  console.log(`📸 [${testId}] Starting test`);
  const testUrl = `/mpa/${name}.html`;

  console.log(`🌐 [${testId}] Navigating to ${testUrl}`);
  await page.goto(testUrl);

  console.log(`⏳ [${testId}] Waiting for DOM content loaded...`);
  await page.waitForLoadState("domcontentloaded");
  const pageReadyTime = Date.now();
  console.log(`📄 [${testId}] Page ready (${pageReadyTime - startTime}ms)`);

  console.log(`🔍 [${testId}] Looking for screenshot button...`);
  // 监听下载事件
  const downloadPromise = page.waitForEvent("download");
  console.log(`📡 [${testId}] Download listener set up`);

  console.log(`⏰ [${testId}] Waiting for screenshot button to be visible (timeout: 180s)...`);
  let pageRenderedTime;
  try {
    // 等待 screenshot 按钮可见
    await page.getByTestId("screenshot").waitFor({ timeout: 180000 });
    pageRenderedTime = Date.now();
    console.log(`✅ [${testId}] Screenshot button visible (${pageRenderedTime - pageReadyTime}ms)`);
  } catch (error) {
    console.log(`❌ [${testId}] Screenshot button not visible after 180s`);
    console.log(`🔍 [${testId}] Page content: ${await page.content()}`);
    throw error;
  }

  console.log(`👆 [${testId}] Clicking screenshot button...`);
  // 点击下载按钮
  await page.getByTestId("screenshot").click();
  console.log(`✅ [${testId}] Screenshot button clicked`);

  console.log(`⬇️ [${testId}] Waiting for download to start...`);
  // 等待下载完成
  const download = await downloadPromise;
  console.log(`📦 [${testId}] Download received`);

  console.log(`💾 [${testId}] Saving download...`);
  const downloadPath = path.join(process.cwd(), "e2e/downloads", imageName);

  // 保存下载的文件
  await download.saveAs(downloadPath);

  console.log(`📥 [${testId}] Downloaded (${Date.now() - pageRenderedTime}ms)`);

  // Compare with baseline
  const baseImagePath = path.join(process.cwd(), "e2e/fixtures/originImage", imageName);
  const diffImagePath = path.join(process.cwd(), "e2e/diff", imageName);

  const result = await compare(baseImagePath, downloadPath, diffImagePath, {
    threshold,
    antialiasing: true
  });
  //@ts-ignore
  if (result.match === false && result.diffPercentage <= diffPercentage) {
    //@ts-ignore
    result.match = true;
  }

  if (!result.match) {
    const diffPercentage = "diffPercentage" in result ? result.diffPercentage : "unknown";
    console.log(`❌ [${testId}] Visual regression: ${diffPercentage}% (${Date.now() - startTime}ms)`);
    throw new Error(
      `Visual regression detected for ${imageName}. ` +
        `Difference: ${diffPercentage}%, threshold: ${threshold}. ` +
        `Diff saved to: ${diffImagePath}`
    );
  }

  console.log(
    `✅ [${testId}] Test passed (difference: ${"diffPercentage" in result ? result.diffPercentage : 0}%, ${Date.now() - startTime}ms total)`
  );
  return result;
}
