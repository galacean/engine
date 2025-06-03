#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const config = require("./editor-preload-config");

// Parse command line arguments
const args = process.argv.slice(2);
const versionArg = args.find((arg) => arg.startsWith("--version="));
const version = versionArg ? versionArg.split("=")[1] : "1.0.0";
const useNpmArg = args.includes("--use-npm");
const skipBuildArg = args.includes("--skip-build");

// Paths
const rootDir = process.cwd();
const outputDir = path.join(rootDir, "editor-preload");
const outputDistDir = path.join(outputDir, "dist");
const outputFile = path.join(outputDistDir, "browser.js");

console.log(`Building editor-preload v${version}`);

// Create output directories
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
if (!fs.existsSync(outputDistDir)) {
  fs.mkdirSync(outputDistDir, { recursive: true });
}

// Create package.json
const packageJson = {
  name: "@galacean/editor-preload",
  version: version,
  description: "Preloaded packages for Galacean Editor",
  main: "dist/browser.js",
  files: ["dist"]
};

fs.writeFileSync(path.join(outputDir, "package.json"), JSON.stringify(packageJson, null, 2));

// Initialize output file with header
fs.writeFileSync(outputFile, `// @galacean/editor-preload v${version}\n`);

// Build first-party packages if needed
if (!skipBuildArg) {
  console.log("Building first-party packages...");
  try {
    execSync("pnpm b:all", { stdio: "inherit", cwd: rootDir });
  } catch (error) {
    console.error("Failed to build first-party packages:", error);
    process.exit(1);
  }
}

// Concatenate first-party packages
console.log("Concatenating first-party packages...");
config.firstParty.forEach((pkg) => {
  const browserFile = path.join(rootDir, pkg.path, pkg.browserPath);

  if (fs.existsSync(browserFile)) {
    const content = fs.readFileSync(browserFile);
    fs.appendFileSync(outputFile, content);
    console.log(`Added ${pkg.name} (${browserFile})`);
  } else {
    console.warn(`Warning: ${browserFile} not found for ${pkg.name}`);
  }
});

// Handle second-party packages
if (useNpmArg) {
  // Install from npm
  console.log("Installing second-party packages from npm...");

  const tempDir = path.join(rootDir, "temp-install");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create package.json for temp install
  const tempPackageJson = {
    name: "temp-install",
    private: true,
    dependencies: {}
  };

  // Collect all package names from second-party configs
  config.secondParty.forEach((pkg) => {
    if (pkg.isMonorepo && pkg.packages) {
      pkg.packages.forEach((subPkg) => {
        tempPackageJson.dependencies[subPkg.name] = version;
      });
    } else {
      tempPackageJson.dependencies[pkg.name] = version;
    }
  });

  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(tempPackageJson, null, 2));

  // Install packages
  try {
    execSync("npm install", { stdio: "inherit", cwd: tempDir });
  } catch (error) {
    console.error("Failed to install second-party packages:", error);
    process.exit(1);
  }

  // Concatenate second-party packages
  console.log("Concatenating second-party packages...");
  config.secondParty.forEach((pkg) => {
    if (pkg.isMonorepo && pkg.packages) {
      pkg.packages.forEach((subPkg) => {
        const browserFile = path.join(tempDir, "node_modules", subPkg.name, subPkg.browserPath);

        if (fs.existsSync(browserFile)) {
          const content = fs.readFileSync(browserFile);
          fs.appendFileSync(outputFile, content);
          console.log(`Added ${subPkg.name} (${browserFile})`);
        } else {
          console.warn(`Warning: ${browserFile} not found for ${subPkg.name}`);
        }
      });
    } else {
      const browserFile = path.join(tempDir, "node_modules", pkg.name, pkg.browserPath);

      if (fs.existsSync(browserFile)) {
        const content = fs.readFileSync(browserFile);
        fs.appendFileSync(outputFile, content);
        console.log(`Added ${pkg.name} (${browserFile})`);
      } else {
        console.warn(`Warning: ${browserFile} not found for ${pkg.name}`);
      }
    }
  });
} else {
  // Build from source
  console.log("Building second-party packages from source...");

  config.secondParty.forEach((pkg) => {
    const repoDir = path.join(rootDir, path.basename(pkg.repo, ".git"));

    // Clone repo if it doesn't exist
    if (!fs.existsSync(repoDir)) {
      console.log(`Cloning ${pkg.name} from ${pkg.repo}...`);
      const cloneCmd = pkg.branch
        ? `git clone ${pkg.repo} ${repoDir} -b ${pkg.branch}`
        : `git clone ${pkg.repo} ${repoDir}`;

      try {
        execSync(cloneCmd, { stdio: "inherit" });
      } catch (error) {
        console.error(`Failed to clone ${pkg.name}:`, error);
        return;
      }
    }

    // Link engine
    console.log(`Linking engine to ${pkg.name}...`);
    try {
      execSync("pnpm link ../packages/galacean", {
        stdio: "inherit",
        cwd: repoDir
      });
    } catch (error) {
      console.warn(`Warning: Failed to link engine to ${pkg.name}:`, error);
    }

    // Install dependencies
    console.log(`Installing dependencies for ${pkg.name}...`);
    try {
      execSync("pnpm install", { stdio: "inherit", cwd: repoDir });
    } catch (error) {
      console.error(`Failed to install dependencies for ${pkg.name}:`, error);
      return;
    }

    // Build package
    if (!skipBuildArg) {
      console.log(`Building ${pkg.name}...`);
      try {
        execSync(pkg.buildCommand, { stdio: "inherit", cwd: repoDir });
      } catch (error) {
        console.error(`Failed to build ${pkg.name}:`, error);
        return;
      }
    }

    // Concatenate browser files
    if (pkg.isMonorepo && pkg.packages) {
      pkg.packages.forEach((subPkg) => {
        const packageDir = path.join(repoDir, subPkg.packagePath);
        const browserFile = path.join(packageDir, subPkg.browserPath);

        if (fs.existsSync(browserFile)) {
          const content = fs.readFileSync(browserFile);
          fs.appendFileSync(outputFile, content);
          console.log(`Added ${subPkg.name} (${browserFile})`);
        } else {
          console.warn(`Warning: ${browserFile} not found for ${subPkg.name}`);
        }
      });
    } else {
      const packageDir = pkg.packagePath === "." ? repoDir : path.join(repoDir, pkg.packagePath);
      const browserFile = path.join(packageDir, pkg.browserPath);

      if (fs.existsSync(browserFile)) {
        const content = fs.readFileSync(browserFile);
        fs.appendFileSync(outputFile, content);
        console.log(`Added ${pkg.name} (${browserFile})`);
      } else {
        console.warn(`Warning: ${browserFile} not found for ${pkg.name}`);
      }
    }
  });
}

// Output file stats
const stats = fs.statSync(outputFile);
console.log(`\nCreated ${outputFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
console.log("Done!");
