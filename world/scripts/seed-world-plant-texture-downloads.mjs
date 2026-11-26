import { createHash } from "node:crypto";
import path from "node:path";

const projectFile = "packages/terrain/src/data/seed-world/project.json";
const projectDirectory = path.posix.dirname(projectFile);
const plantRoot = "packages/vegetation/src/asset-assembly/generated/procedural-trees/";

function digest(source) {
  return createHash("sha256").update(source).digest("hex");
}

/** Add manifest-relative download aliases for byte-identical project and Vite assets. */
export function seedWorldPlantTextureDownloads() {
  return {
    name: "seed-world-plant-texture-downloads",
    generateBundle(_options, bundle) {
      const manifest = bundle[projectFile];
      if (manifest?.type !== "asset") return;

      const destinations = new Map();
      for (const file of Object.values(bundle)) {
        if (file.type === "asset" && file.fileName.startsWith("assets/") && file.fileName.endsWith(".png")) {
          destinations.set(digest(file.source), file.fileName);
        }
      }
      const project = JSON.parse(Buffer.from(manifest.source).toString("utf8"));
      const aliases = {};
      for (const { type, path: sourcePath } of project.files) {
        if (type !== "Texture") continue;
        const sourceFile = path.posix.normalize(path.posix.join(projectDirectory, sourcePath));
        if (!sourceFile.startsWith(plantRoot) || !sourceFile.endsWith(".png")) continue;
        const image = bundle[sourceFile];
        if (image?.type !== "asset") continue;
        const target = destinations.get(digest(image.source));
        if (target) aliases[sourcePath] = path.posix.relative(projectDirectory, target);
      }
      if (Object.keys(aliases).length) {
        project.textureDownloadPaths = aliases;
        manifest.source = JSON.stringify(project, null, 2) + "\n";
      }
    }
  };
}
