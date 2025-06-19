import { Page } from "@playwright/test";
import { compare } from "odiff-bin";
import * as path from "path";
import * as fs from "fs-extra";

export interface ScreenshotOptions {
  category: string;
  name: string;
  threshold?: number;
}

export async function screenshotWithThreshold(page: Page, options: ScreenshotOptions) {
  const { category, name, threshold = 0.1 } = options;

  await page.goto(`/mpa/${name}.html?category=${category}&case=${name}`);

  const imageName = `${category}_${name}.jpg`;

  // Wait for page load and 3D scene initialization
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  // Wait for screenshot button to be ready (created with download attribute)
  await page.waitForFunction(
    () => {
      const btn = document.querySelector("#screenshot");
      return btn && btn.getAttribute("download") && btn.getAttribute("href");
    },
    { timeout: 60000 }
  );

  // Trigger screenshot download
  await page.evaluate(() => {
    (document.querySelector("#screenshot") as HTMLElement)?.click();
  });

  // Wait for download to complete
  await page.waitForTimeout(1000);

  const downloadsPath = path.join(process.cwd(), "e2e/downloads");
  const baseImagePath = path.join(process.cwd(), "e2e/fixtures/originImage", imageName);
  const newImagePath = path.join(downloadsPath, imageName);
  const diffDir = path.join(process.cwd(), "e2e/test-results/diffs");
  const diffImagePath = path.join(diffDir, imageName);

  // Ensure diff directory exists
  if (!fs.existsSync(diffDir)) {
    fs.mkdirSync(diffDir, { recursive: true });
  }

  // Wait for the downloaded file to exist
  await waitForFile(newImagePath, page);

  // Compare images using odiff
  const result = await compare(baseImagePath, newImagePath, diffImagePath, {
    threshold,
    antialiasing: true
  });

  // Apply threshold logic: treat differences within threshold as matches
  const isMatch =
    result.match || (result.match === false && "diffPercentage" in result && result.diffPercentage <= threshold);

  if (!isMatch) {
    const diffPercentage = "diffPercentage" in result ? result.diffPercentage : "N/A";
    throw new Error(
      `Visual regression detected for ${imageName}. ` +
        `Difference: ${diffPercentage}%, threshold: ${threshold}%. ` +
        `Diff saved to: ${diffImagePath}`
    );
  }

  return result;
}

/**
 * Wait for a file to exist with retry logic
 */
async function waitForFile(filePath: string, page: Page, maxAttempts = 20): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Downloaded image not found: ${filePath}`);
}
