import { validateConstructionWindowCuts } from "../runtime/ConstructionWindowCutAsset";
import { parseBufferMeshData, parseTexturePixelsData } from "@galacean/engine-loader";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { buildingGeometry, validateBuildingMesh, type BuildingQueryMesh } from "./BuildingGeometry";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { assemblyEmissionOrigin, assemblyRole, validateAssemblyPart, type BuildingAssembly } from "./BuildingAssembly";

/** Candidate validation reads native source/resources without installing VFS mappings or
 * allocating GPU assets. It shares the Engine's mesh decoder and runtime geometry queries. */
export async function validateBuildingAssetKit(pack: RuntimeProjectPackage, path: string, signal: AbortSignal) {
  const files = new Map(pack.project.files.map((file) => [file.virtualPath, file]));
  const read = async (path: string, type: string) => {
    const file = files.get(path);
    if (file?.type !== type) throw Error(`Building asset '${path}' must be ${type}`);
    if (pack.contents[path] !== undefined) return pack.contents[path];
    const response = await fetch(file.path, { signal });
    if (!response.ok) throw Error(`Failed to read building asset '${path}': ${response.status}`);
    const value = new Uint8Array(await response.arrayBuffer());
    signal.throwIfAborted();
    return value;
  };
  const json = async (path: string, type: string) => {
    const content = await read(path, type);
    return JSON.parse(typeof content === "string" ? content : new TextDecoder().decode(content));
  };
  const ref = (value: unknown, type: string): string => {
    const path = (value as { $ref?: string })?.$ref;
    if (typeof path !== "string" || files.get(path)?.type !== type)
      throw Error(`Building requires a native ${type} reference`);
    return path;
  };
  const prefab = async (path: string, kind: string) => {
    const source = await json(path, "Prefab");
    if (source.asset?.version !== "2.0") throw Error("Building units require native Source Prefabs");
    const root = source.entities.find((e: { id: string }) => e.id === source.root);
    if (!root) throw Error("Building prefab root is missing");
    const components = source.components.filter((c: { id: string }) => root.components?.includes(c.id));
    const metadata = components.filter((c: { type: string }) => c.type === kind);
    if (metadata.length !== 1) throw Error(`Building prefab requires exactly one ${kind}`);
    // Unit transforms are baked into the native mesh at import. Do not silently ignore an authored pose.
    if (
      root.children?.length ||
      root.instance ||
      root.position?.some((v: number) => v !== 0) ||
      root.rotation?.some((v: number) => v !== 0) ||
      root.scale?.some((v: number) => v !== 1)
    )
      throw Error("Building unit prefab requires an identity root and direct components");
    if (metadata[0].calls?.length) throw Error("Building asset metadata uses declarative properties");
    return { props: metadata[0].props, components };
  };
  const meshes = new Map<string, Promise<BuildingQueryMesh>>();
  const mesh = (reference: unknown) => {
    const path = ref(reference, "Mesh");
    let result = meshes.get(path);
    if (!result) {
      result = (async () => {
        const content = await read(path, "Mesh");
        if (typeof content === "string") throw Error("Native Mesh must be binary");
        const { data, vertices, indexBytes } = parseBufferMeshData(Uint8Array.from(content).buffer);
        const mesh = {
          vertexElements: data.vertexElements,
          vertexBufferBindings: data.vertexBuffers.map((b, i) => ({ stride: b.stride, buffer: { data: vertices[i] } })),
          indexBufferBinding: { format: data.indices.format, buffer: { data: indexBytes } },
          subMeshes: data.subMeshes,
          bounds: data.bounds
        } as unknown as BuildingQueryMesh;
        validateBuildingMesh(mesh);
        return mesh;
      })();
      meshes.set(path, result);
    }
    return result;
  };
  const checkedMaterials = new Map<string, Promise<void>>();
  const material = (reference: unknown) => {
    const path = ref(reference, "Material");
    let pending = checkedMaterials.get(path);
    if (!pending) {
      pending = (async () => {
        const value = await json(path, "Material"),
          shaderPath = value.shaderRef?.url;
        if (typeof shaderPath !== "string" || files.get(shaderPath)?.type !== "Shader")
          throw Error("Building Material requires a native placement Shader reference");
        const shader = await json(shaderPath, "Shader"),
          pass = shader.subShaders?.[0]?.passes?.[0];
        for (const field of ["vertexShaderInstructions", "fragmentShaderInstructions"])
          if (
            !Array.isArray(pass?.[field]) ||
            !pass[field].length ||
            pass[field].some((i: unknown[]) => !Array.isArray(i) || i[0] !== 0 || typeof i[1] !== "string")
          )
            throw Error("Building unit Shader requires an explicit placement program");
        for (const entry of Object.values(value.shaderData ?? {}) as any[])
          if (entry.type === "Texture" && files.get(entry.value?.url)?.type !== "Texture")
            throw Error("Building Material requires native Texture references");
      })();
      checkedMaterials.set(path, pending);
    }
    return pending;
  };
  const { props: kit } = await prefab(path, "BuildingAssetKitComponent");
  await material(kit.woodArchMaterial);
  await material(kit.decorationMaterial);
  const units = async (references: Record<string, unknown>, arrangement: boolean) =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(references ?? {}).map(async ([name, reference]) => {
          const { props, components } = await prefab(ref(reference, "Prefab"), "BuildingUnitComponent");
          const renderers = components.filter((c: { type: string }) => c.type === "MeshRenderer");
          if (renderers.length !== 1) throw Error("Building unit requires exactly one MeshRenderer");
          const materials = renderers[0].calls?.filter((c: { method: string }) => c.method === "setMaterial") ?? [];
          if (materials.length !== 1) throw Error("Building unit requires its Material");
          await material(materials[0].args?.[0]);
          if (arrangement) {
            if (![48, 64, 80, 96, 128].includes(props.instanceStride))
              throw Error("Invalid building unit instance stride");
            if (props.lodMesh) await mesh(props.lodMesh);
            if (props.sdfMaterial) await material(props.sdfMaterial);
          }
          return [name, { ...props, mesh: await mesh(renderers[0].props?.mesh) }];
        })
      )
    );
  for (const value of Object.values(kit.textures ?? {})) ref(value, "Texture");
  const cutPath = ref(kit.textures?.[kit.windowCuts?.texture], "Texture");
  const cutBytes = await read(cutPath, "Texture");
  if (typeof cutBytes === "string") throw Error("Window-cut atlas requires a native Texture array");
  const cutTexture = parseTexturePixelsData(Uint8Array.from(cutBytes).buffer).data;
  if (cutTexture.dimension !== "2d-array") throw Error("Window-cut atlas requires a Texture2DArray");
  validateConstructionWindowCuts(kit.windowCuts, { [kit.windowCuts.texture]: cutTexture });
  for (const value of Object.values(kit.neutralTextures ?? {})) ref(value, "Texture");
  const [renderUnits, decorations, gothic, spire] = await Promise.all([
    units(kit.units, true),
    units(kit.decorations, false),
    Promise.all(
      Object.entries(kit.gothic ?? {}).map(async ([rank, value]) => [
        rank,
        { ...(value as object), mesh: await mesh((value as { mesh: unknown }).mesh) }
      ])
    ),
    mesh(kit.roofSpireMesh)
  ]);
  const unitNames = new Map(
    Object.entries(kit.units ?? {}).map(([name, reference]) => [ref(reference, "Prefab"), name])
  );
  const assemblies: Record<string, BuildingAssembly> = {};
  for (const [key, reference] of Object.entries(kit.assemblies ?? {})) {
    const source = await json(ref(reference, "Prefab"), "Prefab");
    if (source.asset?.version !== "2.0") throw Error("Assembly requires a native Source Prefab");
    const entities = new Map<string, any>(source.entities.map((e: any) => [e.id, e]));
    const components = new Map<string, any>(source.components.map((c: any) => [c.id, c]));
    if (entities.size !== source.entities.length || components.size !== source.components.length)
      throw Error("Duplicate assembly Source identity");
    const visited = new Set<string>(),
      names = new Set<string>();
    const selected: BuildingAssembly["selected"] = [];
    const vector = (value: number[] | undefined, defaults: number[]) => {
      const v = value ?? defaults;
      if (v.length !== 3 || !v.every(Number.isFinite)) throw Error("Invalid assembly TRS");
      return new Vector3(v[0], v[1], v[2]);
    };
    const walk = async (id: string, parent: Matrix, path: string) => {
      const entity = entities.get(id);
      if (!entity || visited.has(id)) throw Error("Invalid assembly hierarchy");
      visited.add(id);
      if (entity.instance || entity.isActive === false) throw Error("Assembly requires active authored nodes");
      if (id !== source.root) {
        if (!entity.name || entity.name.includes("/"))
          throw Error("Assembly child requires a unique path segment name");
        path = path ? `${path}/${entity.name}` : entity.name;
        if (names.has(path)) throw Error("Duplicate assembly child path");
        names.add(path);
      }
      const members = (entity.components ?? []).map((id: string) => components.get(id));
      if (
        members.some(
          (c: any) =>
            !c ||
            !["BuildingAssemblyComponent", "BuildingUnitComponent", "MeshRenderer"].includes(c.type) ||
            c.props?.enabled === false
        )
      )
        throw Error("Unsupported or disabled building assembly component");
      if (id === source.root && members.filter((c: any) => c.type === "BuildingAssemblyComponent").length !== 1)
        throw Error("Assembly requires BuildingAssemblyComponent");
      const position = vector(entity.position, [0, 0, 0]),
        rotation = vector(entity.rotation, [0, 0, 0]),
        scale = vector(entity.scale, [1, 1, 1]);
      const q = new Quaternion(),
        local = new Matrix(),
        world = new Matrix();
      if (Math.min(scale.x, scale.y, scale.z) <= 0) throw Error("Assembly requires positive scale");
      Quaternion.rotationEuler(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
        q
      );
      Matrix.affineTransformation(scale, q, position, local);
      Matrix.multiply(parent, local, world);
      const renderers = members.filter((c: any) => c.type === "MeshRenderer");
      const metadata = members.filter((c: any) => c.type === "BuildingUnitComponent");
      if (renderers.length || metadata.length) {
        if (
          renderers.length !== 1 ||
          metadata.length !== 1 ||
          metadata[0].calls?.length ||
          metadata[0].props?.family !== "decoration"
        )
          throw Error("Assembly part requires one decoration unit and MeshRenderer");
        const calls = renderers[0].calls ?? [];
        if (calls.length !== 1 || calls[0].method !== "setMaterial")
          throw Error("Assembly renderer requires its native Material");
        await material(calls[0].args?.[0]);
        const name = `${key}/${path}`,
          matrix = Array.from(world.elements);
        validateAssemblyPart(name, matrix, metadata[0].props.surfaceKind);
        if (Object.hasOwn(decorations, name)) throw Error("Duplicate assembly part: " + name);
        decorations[name] = { ...metadata[0].props, localMatrix: matrix, mesh: await mesh(renderers[0].props?.mesh) };
        const props = metadata[0].props,
          role = assemblyRole(props.attachment === undefined ? "body" : props.attachment);
        const stonePath = props.stoneFrame != null ? ref(props.stoneFrame, "Prefab") : undefined;
        const stoneTemplate = stonePath ? (unitNames.get(stonePath) ?? `stone-frame/${name}`) : undefined;
        if (stoneTemplate) {
          if (role !== "frame") throw Error("Stone alternative requires frame attachment");
          if (!renderUnits[stoneTemplate])
            Object.assign(renderUnits, await units({ [stoneTemplate]: props.stoneFrame }, true));
          if (renderUnits[stoneTemplate].family !== "stone-decoration")
            throw Error("Stone alternative requires a stone-decoration unit");
          unitNames.set(stonePath!, stoneTemplate);
        }
        selected.push([
          name,
          path,
          props.surfaceKind,
          assemblyEmissionOrigin(props.emissionOrigin, matrix),
          { role, ...(stoneTemplate ? { stoneTemplate, localMatrix: matrix } : {}) }
        ]);
      }
      for (const child of entity.children ?? []) await walk(child, world, path);
    };
    await walk(source.root, new Matrix(), "");
    if (!selected.length || visited.size !== entities.size) throw Error("Empty or disconnected assembly hierarchy");
    assemblies[key] = { selected };
  }
  signal.throwIfAborted();
  return buildingGeometry(
    { ...kit, gothic: Object.fromEntries(gothic), roofSpireMesh: spire },
    renderUnits,
    decorations,
    assemblies
  );
}
