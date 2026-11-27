import { AssetType, DiffuseMode, type Engine, type Scene, type VirtualResource } from "@galacean/engine";

interface ProjectDocument {
  readonly scene: string;
  readonly files: readonly (VirtualResource & { readonly id?: string })[];
}

interface SceneDocument {
  scene?: {
    ambient?: {
      diffuseMode?: DiffuseMode;
      ambientLight?: number;
      customAmbientLight?: number;
    };
  };
}

/** Loads a Project Scene while deliberately excluding file-backed environment IBL. */
export async function loadProjectWithoutBakedAmbient(engine: Engine, projectUrl: string): Promise<Scene> {
  const project = await fetchJSON<ProjectDocument>(projectUrl, "Project");
  const sceneResource = project.files.find((file) => file.virtualPath === project.scene);
  if (!sceneResource) {
    throw new Error(`Project Scene resource "${project.scene}" is missing from ${projectUrl}.`);
  }

  const sceneDocument = await fetchJSON<SceneDocument>(sceneResource.path, "Scene");
  const ambient = sceneDocument.scene?.ambient;
  if (ambient) {
    delete ambient.ambientLight;
    delete ambient.customAmbientLight;
    // Keep the authored solid color as the startup fallback until the first runtime IBL transaction publishes.
    ambient.diffuseMode = DiffuseMode.SolidColor;
  }

  const runtimeResources = project.files.filter(
    (file) =>
      file !== sceneResource &&
      file.type !== AssetType.AmbientLight &&
      !file.virtualPath.toLowerCase().endsWith(".amblight")
  );
  engine.resourceManager.registerVirtualResources(runtimeResources);

  const sceneUrl = URL.createObjectURL(new Blob([JSON.stringify(sceneDocument)], { type: "application/json" }));
  try {
    const scene = await engine.resourceManager.load<Scene>({ type: AssetType.Scene, url: sceneUrl });
    engine.sceneManager.activeScene = scene;
    return scene;
  } finally {
    URL.revokeObjectURL(sceneUrl);
  }
}

async function fetchJSON<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} request failed with ${response.status}: ${url}`);
  }
  return (await response.json()) as T;
}
