import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoots = new Map(
  readdirSync(join(root, "packages")).flatMap((directory) => {
    const packageRoot = join(root, "packages", directory);
    try {
      return [[JSON.parse(readFileSync(join(packageRoot, "package.json"))).name, packageRoot]];
    } catch {
      return [];
    }
  })
);
const temporaryRoot = mkdtempSync(join(tmpdir(), "galacean-declarations-"));
const archives = join(temporaryRoot, "archives");
const nodeModules = join(temporaryRoot, "node_modules");
const installed = new Set();
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("This check must run from a package script");
mkdirSync(archives);

function installPackage(name) {
  if (installed.has(name)) return;
  installed.add(name);

  const packageRoot = packageRoots.get(name);
  if (!packageRoot) throw new Error(`Missing workspace package ${name}`);

  const existingArchives = new Set(readdirSync(archives));
  execFileSync(process.execPath, [pnpm, "pack", "--pack-destination", archives], {
    cwd: packageRoot,
    stdio: "ignore"
  });
  const archive = readdirSync(archives).find((file) => !existingArchives.has(file));
  if (!archive) throw new Error(`pnpm pack did not create an archive for ${name}`);

  const destination = join(nodeModules, ...name.split("/"));
  mkdirSync(destination, { recursive: true });
  execFileSync("tar", ["-xzf", join(archives, archive), "--strip-components=1", "-C", destination]);
  const manifest = JSON.parse(readFileSync(join(destination, "package.json")));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (packageRoots.has(dependency)) installPackage(dependency);
  }
}

try {
  mkdirSync(nodeModules);
  installPackage("@galacean/engine-shader");
  writeFileSync(
    join(temporaryRoot, "index.ts"),
    'import { PBRSource } from "@galacean/engine-shader";\nvoid PBRSource;\n'
  );
  writeFileSync(
    join(temporaryRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "esnext",
        moduleResolution: "node",
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        target: "esnext",
        types: []
      },
      include: ["index.ts"]
    })
  );
  execFileSync(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-p", temporaryRoot], {
    stdio: "inherit"
  });
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
