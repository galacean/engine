const fs = require("fs");
const os = require("os");
const path = require("path");
const { nodeResolve } = require("@rollup/plugin-node-resolve");
const { rollup } = require("rollup");

const packagesRoot = path.resolve(__dirname, "../packages");
const umdOutputPattern = /(?:^|\/)browser(?:\.verbose)?(?:\.min)?\.js$/;
const ignoredDirectories = new Set(["dist", "node_modules", "types"]);
const typeOnlyPackages = new Set(["@galacean/engine-design"]);

function collectPackageJsonPaths(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        collectPackageJsonPaths(path.join(directory, entry.name), result);
      }
    } else if (entry.name === "package.json") {
      result.push(path.join(directory, entry.name));
    }
  }

  return result;
}

function collectBrowserTargets(browserEntry) {
  if (typeof browserEntry === "string") {
    return [browserEntry];
  }

  if (browserEntry && typeof browserEntry === "object" && !Array.isArray(browserEntry)) {
    return Object.values(browserEntry).filter((target) => typeof target === "string");
  }

  return [];
}

const packageJsonPaths = collectPackageJsonPaths(packagesRoot);
const packages = packageJsonPaths.map((packageJsonPath) => ({
  directory: path.dirname(packageJsonPath),
  packageJsonPath,
  packageJson: JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
}));

function validateBrowserEntries() {
  const violations = [];

  for (const { packageJson, packageJsonPath } of packages) {
    for (const browserTarget of collectBrowserTargets(packageJson.browser)) {
      if (umdOutputPattern.test(browserTarget)) {
        violations.push(
          `${path.relative(packagesRoot, packageJsonPath)}: browser points to the UMD artifact "${browserTarget}"`
        );
      }
    }
  }

  return violations;
}

async function validateBrowserResolution() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "galacean-package-entries-"));
  const violations = [];
  const publicPackages = packages.filter(
    ({ packageJson }) => packageJson.name && packageJson.module && !typeOnlyPackages.has(packageJson.name)
  );
  const targets = publicPackages.map(({ directory, packageJson }) => ({
    expectedModule: path.resolve(directory, packageJson.module),
    specifier: packageJson.name
  }));

  const shaderCompiler = publicPackages.find(
    ({ packageJson }) => packageJson.name === "@galacean/engine-shader-compiler"
  );
  const verboseExport = shaderCompiler?.packageJson.exports?.["./verbose"]?.import;

  if (verboseExport) {
    targets.push({
      expectedModule: path.resolve(shaderCompiler.directory, verboseExport),
      specifier: "@galacean/engine-shader-compiler/verbose"
    });
  }

  try {
    for (const { directory, packageJson } of publicPackages) {
      const linkPath = path.join(tempRoot, "node_modules", ...packageJson.name.split("/"));
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      fs.symlinkSync(directory, linkPath, process.platform === "win32" ? "junction" : "dir");
    }

    for (const { expectedModule, specifier } of targets) {
      const entryPath = path.join(tempRoot, "entry.js");
      let bundle;

      try {
        bundle = await rollup({
          input: entryPath,
          external: (source) => source.startsWith("@galacean/") && source !== specifier,
          plugins: [
            {
              name: "package-entry-probe",
              load(id) {
                if (id === entryPath) {
                  return `import * as packageNamespace from ${JSON.stringify(
                    specifier
                  )}; console.log(packageNamespace);`;
                }
              },
              resolveId(id) {
                if (id === entryPath) {
                  return id;
                }
              }
            },
            nodeResolve({ browser: true })
          ],
          treeshake: false
        });
      } catch (error) {
        violations.push(`${specifier}: browser resolution failed (${error.message})`);
        continue;
      }

      const resolvedFiles = bundle.watchFiles.map((file) => path.resolve(file));

      if (!resolvedFiles.includes(expectedModule)) {
        const resolvedPackageFiles = resolvedFiles
          .filter((file) => file.includes(`${path.sep}packages${path.sep}`))
          .map((file) => path.relative(packagesRoot, file));
        violations.push(
          `${specifier}: expected ${path.relative(packagesRoot, expectedModule)}, resolved ${
            resolvedPackageFiles.join(", ") || "no package module"
          }`
        );
      }

      await bundle.close();
    }
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }

  return violations;
}

async function main() {
  const violations = [...validateBrowserEntries(), ...(await validateBrowserResolution())];

  if (violations.length > 0) {
    console.error(
      [
        "Invalid package entry contracts:",
        ...violations.map((violation) => `- ${violation}`),
        "",
        "Rollup reserves browser*.js for UMD distribution. Expose ESM/CJS through module, main, or exports, and UMD through unpkg/jsdelivr."
      ].join("\n")
    );
    process.exit(1);
  }

  console.log(`Validated ${packageJsonPaths.length} package manifests and their browser module resolution.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
