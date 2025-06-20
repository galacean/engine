import * as fs from "fs-extra";
import * as path from "path";

// Wait for server to be ready
async function waitForServer(url: string, timeout: number = 120000): Promise<void> {
  const startTime = Date.now();
  console.log(`⏳ Waiting for server at ${url}...`);

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`✅ Server is ready at ${url}`);
        return;
      }
    } catch (error) {
      // Server not ready yet, continue waiting
    }

    // Wait 1 second before next attempt
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`❌ Server at ${url} did not start within ${timeout}ms`);
}

export default async function globalSetup() {
  console.log("🚀 Galacean Engine E2E Test Setup");
  console.log("📁 Cleaning downloads directory...");

  // Clean downloads directory before tests
  const downloadsPath = path.join(process.cwd(), "e2e/downloads");
  if (fs.existsSync(downloadsPath)) {
    const files = fs.readdirSync(downloadsPath);
    fs.emptyDirSync(downloadsPath);
    console.log(`   ✅ Cleaned ${files.length} files from e2e/downloads`);
  } else {
    console.log("   ℹ️  Downloads directory is empty");
  }

  // Count test cases from config
  let testCount = 0;
  try {
    const configPath = path.join(process.cwd(), "e2e/config.ts");
    if (fs.existsSync(configPath)) {
      const { E2E_CONFIG } = require(configPath);
      testCount = Object.values(E2E_CONFIG).reduce((total: number, category: any) => {
        return total + Object.keys(category).length;
      }, 0) as number;
      console.log(`🧪 Found ${testCount} test cases`);
    }
  } catch (error) {
    console.log("⚠️  Could not read test configuration");
  }

  // Check baseline images
  const baselineDir = path.join(process.cwd(), "e2e/fixtures/originImage");
  if (fs.existsSync(baselineDir)) {
    const baselineFiles = fs.readdirSync(baselineDir).filter((f) => f.endsWith(".jpg"));
    console.log(`📸 Found ${baselineFiles.length} baseline images`);
  }

  // Wait for server to be ready
  await waitForServer("http://localhost:5175");

  console.log("🎬 Ready to run visual regression tests!\n");
}
