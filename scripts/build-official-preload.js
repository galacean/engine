#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const config = require("./editor-preload-config");

// Parse command line arguments
const args = process.argv.slice(2);
const versionArg = args.find((arg) => arg.startsWith("--version="));
const packageVersion = versionArg ? versionArg.split("=")[1] : null; // If null, we'll use the engine version

// Get engine version from package.json
const enginePackageJson = require(path.join(process.cwd(), "package.json"));
const engineVersion = enginePackageJson.version;

// Use specified version or fallback to engine version
const finalVersion = packageVersion || engineVersion;

// Fixed package name
const packageName = "@galacean/editor-preload-official";

console.log(`Engine version: ${engineVersion}`);
console.log(`Package name: ${packageName}`);
console.log(`Package version: ${finalVersion}`);
console.log("Building official preload package...");

// Paths
const rootDir = process.cwd();
const outputOfficialDir = path.join(rootDir, "editor-preload-official");
const outputOfficialDistDir = path.join(outputOfficialDir, "dist");
const outputOfficialFile = path.join(outputOfficialDistDir, "browser.js");

// Create output directories
console.log("Creating output directories...");
if (!fs.existsSync(outputOfficialDir)) {
  fs.mkdirSync(outputOfficialDir, { recursive: true });
}
if (!fs.existsSync(outputOfficialDistDir)) {
  fs.mkdirSync(outputOfficialDistDir, { recursive: true });
}

// Create package.json for official package
const officialPackageJson = {
  name: packageName,
  version: finalVersion,
  description: "Official packages preloaded for Galacean Editor",
  main: "dist/browser.js",
  files: ["dist"]
};

fs.writeFileSync(path.join(outputOfficialDir, "package.json"), JSON.stringify(officialPackageJson, null, 2));

// Initialize output file with header
fs.writeFileSync(outputOfficialFile, `// ${packageName} ${finalVersion}\n`);

// Concatenate first-party packages
console.log("Concatenating first-party packages...");
config.firstParty.forEach((pkg) => {
  const browserFile = path.join(rootDir, pkg.path, pkg.browserPath);

  if (fs.existsSync(browserFile)) {
    const content = fs.readFileSync(browserFile);
    fs.appendFileSync(outputOfficialFile, content);
    console.log(`Added ${pkg.name} to official package (${browserFile})`);
  } else {
    console.warn(`Warning: ${browserFile} not found for ${pkg.name}`);
  }
});

// Output file stats
const officialStats = fs.statSync(outputOfficialFile);
console.log(`\nCreated ${outputOfficialFile} (${(officialStats.size / 1024 / 1024).toFixed(2)} MB)`);
console.log("Done!");
