import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const worldPath = "world/package.json";
const workspaces = ["packages/*", "tests", "examples", "e2e", "world"];
const npmVersion = "10.9.3";

const git = spawnSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" });
if (git.status !== 0 || !existsSync(join(git.stdout.trim(), "commondir"))) {
  throw new Error(
    "Use a dedicated Git worktree for Seed World npm builds. This command rewrites workspace manifests and runs npm ci."
  );
}

prepareNpmWorkspace();
const installFlags = ["--no-audit", "--no-fund", "--prefer-offline"];
if (!existsSync(join(root, "package-lock.json"))) {
  run("npm", ["install", "--package-lock-only", "--ignore-scripts", ...installFlags]);
}
run("npm", ["ci", ...installFlags], { ...process.env, HUSKY: "0", ELECTRON_SKIP_BINARY_DOWNLOAD: "1" });
run("npm", ["run", "b:module"]);
run("npm", ["run", "prepare:engine", "--workspace", "world"]);
run(process.execPath, ["world/scripts/prepare-terrain-shaders.mjs"]);
run("npm", ["run", "build:seed-world-flash-app", "--workspace", "world"]);
run("npm", ["run", "build:seed-world-flash-source", "--workspace", "world"]);

function prepareNpmWorkspace() {
  const packagePaths = readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/package.json`);
  const paths = [...packagePaths, ...workspaces.slice(1).map((dir) => `${dir}/package.json`)];
  const originals = new Map(
    [...paths, "package.json"]
      .filter((path) => existsSync(join(root, path)))
      .map((path) => [path, readFileSync(join(root, path), "utf8")])
  );
  const manifests = new Map(Array.from(originals, ([path, text]) => [path, JSON.parse(text)]));
  const versions = new Map(
    paths
      .filter((path) => manifests.has(path))
      .map((path) => {
        const { name, version } = manifests.get(path);
        return [name, version];
      })
  );

  for (const [path, manifest] of manifests) {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (spec === "workspace:*" && versions.get(name)) {
          manifest[field][name] = versions.get(name);
        } else if (spec.startsWith("workspace:")) {
          throw new Error(`Cannot resolve ${name}@${spec} in ${path}`);
        }
      }
    }
  }

  const engine = manifests.get("package.json");
  engine.packageManager = `npm@${npmVersion}`;
  engine.workspaces = workspaces;
  if (engine.scripts.preinstall === "npx only-allow pnpm") {
    delete engine.scripts.preinstall;
  }

  engine.overrides ??= {};
  // The pnpm lock already resolves these peer dependencies to the local Engine prerelease.
  for (const toolkit of ["controls", "stats"]) {
    const name = `@galacean/engine-toolkit-${toolkit}@1.6.0`;
    engine.overrides[name] = { ...engine.overrides[name], "@galacean/engine": versions.get("@galacean/engine") };
  }

  const compiler = "npm --workspace @galacean/engine-shader-compiler run build";
  rewriteScript(engine, "b:compiler", "pnpm -F @galacean/engine-shader-compiler run build", compiler);
  rewriteScript(
    engine,
    "precompile",
    "pnpm -F @galacean/engine-shader precompile",
    "npm --workspace @galacean/engine-shader run precompile"
  );
  rewriteScript(
    manifests.get(worldPath),
    "prepare:engine",
    "pnpm --filter @galacean/engine-shader-compiler build && pnpm --filter @galacean/engine-shader precompile",
    `${compiler} && npm --workspace @galacean/engine-shader run precompile`
  );

  for (const [path, manifest] of manifests) {
    const value = JSON.stringify(manifest);
    if (JSON.stringify(JSON.parse(originals.get(path))) !== value) {
      writeFileSync(join(root, path), `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }
}

function rewriteScript(manifest, key, pnpmCommand, npmCommand) {
  const current = manifest.scripts[key];
  if (!current?.includes(pnpmCommand) && !current?.includes(npmCommand)) {
    throw new Error(`Unexpected ${manifest.name} script: ${key}`);
  }
  manifest.scripts[key] = current.replace(pnpmCommand, npmCommand);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
