#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const config = require("./editor-preload-config");
const { getEcosystemAlias, readResolvedPackages, verifyEcosystemPackages } = require("./editor-preload-compat");

// Parse command line arguments
const args = process.argv.slice(2);
const useNpmArg = args.includes("--use-npm");
const skipBuildArg = args.includes("--skip-build");
const buildOfficialArg = args.includes("--build-official");

// Get engine version from package.json
const enginePackageJson = require(path.join(process.cwd(), "package.json"));
const engineVersion = enginePackageJson.version;
// The host selects ecosystem bundles by Engine major.minor, not a package version.
const ecosystemVersion = getEcosystemAlias(engineVersion);

console.log(`Engine version: ${engineVersion}`);
console.log(`Ecosystem version: ${ecosystemVersion}`);
console.log(`Use npm: ${useNpmArg}`);
console.log(`Skip build: ${skipBuildArg}`);
console.log(`Build official: ${buildOfficialArg}`);

// Paths
const rootDir = process.cwd();
const outputEcosystemDir = path.join(rootDir, "editor-preload-ecosystem");
const outputEcosystemDistDir = path.join(outputEcosystemDir, "dist");
const outputEcosystemFile = path.join(outputEcosystemDistDir, "browser.js");

console.log("Creating output directories...");
// Create ecosystem output directories
if (!fs.existsSync(outputEcosystemDir)) {
  fs.mkdirSync(outputEcosystemDir, { recursive: true });
}
if (!fs.existsSync(outputEcosystemDistDir)) {
  fs.mkdirSync(outputEcosystemDistDir, { recursive: true });
}

// Create package.json for ecosystem package
const ecosystemPackageJson = {
  name: "@galacean/editor-preload-ecosystem",
  version: ecosystemVersion,
  description: "Ecosystem packages preloaded for Galacean Editor",
  main: "dist/browser.js",
  files: ["dist"]
};

fs.writeFileSync(path.join(outputEcosystemDir, "package.json"), JSON.stringify(ecosystemPackageJson, null, 2));

// Initialize output file with header
fs.writeFileSync(outputEcosystemFile, `// @galacean/editor-preload-ecosystem ${ecosystemVersion}\n`);

// Build first-party packages if needed
if (!skipBuildArg && (!useNpmArg || buildOfficialArg)) {
  console.log("Building first-party packages...");
  try {
    execSync("pnpm b:all", { stdio: "inherit", cwd: rootDir });
  } catch (error) {
    console.error("Failed to build first-party packages:", error);
    process.exit(1);
  }
}

// If buildOfficialArg is true, also build the official preload package
if (buildOfficialArg) {
  console.log("Building official preload package...");
  try {
    execSync("node ./scripts/build-official-preload.js", { stdio: "inherit", cwd: rootDir });
  } catch (error) {
    console.error("Failed to build official preload package:", error);
    process.exit(1);
  }
}

// Handle second-party packages
if (useNpmArg) {
  // Install from npm
  console.log("Installing second-party packages from npm...");

  const tempDir = path.join(rootDir, "temp-install");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const packages = config.secondParty.flatMap((pkg) => pkg.packages || [pkg]);
  const tempPackageJson = {
    name: "temp-install",
    private: true,
    dependencies: Object.fromEntries(packages.map(({ name }) => [name, ecosystemVersion]))
  };

  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(tempPackageJson, null, 2));

  // Resolve moved dist-tags even when temp-install already has a lockfile.
  try {
    execSync(
      `npm install --no-save --legacy-peer-deps ${packages.map(({ name }) => `${name}@${ecosystemVersion}`).join(" ")}`,
      {
        stdio: "inherit",
        cwd: tempDir
      }
    );
  } catch (error) {
    console.error("Failed to install second-party packages:", error);
    process.exit(1);
  }

  // The alias is also the npm dist-tag, and a dist-tag that stops being moved is silent: verify
  // that what it resolved to still declares itself compatible with this engine before publishing.
  const resolvedPackages = readResolvedPackages(path.join(tempDir, "node_modules"), packages);
  const { compatible, problems } = verifyEcosystemPackages(resolvedPackages, engineVersion);

  if (!compatible) {
    console.error(
      `Incompatible ecosystem packages for ${ecosystemVersion}:\n` + problems.map((p) => `  ${p}`).join("\n")
    );
    process.exit(1);
  }

  const manifest = { engineVersion, engineAlias: ecosystemVersion, packages: resolvedPackages };
  fs.writeFileSync(path.join(outputEcosystemDistDir, "versions.json"), JSON.stringify(manifest, null, 2));
  console.log(
    `Resolved ecosystem packages: ${resolvedPackages.map(({ name, version }) => `${name}@${version}`).join(", ")}`
  );

  // Concatenate second-party packages
  console.log("Concatenating second-party packages for ecosystem preload...");
  packages.forEach((pkg) => {
    const browserFile = path.join(tempDir, "node_modules", pkg.name, pkg.browserPath);
    fs.appendFileSync(outputEcosystemFile, fs.readFileSync(browserFile));
    console.log(`Added ${pkg.name} to ecosystem package (${browserFile})`);
  });
} else {
  // Build from source
  console.log("Building second-party packages from source...");

  // Source builds carry no resolved npm versions; drop a manifest left by an earlier npm build so
  // it cannot be published as if it described this bundle.
  fs.rmSync(path.join(outputEcosystemDistDir, "versions.json"), { force: true });

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
          fs.appendFileSync(outputEcosystemFile, content);
          console.log(`Added ${subPkg.name} to ecosystem package (${browserFile})`);
        } else {
          console.warn(`Warning: ${browserFile} not found for ${subPkg.name}`);
        }
      });
    } else {
      const packageDir = pkg.packagePath === "." ? repoDir : path.join(repoDir, pkg.packagePath);
      const browserFile = path.join(packageDir, pkg.browserPath);

      if (fs.existsSync(browserFile)) {
        const content = fs.readFileSync(browserFile);
        fs.appendFileSync(outputEcosystemFile, content);
        console.log(`Added ${pkg.name} to ecosystem package (${browserFile})`);
      } else {
        console.warn(`Warning: ${browserFile} not found for ${pkg.name}`);
      }
    }
  });
}

// Output file stats
const ecosystemStats = fs.statSync(outputEcosystemFile);
console.log(`\nCreated ${outputEcosystemFile} (${(ecosystemStats.size / 1024 / 1024).toFixed(2)} MB)`);
console.log("Done!");
