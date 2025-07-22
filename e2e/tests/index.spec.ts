import { test } from "@playwright/test";
import { E2E_CONFIG } from "../config";
import { screenshotWithThreshold } from "../utils/screenshot";
import type { CategoryConfig, TestCaseConfig } from "../types/test-config";

/**
 * Create test cases for a given category
 */
function createTestsForCategory(categoryName: string, categoryConfig: CategoryConfig) {
  test.describe(categoryName, () => {
    Object.entries(categoryConfig).forEach(([caseName, config]: [string, TestCaseConfig]) => {
      test(caseName, async ({ page }) => {
        const { category, caseFileName, threshold, diffPercentage } = config;
        await screenshotWithThreshold(page, {
          category,
          name: caseFileName,
          threshold,
          diffPercentage
        });
      });
    });
  });
}

// Generate test suites for all categories
Object.entries(E2E_CONFIG).forEach(([categoryName, categoryConfig]) => {
  createTestsForCategory(categoryName, categoryConfig);
});
