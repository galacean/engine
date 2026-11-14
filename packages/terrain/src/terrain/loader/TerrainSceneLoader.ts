import { AssetType, Engine, JSONAsset, Scene, Shader, WebGLEngine } from "@galacean/engine";
import "../compression/TerrainBrotliLoaders";
import type { TerrainProjectFile } from "../project/TerrainProjectContract";

/** Progress emitted while a Terrain project manifest or Scene is loading. */
export type TerrainSceneLoadProgress = (loaded: number, total: number, phase: "project" | "scene") => void;

/** Explicit Scene selection for one registered Terrain project. */
export interface TerrainSceneLoadOptions {
  /** Absolute or document-relative URL of the project manifest. */
  projectUrl: URL | string;
  /** Virtual Scene path. Defaults to the manifest's `scene` field. */
  scenePath?: string;
  /** Receives standard ResourceManager progress for the manifest and selected Scene. */
  onProgress?: TerrainSceneLoadProgress;
}

/**
 * Registers every virtual resource declared by a standard Terrain Project without loading its Scene.
 * @param engine Engine whose ResourceManager owns the virtual resource table.
 * @param projectUrl Absolute or document-relative URL of the Project manifest.
 * @returns Parsed and validated Project declaration.
 * @throws If the Project manifest or any file declaration is invalid.
 */
export async function registerTerrainProjectResources(
  engine: Engine,
  projectUrl: URL | string
): Promise<TerrainProjectFile> {
  const resolvedProjectUrl = resolveProjectUrl(projectUrl);
  const loadedProject = await engine.resourceManager.load<JSONAsset>({
    type: AssetType.JSON,
    url: resolvedProjectUrl.href
  });
  if (!(loadedProject instanceof JSONAsset)) {
    throw new Error(`Terrain project ${resolvedProjectUrl.href} did not resolve to JSONAsset`);
  }

  const project = loadedProject.data as TerrainProjectFile;
  validateProject(project, resolvedProjectUrl.href);
  engine.resourceManager.registerVirtualResources(
    project.files.map((file) => ({
      ...file,
      path: new URL(file.path, resolvedProjectUrl.href).href
    }))
  );
  return project;
}

/** Loads every declared Shader asset so exact Variant replay never depends on a later Material load. */
export async function preloadTerrainProjectShaders(
  engine: Engine,
  project: TerrainProjectFile
): Promise<readonly Shader[]> {
  return Promise.all(
    project.files
      .filter((file) => file.type === "Shader")
      .map(async (file) => {
        const loaded = (await engine.resourceManager.load({
          type: AssetType.Shader,
          url: file.virtualPath
        })) as unknown;
        if (!(loaded instanceof Shader)) {
          throw new Error(`Terrain project Shader '${file.virtualPath}' did not resolve to Shader`);
        }
        return loaded;
      })
  );
}

/**
 * Registers a standard Terrain project and loads one selected Scene.
 *
 * The manifest only registers virtual resources. Dependent terrain Regions remain lazy and are
 * requested by the Scene-owned runtime after the selected Scene has been activated.
 *
 * @param engine Engine that owns the ResourceManager and Scene.
 * @param options Project URL, optional Scene path, and progress callback.
 * @returns The selected Scene after all Scene-owned startup parsing has completed.
 * @throws If the manifest is malformed or the selected Scene is not declared.
 */
export async function loadTerrainScene(engine: WebGLEngine, options: TerrainSceneLoadOptions): Promise<Scene> {
  const projectUrl = resolveProjectUrl(options.projectUrl);
  const projectAsset = engine.resourceManager.load<JSONAsset>({
    type: AssetType.JSON,
    url: projectUrl.href
  });
  projectAsset.onProgress((loaded, total) => options.onProgress?.(loaded, total, "project"));
  const loadedProject = await projectAsset;
  if (!(loadedProject instanceof JSONAsset)) {
    throw new Error(`Terrain project ${projectUrl.href} did not resolve to JSONAsset`);
  }

  const project = loadedProject.data as TerrainProjectFile;
  validateProject(project, projectUrl.href);
  engine.resourceManager.registerVirtualResources(
    project.files.map((file) => ({ ...file, path: new URL(file.path, projectUrl.href).href }))
  );

  const scenePath = options.scenePath ?? project.scene;
  if (!project.files.some((file) => file.virtualPath === scenePath && file.type === "Scene")) {
    throw new Error(`Terrain project does not declare Scene "${scenePath}"`);
  }
  const sceneAsset = engine.resourceManager.load<Scene>({ type: AssetType.Scene, url: scenePath });
  sceneAsset.onProgress((loaded, total) => options.onProgress?.(loaded, total, "scene"));
  const scene = await sceneAsset;
  engine.sceneManager.activeScene = scene;
  return scene;
}

function resolveProjectUrl(projectUrl: URL | string): URL {
  if (projectUrl instanceof URL) return projectUrl;
  return new URL(projectUrl, globalThis.location?.href);
}

function validateProject(project: TerrainProjectFile, url: string): void {
  if (!project || typeof project !== "object" || !Array.isArray(project.files)) {
    throw new Error(`Terrain project ${url} requires a files array`);
  }
  if (typeof project.scene !== "string" || project.scene.length === 0) {
    throw new Error(`Terrain project ${url} requires a default scene`);
  }
  const virtualPaths = new Set<string>();
  for (const file of project.files) {
    if (
      !file ||
      typeof file.virtualPath !== "string" ||
      typeof file.path !== "string" ||
      typeof file.type !== "string" ||
      file.virtualPath.length === 0 ||
      file.path.length === 0
    ) {
      throw new Error(`Terrain project ${url} contains an invalid file declaration`);
    }
    if (virtualPaths.has(file.virtualPath)) {
      throw new Error(`Terrain project ${url} contains duplicate virtual path "${file.virtualPath}"`);
    }
    virtualPaths.add(file.virtualPath);
  }
}
