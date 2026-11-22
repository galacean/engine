import type { BenchmarkCaseDefinition } from "./benchmark-cases.ts";
import {
  INITIAL_ENTITY_IDS,
  allCalledTools,
  combinedFinalText,
  entityAssetRef,
  entityName,
  entityPos,
  getAllProjectSceneData,
  hasTool,
  isUserBuildingPrefab
} from "./benchmark-cases.ts";

const REPLY_LEAK_RE = /\b(?:tools\.[a-z]+\.[a-zA-Z]+|editor\.[a-z]+\.[a-zA-Z]+|skills\/|declare\/|\.d\.ts|committedAt|versionToken)\b/;

/**
 * Extended v4 Benchmark Cases (44–100, 57 cases) completing:
 * - Part A (44–65, 22 cases): 100% coverage of all 23 skills (15 top + 8 sub-skills) and 70 public tools + native file tools
 * - Part B (66–100, 35 cases): Spatial relative refs (6), multi-turn refinement (8), voice ASR typos (6),
 *   cross-domain compound orchestration (8), and redlines/boundaries/recovery (7).
 */
export const EXTENDED_V4_CASES: readonly BenchmarkCaseDefinition[] = [
  // =========================================================================
  // PART A: Atomic API & Sub-Skill CRUD Completeness (44–65, 22 cases)
  // =========================================================================
  {
    id: "44_environment_explicit_read_tools",
    name: "环境只读 API：精确查询当前时间、风速、云量与雾浓度（零修改）",
    category: "environment-read",
    turns: ["请通过环境查询工具读取当前准确的时间、季节、风速（米/秒）、云量和雾浓度数值，不要修改任何设置。"],
    expectedSkills: ["skills/environment/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/time.get.d.ts", "declare/editor/world/tools/atmosphere.get.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const muts = fixture.state.getEnvironmentMutations();
      const reply = combinedFinalText(turns);
      const readTools = hasTool(called, "tools.time.get") || hasTool(called, "tools.atmosphere.get");
      return [
        { name: "called_env_read_tools", pass: readTools, detail: `called=${[...called].join(",")}` },
        { name: "zero_environment_mutations", pass: muts.length === 0, detail: `muts=${muts.length}` },
        { name: "reported_numeric_values", pass: /\d/.test(reply), detail: `reply=${reply.slice(0, 140)}` }
      ];
    }
  },
  {
    id: "45_building_tower_and_wall",
    name: "建筑子生成器 C：生成一座高塔和一段城墙并放入场景",
    category: "building-crud",
    turns: ["在玩家前方偏左位置建一座 9 米高的石塔（buildTower），旁边再配一段 6 米长的围墙（buildWall），都放入场景。"],
    expectedSkills: ["skills/building/SKILL.md", "skills/building/references/planning.md"],
    expectedDeclares: ["declare/editor/world/tools/building.generate.d.ts", "declare/editor/native/api.d.ts"],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { sceneJson, prefabs } = getAllProjectSceneData(fixture);
      const userPrefabs = Object.keys(prefabs).filter(isUserBuildingPrefab);
      const userEntities = (sceneJson.entities ?? []).filter((e: any) => !INITIAL_ENTITY_IDS.has(e.id));
      return [
        { name: "called_building_generate", pass: hasTool(called, "tools.building.generate"), detail: `called=${[...called].join(",")}` },
        { name: "created_tower_and_wall_assets", pass: userPrefabs.length >= 2 || userEntities.length >= 2, detail: `prefabs=${userPrefabs.length}, entities=${userEntities.length}` }
      ];
    }
  },
  {
    id: "46_building_fence_and_steps",
    name: "建筑子生成器 C：生成木栅栏与石台阶并实例化到场景",
    category: "building-crud",
    turns: ["在 (12, 0, -10) 附近建一段 2 米高的栅栏（buildFence）和一段 5 级台阶（buildSteps），放到场景中。"],
    expectedSkills: ["skills/building/SKILL.md", "skills/building/references/planning.md"],
    expectedDeclares: ["declare/editor/world/tools/building.generate.d.ts", "declare/editor/native/api.d.ts"],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { sceneJson, prefabs } = getAllProjectSceneData(fixture);
      const userPrefabs = Object.keys(prefabs).filter(isUserBuildingPrefab);
      const userEntities = (sceneJson.entities ?? []).filter((e: any) => !INITIAL_ENTITY_IDS.has(e.id));
      return [
        { name: "called_building_generate", pass: hasTool(called, "tools.building.generate"), detail: `called=${[...called].join(",")}` },
        { name: "placed_fence_and_steps", pass: userPrefabs.length >= 1 && userEntities.length >= 1, detail: `prefabs=${userPrefabs.length}, entities=${userEntities.length}` }
      ];
    }
  },
  {
    id: "47_water_capabilities_and_drops",
    name: "水体 R：查询水体宿主能力、湖泊材质槽与跌水瀑布采样（只读）",
    category: "water-read",
    turns: ["先查一下当前宿主支持哪些水体能力以及湖泊材质公开了哪些参数和纹理槽，再采样检查 (0, 0, 0) 处有没有跌水/水帘。不要修改场景。"],
    expectedSkills: ["skills/water/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/water.capabilities.d.ts",
      "declare/editor/world/tools/water.sampleDrops.d.ts"
    ],
    optimalSteps: 4,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_water_capabilities", pass: hasTool(called, "tools.water.capabilities"), detail: `called=${[...called].join(",")}` },
        { name: "called_water_sampleDrops", pass: hasTool(called, "tools.water.sampleDrops"), detail: `called=${[...called].join(",")}` },
        { name: "no_write_mutations", pass: !hasTool(called, "editor.component.update") && !hasTool(called, "tools.water.digRiver"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "48_water_manual_create_lake_component",
    name: "水体 C：参考现有湖泊配置，手动新建一个独立的 WaterBodyComponent 小池塘",
    category: "water-crud",
    turns: ["参考场景里现有的湖泊水体配置，在 (-16, 0, -14) 新建一个名为 'GardenPond' 的节点并挂载 WaterBodyComponent 作为独立小池塘，不要删改原来的湖泊。"],
    expectedSkills: ["skills/water/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const waterComps = (sceneJson.components ?? []).filter((c: any) => c.type === "WaterBodyComponent");
      const pond = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "GardenPond");
      const originalLake = (sceneJson.components ?? []).some((c: any) => c.id === "lake-body");
      return [
        { name: "created_second_water_body", pass: waterComps.length >= 2, detail: `waterBodies=${waterComps.length}` },
        { name: "garden_pond_entity_exists", pass: Boolean(pond), detail: `pond=${Boolean(pond)}` },
        { name: "original_lake_intact", pass: originalLake, detail: `originalLake=${originalLake}, called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "49_water_instance_material_clone_edit",
    name: "水体 U（实例独立材质）：复制湖泊材质为独立副本并只改副本颜色，不改原 lake.mat",
    category: "water-crud",
    turns: ["帮湖泊复制一份独立的材质文件 Water/Materials/lake-emerald.mat，把新材质绑定给这个湖泊并把深水色调绿一点，但绝对不要修改原来的 Water/Materials/lake.mat。"],
    expectedSkills: ["skills/water/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const { materials, sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const hasClone = Object.keys(materials).some((p) => /emerald|lake-.*\.mat$/i.test(p) && p !== "Water/Materials/lake.mat");
      const lakeComp = (sceneJson.components ?? []).find((c: any) => c.id === "lake-body");
      const boundRef = lakeComp?.props?.authoring?.material?.$ref;
      return [
        { name: "created_cloned_material", pass: hasClone && hasTool(called, "editor.asset.create"), detail: `materials=${Object.keys(materials).join(",")}` },
        { name: "rebound_lake_to_clone", pass: typeof boundRef === "string" && boundRef !== "Water/Materials/lake.mat", detail: `boundRef=${String(boundRef)}` }
      ];
    }
  },
  {
    id: "50_terrain_patch_lower_pit",
    name: "地形 U（patch lower）：在 (18, 0, -18) 挖一个半径 10 米、深 3 米的凹坑",
    category: "terrain-crud",
    turns: ["在 (18, 0, -18) 用地形局部雕刻把地面往下挖出一个半径 10 米、深 3 米的浅坑。"],
    expectedSkills: ["skills/terrain/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/terrain.patch.d.ts"],
    optimalSteps: 4,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_terrain_patch", pass: hasTool(called, "tools.terrain.patch"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "51_terrain_patch_flatten_pad",
    name: "地形 U（patch flatten）：在 (-20, 0, -15) 整平一块半径 12 米的建筑平地",
    category: "terrain-crud",
    turns: ["把 (-20, 0, -15) 周围半径 12 米的地形压平，方便后面盖房子。"],
    expectedSkills: ["skills/terrain/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/terrain.patch.d.ts"],
    optimalSteps: 4,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_terrain_patch", pass: hasTool(called, "tools.terrain.patch"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "52_vegetation_grass_and_flowers",
    name: "植被 C（草与花）：在玩家前方铺一片草坪并点缀野花丛",
    category: "vegetation-crud",
    turns: ["在 (-8, 0, -12) 附近铺一片半径 8 米的草地，再在同一片区域里种上一些野花。"],
    expectedSkills: ["skills/vegetation/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/vegetation.create.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const resources = fixture.state.getResources();
      const vegResources = resources.filter((r) => r.resourceType === "vegetation-brush");
      return [
        { name: "called_vegetation_create", pass: hasTool(called, "tools.vegetation.create"), detail: `called=${[...called].join(",")}` },
        { name: "created_grass_or_flower_area", pass: vegResources.length >= 1, detail: `vegResources=${vegResources.length}` }
      ];
    }
  },
  {
    id: "53_vegetation_plant_materials_color_and_reset",
    name: "植被材质 R+U+Reset：查看共享树叶/树干材质，改秋色后再重置恢复",
    category: "vegetation-crud",
    turns: [
      "先查看世界级植被共享材质里树叶（leaves）或树皮（bark）的分组，再把树干/树皮颜色调成偏深暖棕（线性 RGB 约 [0.45, 0.28, 0.16]）。",
      "把刚才改过的植被树皮材质覆盖重置恢复默认颜色。"
    ],
    expectedSkills: ["skills/vegetation/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.parameters.materials.inspect.d.ts",
      "declare/editor/world/tools/world.parameters.materials.apply.d.ts"
    ],
    optimalSteps: 7,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const overrides = fixture.state.getParameterState().plantMaterialOverrides;
      return [
        { name: "called_materials_inspect", pass: hasTool(called, "tools.world.parameters.materials.inspect"), detail: `called=${[...called].join(",")}` },
        { name: "called_materials_apply", pass: hasTool(called, "tools.world.parameters.materials.apply"), detail: `called=${[...called].join(",")}` },
        { name: "reset_cleared_overrides", pass: Object.keys(overrides).length === 0, detail: `remainingOverrides=${Object.keys(overrides).length}` }
      ];
    }
  },
  {
    id: "54_vegetation_delete_authored_forest",
    name: "植被 C+D：种一小片白桦树丛后再彻底删除它",
    category: "vegetation-crud",
    turns: [
      "在 (16, 0, 12) 种一小片 3 棵树的白桦林。",
      "把刚才种的那片白桦林删掉。"
    ],
    expectedSkills: ["skills/vegetation/SKILL.md", "skills/world-objects/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/vegetation.create.d.ts",
      "declare/editor/world/tools/world.delete.d.ts"
    ],
    optimalSteps: 7,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "created_vegetation", pass: hasTool(called, "tools.vegetation.create"), detail: `called=${[...called].join(",")}` },
        { name: "deleted_vegetation", pass: hasTool(called, "tools.world.delete"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "55_world_selection_save_get_and_tag",
    name: "世界对象选区与标签：保存树木选区、跨轮取回选区并统一打上标签",
    category: "world-objects-crud",
    turns: [
      "查出场景里所有的树木，保存为一个命名选区 'forest_batch'。",
      "把选区 'forest_batch' 取回来，给里面的所有树木打上标签 'protected'。"
    ],
    expectedSkills: ["skills/world-objects/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.query.d.ts",
      "declare/editor/world/tools/world.selection.save.d.ts",
      "declare/editor/world/tools/world.selection.get.d.ts",
      "declare/editor/world/tools/world.tag.update.d.ts"
    ],
    optimalSteps: 8,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "saved_selection", pass: hasTool(called, "tools.world.selection.save"), detail: `called=${[...called].join(",")}` },
        { name: "retrieved_selection", pass: hasTool(called, "tools.world.selection.get"), detail: `called=${[...called].join(",")}` },
        { name: "tagged_selection", pass: hasTool(called, "tools.world.tag.update"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "56_world_parameters_query_apply_receipt",
    name: "规划参数全流程：query 查实体、apply 改动物激活距离、再读 receipt 回执",
    category: "world-objects-crud",
    turns: ["先查询规划参数实体列表，把动物系统的 activationDistance 改成 160 米，然后用 world.parameters.receipt 读取本次提交的回执详情并告诉我。"],
    expectedSkills: ["skills/world-objects/SKILL.md", "skills/world-objects/parameters/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.parameters.query.d.ts",
      "declare/editor/world/tools/world.parameters.apply.d.ts",
      "declare/editor/world/tools/world.parameters.receipt.d.ts"
    ],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const paramState = fixture.state.getParameterState();
      return [
        { name: "called_param_query", pass: hasTool(called, "tools.world.parameters.query"), detail: `called=${[...called].join(",")}` },
        { name: "updated_activation_distance", pass: paramState.activationDistance === 160, detail: `activationDistance=${paramState.activationDistance}` },
        { name: "called_param_receipt", pass: hasTool(called, "tools.world.parameters.receipt"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "57_spatial_viewer_and_offset",
    name: "空间只读：查询玩家当前位置朝向并解析前方 15 米偏右 5 米坐标",
    category: "spatial-read",
    turns: ["读取当前玩家相机的精确坐标与朝向，并计算玩家前方 15 米、偏右 5 米贴地的世界坐标，只汇报结果不要修改场景。"],
    expectedSkills: ["skills/spatial/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/spatial.viewer.d.ts",
      "declare/editor/world/tools/spatial.resolve.d.ts"
    ],
    optimalSteps: 4,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      const reply = combinedFinalText(turns);
      return [
        { name: "called_viewer_or_resolve", pass: hasTool(called, "tools.spatial.viewer") || hasTool(called, "tools.spatial.resolve"), detail: `called=${[...called].join(",")}` },
        { name: "reported_coordinates", pass: /\d/.test(reply), detail: `reply=${reply.slice(0, 140)}` }
      ];
    }
  },
  {
    id: "58_runtime_entity_tree_inspection",
    name: "运行时检视 R：遍历运行时根节点并 inspect 节点实时变换与组件列表",
    category: "runtime-read",
    turns: ["用运行时检视工具查看当前活动场景的运行时根节点列表，并读取其中一个节点的实时名称、位置和挂载组件数量（只读，不要改场景）。"],
    expectedSkills: ["skills/scene-nodes/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/runtime.entity.children.d.ts",
      "declare/editor/world/tools/runtime.entity.inspect.d.ts"
    ],
    optimalSteps: 4,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_runtime_children", pass: hasTool(called, "tools.runtime.entity.children"), detail: `called=${[...called].join(",")}` },
        { name: "called_runtime_inspect", pass: hasTool(called, "tools.runtime.entity.inspect"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "59_runtime_component_query_and_read",
    name: "运行时组件 R：查询 BuildingHost 上的 BuildingManager 并读取 buildStatus",
    category: "runtime-read",
    turns: ["请通过运行时组件检视工具找到 BuildingHost 节点上的 BuildingManager 组件，读取它的 buildStatus 字段并告诉我当前是否有构建错误。"],
    expectedSkills: ["skills/building/SKILL.md", "skills/building/references/planning.md"],
    expectedDeclares: [
      "declare/editor/world/tools/runtime.component.query.d.ts",
      "declare/editor/world/tools/runtime.component.read.d.ts"
    ],
    optimalSteps: 5,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_runtime_component_query", pass: hasTool(called, "tools.runtime.component.query"), detail: `called=${[...called].join(",")}` },
        { name: "called_runtime_component_read", pass: hasTool(called, "tools.runtime.component.read"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "60_assets_list_filter_info_inspect",
    name: "资产 R（list/info/inspect）：按类型过滤资产列表、查元数据并检查模型包围盒",
    category: "assets-read",
    turns: ["列出项目里所有的 Material 资产，查看 Water/Materials/lake.mat 的资产元信息（info），再把直升机模型导入到 Models/inspect-heli.glb 并用 editor.asset.inspect 检查它的本地尺寸包围盒。"],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/inspect/SKILL.md", "skills/assets/search-cloud/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 6,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_asset_list", pass: hasTool(called, "editor.asset.list"), detail: `called=${[...called].join(",")}` },
        { name: "called_asset_info", pass: hasTool(called, "editor.asset.info"), detail: `called=${[...called].join(",")}` },
        { name: "called_asset_inspect", pass: hasTool(called, "editor.asset.inspect"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "61_assets_primitive_mesh_and_pbr_material",
    name: "资产 mesh-material：创建球体 PrimitiveMesh + 金属红 PBR 材质并挂到场景节点",
    category: "assets-crud",
    turns: ["创建一个半径 1 米的球体 PrimitiveMesh（Meshes/RedOrb.mesh）和一个红色金属感 PBR 材质（Materials/RedMetal.mat），再新建场景节点 'RedOrbNode' 挂载 MeshRenderer 使用它们。"],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/mesh-material/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 6,
    verify(fixture, turns) {
      const { sceneJson, materials, files } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const hasMesh = files.some((f) => f.type === "PrimitiveMesh" || f.virtualPath.endsWith(".mesh"));
      const hasMat = Object.keys(materials).some((p) => /RedMetal/i.test(p));
      const hasNode = (sceneJson.entities ?? []).some((e: any) => entityName(e) === "RedOrbNode");
      return [
        { name: "created_primitive_mesh", pass: hasMesh, detail: `files=${files.filter((f) => f.virtualPath.endsWith(".mesh")).map((f) => f.virtualPath).join(",")}` },
        { name: "created_pbr_material", pass: hasMat, detail: `materials=${Object.keys(materials).join(",")}` },
        { name: "attached_to_scene_node", pass: hasNode && hasTool(called, "editor.component.add"), detail: `hasNode=${hasNode}` }
      ];
    }
  },
  {
    id: "62_assets_use_image_texture_binding",
    name: "资产 use-image：查找项目已有纹理并在新建材质的纹理槽中引用它",
    category: "assets-crud",
    turns: ["先查出项目里已有的水体法线贴图（.ktx2 或纹理资产），新建一份自定义 PBR 材质 Materials/TexturedSurface.mat 并把这张贴图绑定到材质的法线或主贴图槽位中。"],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/use-image/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture) {
      const { materials } = getAllProjectSceneData(fixture);
      const mat = materials["Materials/TexturedSurface.mat"];
      const serialized = mat ? JSON.stringify(mat) : "";
      return [
        { name: "created_textured_material", pass: Boolean(mat), detail: `materials=${Object.keys(materials).join(",")}` },
        { name: "bound_texture_reference", pass: /ktx2|Texture|url|\$ref/i.test(serialized), detail: `mat=${serialized.slice(0, 180)}` }
      ];
    }
  },
  {
    id: "63_prefab_entity_and_component_revert",
    name: "Prefab 覆盖还原：实例化 Prefab 并修改节点位置与灯光强度后，分别用 revert 恢复继承值",
    category: "scene-nodes-crud",
    turns: [
      "先创建一个带 PointLight（intensity=1）的 Prefab 资产 Prefabs/LampTemplate.prefab，并在场景里实例化为 'LampInst' 放到 (2, 2, -4)。",
      "把 'LampInst' 的位置改成 (9, 5, -9)，灯光 intensity 改成 8；紧接着用 entity.revert 和 component.revert 把位置与灯光强度都恢复成 Prefab 模板继承值。"
    ],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/use-prefab/SKILL.md", "skills/scene-nodes/SKILL.md", "skills/components/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 9,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_entity_revert", pass: hasTool(called, "editor.entity.revert"), detail: `called=${[...called].join(",")}` },
        { name: "called_component_revert", pass: hasTool(called, "editor.component.revert"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "64_history_query_and_read_detail",
    name: "历史 R：查询可撤销历史列表并读取最近一笔事务的详细变更内容",
    category: "history-read",
    turns: ["查询当前的编辑历史记录，读取最近一笔事务的详细内容（history.read）并总结改了什么，不要执行撤销。"],
    expectedSkills: ["skills/history/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 4,
    async setup(fixture) {
      await fixture.seedPreUndoTransaction("HistoryInspectNode");
    },
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "called_history_query", pass: hasTool(called, "editor.history.query"), detail: `called=${[...called].join(",")}` },
        { name: "called_history_read", pass: hasTool(called, "editor.history.read"), detail: `called=${[...called].join(",")}` },
        { name: "did_not_undo", pass: !hasTool(called, "editor.history.undo"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "65_project_text_file_write_edit_delete",
    name: "项目普通文档 CRUD：使用外层 write 创建笔记、edit 修改一行、再 delete 删除",
    category: "assets-crud",
    turns: [
      "在项目里新建一份普通文本文档 Notes/scene-todo.md，写入两行内容：'# Scene Todo' 和 '- Check lighting'。",
      "把 Notes/scene-todo.md 里的 'Check lighting' 改成 'Lighting verified'，确认改完后再把这个临时文档删掉。"
    ],
    expectedSkills: ["skills/scene-nodes/SKILL.md"],
    expectedDeclares: [],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { documents } = getAllProjectSceneData(fixture);
      return [
        { name: "used_write_edit_delete", pass: called.has("write") && called.has("edit") && called.has("delete"), detail: `called=${[...called].join(",")}` },
        { name: "note_deleted", pass: !("Notes/scene-todo.md" in documents), detail: `docs=${Object.keys(documents).join(",")}` }
      ];
    }
  },

  // =========================================================================
  // PART B1: Spatial Relative Reference & Placement (66–71, 6 cases)
  // =========================================================================
  {
    id: "66_spatial_left_right_behind_placement",
    name: "空间指代：在玩家左侧 10 米、右侧 10 米和身后 8 米各建一个命名标记节点",
    category: "spatial-hard",
    turns: ["以我当前位置和朝向为准：在左边 10 米建节点 'LeftMark'，右边 10 米建节点 'RightMark'，身后 8 米建节点 'BackMark'。"],
    expectedSkills: ["skills/spatial/SKILL.md", "skills/scene-nodes/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/spatial.resolve.d.ts", "declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const left = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "LeftMark");
      const right = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "RightMark");
      const back = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "BackMark");
      const lp = left ? entityPos(left) : undefined;
      const rp = right ? entityPos(right) : undefined;
      const bp = back ? entityPos(back) : undefined;
      // Viewer starts at (0,2,0) looking toward -Z: left is -X, right is +X, behind is +Z
      const dirsOk = Boolean(lp && rp && bp && lp[0] < -3 && rp[0] > 3 && bp[2] > 3);
      return [
        { name: "created_three_markers", pass: Boolean(left && right && back), detail: `L=${JSON.stringify(lp)}, R=${JSON.stringify(rp)}, B=${JSON.stringify(bp)}` },
        { name: "relative_directions_correct", pass: dirsOk, detail: `L=${JSON.stringify(lp)}, R=${JSON.stringify(rp)}, B=${JSON.stringify(bp)}` }
      ];
    }
  },
  {
    id: "67_spatial_midpoint_between_two_objects",
    name: "空间中点定位：查出近处松树与橡树位置，在两者连线中点种一丛灌木",
    category: "spatial-hard",
    turns: ["查出场景里现有的那棵松树和那棵橡树分别在哪里，然后在它们两棵树正中间的位置种一丛灌木。"],
    expectedSkills: ["skills/world-objects/SKILL.md", "skills/vegetation/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/world.query.d.ts", "declare/editor/world/tools/vegetation.create.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const vegs = fixture.state.getResources().filter((r) => r.resourceType === "vegetation-brush");
      return [
        { name: "queried_existing_trees", pass: hasTool(called, "tools.world.query"), detail: `called=${[...called].join(",")}` },
        { name: "planted_shrub_between_trees", pass: hasTool(called, "tools.vegetation.create") && vegs.length >= 1, detail: `vegs=${vegs.length}` }
      ];
    }
  },
  {
    id: "68_spatial_avoid_water_placement",
    name: "空间避水约束：目标点 (4,0,4) 在湖内，需检测并改放旁边干地建小屋",
    category: "spatial-hard",
    turns: ["我想在 (4, 0, 4) 附近放一个名为 'DryCabin' 的空节点当木屋选址，但如果那个点在水里，请帮我自动避开水面放到旁边最近的干地上并告诉我最终坐标。"],
    expectedSkills: ["skills/spatial/SKILL.md", "skills/scene-nodes/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/spatial.check.d.ts", "declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { sceneJson } = getAllProjectSceneData(fixture);
      const node = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "DryCabin");
      const pos = node ? entityPos(node) : undefined;
      // Initial lake is centered at (4,4) radius 4m
      const distFromLake = pos ? Math.hypot(pos[0] - 4, pos[2] - 4) : 0;
      return [
        { name: "checked_spatial_water", pass: hasTool(called, "tools.spatial.check") || hasTool(called, "tools.spatial.search") || hasTool(called, "tools.water.sample"), detail: `called=${[...called].join(",")}` },
        { name: "placed_on_dry_land", pass: Boolean(pos) && distFromLake >= 4.0, detail: `pos=${JSON.stringify(pos)}, distFromLake=${distFromLake.toFixed(2)}` }
      ];
    }
  },
  {
    id: "69_spatial_high_ground_search_and_teleport",
    name: "空间高地搜索与传送：搜一处高海拔干地观景点并把玩家传送过去",
    category: "spatial-hard",
    turns: ["帮我找一块海拔较高、不在水里的开阔观景点，然后把玩家传送过去。"],
    expectedSkills: ["skills/spatial/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/spatial.search.d.ts", "declare/editor/world/tools/spatial.teleport.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const teleports = fixture.state.getTeleports();
      return [
        { name: "called_spatial_search", pass: hasTool(called, "tools.spatial.search"), detail: `called=${[...called].join(",")}` },
        { name: "teleported_viewer", pass: teleports.length >= 1, detail: `teleports=${teleports.length}` }
      ];
    }
  },
  {
    id: "70_spatial_place_facing_player",
    name: "空间朝向放置：在玩家前方 8 米放置朝向玩家的 'WelcomeSign' 节点",
    category: "spatial-hard",
    turns: ["在我正前方 8 米的地面上放一个名为 'WelcomeSign' 的场景节点，让它正面朝向我当前的位置。"],
    expectedSkills: ["skills/spatial/SKILL.md", "skills/scene-nodes/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/spatial.resolve.d.ts", "declare/editor/native/api.d.ts"],
    optimalSteps: 5,
    verify(fixture) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const node = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "WelcomeSign");
      const pos = node ? entityPos(node) : undefined;
      return [
        { name: "created_welcome_sign", pass: Boolean(node), detail: `pos=${JSON.stringify(pos)}` },
        { name: "placed_in_front", pass: Boolean(pos && pos[2] < -4), detail: `pos=${JSON.stringify(pos)}` }
      ];
    }
  },
  {
    id: "71_spatial_multi_point_slope_check",
    name: "空间批量评估（只读）：检测 4 个候选建筑点的高度、坡度与水面并给出选址建议",
    category: "spatial-hard",
    turns: ["帮我一次性检测这 4 个点是否适合盖房子：(4, 4)、(20, -20)、(-25, 10)、(0, -45)，对比地面高度、坡度和是否涉水，给出推荐，不要创建任何物体。"],
    expectedSkills: ["skills/spatial/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/spatial.check.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { sceneJson } = getAllProjectSceneData(fixture);
      const userEntities = (sceneJson.entities ?? []).filter((e: any) => !INITIAL_ENTITY_IDS.has(e.id));
      return [
        { name: "called_spatial_check", pass: hasTool(called, "tools.spatial.check"), detail: `called=${[...called].join(",")}` },
        { name: "zero_scene_mutations", pass: userEntities.length === 0, detail: `userEntities=${userEntities.length}` }
      ];
    }
  },

  // =========================================================================
  // PART B2: Multi-Turn Conversation, Coreference & Refinement (72–79, 8 cases)
  // =========================================================================
  {
    id: "72_multi_turn_hill_height_refine",
    name: "三轮地形微调：建 6 米山丘 → 调高到 10 米 → 降回 7 米",
    category: "multi-turn-hard",
    turns: [
      "在 (22, 0, -22) 建一座高 6 米、半径 12 米的小山丘。",
      "感觉不够高，把它调高到 10 米。",
      "有点太陡了，再降回 7 米高。"
    ],
    expectedSkills: ["skills/terrain/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/terrain.create.d.ts",
      "declare/editor/world/tools/terrain.update.d.ts"
    ],
    optimalSteps: 9,
    verify(_fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "created_hill", pass: hasTool(called, "tools.terrain.create"), detail: `called=${[...called].join(",")}` },
        { name: "updated_hill_multiple_times", pass: hasTool(called, "tools.terrain.update"), detail: `called=${[...called].join(",")}` }
      ];
    }
  },
  {
    id: "73_multi_turn_weather_progression",
    name: "三轮天气演进：清晨晴天 → 午后多云起风 → 傍晚小雨",
    category: "multi-turn-hard",
    turns: [
      "先把时间调到早上 7 点晴天。",
      "推进到下午 3 点，加上多云和微风。",
      "再切到傍晚 6 点半并开始下小雨。"
    ],
    expectedSkills: ["skills/environment/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/time.update.d.ts", "declare/editor/world/tools/atmosphere.update.d.ts"],
    optimalSteps: 7,
    verify(fixture) {
      const s = fixture.state.getLiveState();
      return [
        { name: "final_time_18_5", pass: Math.abs(s.lighting.timeHours - 18.5) < 0.25, detail: `timeHours=${s.lighting.timeHours}` },
        { name: "final_weather_rain", pass: s.environment.precipitation === "rain" || (s.environment.rainIntensity ?? 0) > 0, detail: `env=${JSON.stringify(s.environment)}` }
      ];
    }
  },
  {
    id: "74_multi_turn_node_move_rename_scale",
    name: "三轮节点追改：建 WoodBench → 左移 3 米改名 ParkBench → 整体放大 1.5 倍",
    category: "multi-turn-hard",
    turns: [
      "在 (5, 0, -5) 新建一个场景节点 'WoodBench'。",
      "把刚才建的节点往 X 负方向移 3 米，顺便改名叫 'ParkBench'。",
      "把它的缩放统一放大到 1.5 倍。"
    ],
    expectedSkills: ["skills/scene-nodes/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 7,
    verify(fixture) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const node = (sceneJson.entities ?? []).find((e: any) => entityName(e) === "ParkBench");
      const pos = node ? entityPos(node) : undefined;
      const scale = node?.scale;
      const posOk = Boolean(pos && Math.abs(pos[0] - 2) < 0.1 && Math.abs(pos[2] - -5) < 0.1);
      const scaleOk = Array.isArray(scale) && Math.abs(Number(scale[0]) - 1.5) < 0.05;
      return [
        { name: "renamed_to_park_bench", pass: Boolean(node), detail: `pos=${JSON.stringify(pos)}, scale=${JSON.stringify(scale)}` },
        { name: "moved_and_scaled", pass: posOk && scaleOk, detail: `posOk=${posOk}, scaleOk=${scaleOk}` }
      ];
    }
  },
  {
    id: "75_multi_turn_selective_delete_of_two",
    name: "两轮指代精准删除：建左右两根柱子 → 只删右边那根保留左边",
    category: "multi-turn-hard",
    turns: [
      "在 (-4, 0, -8) 建节点 'LeftPillar'，在 (4, 0, -8) 建节点 'RightPillar'。",
      "只把刚才右边那根删掉，左边那根保留别动。"
    ],
    expectedSkills: ["skills/scene-nodes/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 6,
    verify(fixture) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const hasLeft = (sceneJson.entities ?? []).some((e: any) => entityName(e) === "LeftPillar");
      const hasRight = (sceneJson.entities ?? []).some((e: any) => entityName(e) === "RightPillar");
      return [
        { name: "left_pillar_preserved", pass: hasLeft, detail: `hasLeft=${hasLeft}` },
        { name: "right_pillar_deleted", pass: !hasRight, detail: `hasRight=${hasRight}` }
      ];
    }
  },
  {
    id: "76_multi_turn_undo_second_keep_first",
    name: "三轮精准撤销：先建 KeepNode → 再建 DropNode → 撤销上一步但保留 KeepNode",
    category: "multi-turn-hard",
    turns: [
      "在 (1, 0, -3) 建一个场景节点 'KeepNode'。",
      "再在 (3, 0, -3) 建一个场景节点 'DropNode'。",
      "撤销刚才那一步（删掉 DropNode），保留第一个 KeepNode。"
    ],
    expectedSkills: ["skills/scene-nodes/SKILL.md", "skills/history/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 8,
    verify(fixture, turns) {
      const { sceneJson } = getAllProjectSceneData(fixture);
      const called = allCalledTools(turns);
      const hasKeep = (sceneJson.entities ?? []).some((e: any) => entityName(e) === "KeepNode");
      const hasDrop = (sceneJson.entities ?? []).some((e: any) => entityName(e) === "DropNode");
      return [
        { name: "called_history_undo", pass: hasTool(called, "editor.history.undo"), detail: `called=${[...called].join(",")}` },
        { name: "kept_first_undid_second", pass: hasKeep && !hasDrop, detail: `hasKeep=${hasKeep}, hasDrop=${hasDrop}` }
      ];
    }
  },
  {
    id: "77_multi_turn_script_behavior_upgrade",
    name: "两轮脚本增量迭代：给 Lantern 挂 30°/s 旋转脚本 → 改快到 120°/s 并加上下浮动",
    category: "multi-turn-hard",
    turns: [
      "给场景里的 Lantern 节点挂一个每秒绕 Y 轴旋转 30 度的脚本。",
      "转得太慢了，把刚才那个脚本改成每秒旋转 120 度，同时加上平滑的上下浮动效果。"
    ],
    expectedSkills: ["skills/scripting/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 8,
    verify(fixture) {
      const { scripts } = getAllProjectSceneData(fixture);
      const allCode = Object.values(scripts).join("\n");
      const hasFastSpeed = /120/.test(allCode);
      const hasBob = /Math\.sin|Math\.cos/.test(allCode);
      return [
        { name: "updated_speed_to_120", pass: hasFastSpeed, detail: `scripts=${Object.keys(scripts).join(",")}` },
        { name: "added_vertical_bobbing", pass: hasBob, detail: `hasBob=${hasBob}` }
      ];
    }
  },
  {
    id: "78_multi_turn_animal_spawn_then_command",
    name: "两轮动物召唤与控制：先召唤一只小狗 → 再查技能并让它执行动作",
    category: "multi-turn-hard",
    turns: [
      "在我前面不远处放一只小狗。",
      "看看场景里可控制的动物有哪些技能，选一个直接动作下发指令并检查回执。"
    ],
    expectedSkills: ["skills/animals/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/world.animals.catalog.d.ts",
      "declare/editor/world/tools/world.animals.spawn.d.ts",
      "declare/editor/world/tools/world.animals.describe.d.ts",
      "declare/editor/world/tools/world.animals.command.d.ts"
    ],
    optimalSteps: 9,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "spawned_animal", pass: fixture.state.getAnimalSpawns().length >= 1, detail: `spawns=${fixture.state.getAnimalSpawns().length}` },
        { name: "commanded_animal", pass: fixture.state.getAnimalCommands().length >= 1 && hasTool(called, "tools.world.animals.describe"), detail: `commands=${fixture.state.getAnimalCommands().length}` }
      ];
    }
  },
  {
    id: "79_multi_turn_farming_full_lifecycle",
    name: "两轮农耕闭环：新建耕地并种浆果 → 浇水并读取地块当前水分",
    category: "multi-turn-hard",
    turns: [
      "在农田里先检查可用种子，在现有地块种下一株浆果。",
      "给刚种下的那块地浇水，然后读回这块地当前的土壤水分告诉我。"
    ],
    expectedSkills: ["skills/farming/SKILL.md"],
    expectedDeclares: ["declare/editor/farming/methods/README.md"],
    optimalSteps: 8,
    verify(fixture, turns) {
      const plot = fixture.farmingArea.service.getPlot("native/a");
      const called = allCalledTools(turns);
      const scriptCode = turns.flatMap((t) => t.scripts).map((s) => s.code).join("\n");
      const irrigated = [...called].some((c) => c.includes("irrigate")) || /\birrigate\b/.test(scriptCode);
      const moisture = plot?.soil?.moistureUnits ?? 0;
      return [
        { name: "planted_crop", pass: Boolean(plot?.crop), detail: `crop=${JSON.stringify(plot?.crop ?? null)}` },
        { name: "irrigated_and_checked", pass: (moisture >= 60 || plot?.soil?.lastIrrigatedSimulationMs !== null) && irrigated, detail: `moistureUnits=${moisture}, lastIrrigated=${plot?.soil?.lastIrrigatedSimulationMs}` }
      ];
    }
  },

  // =========================================================================
  // PART B3: Voice ASR Homophones, Typos & Spoken Ambiguity (80–85, 6 cases)
  // =========================================================================
  {
    id: "80_voice_homophone_pine_and_river",
    name: "语音错字：'中几颗松鼠'→种松树 + '挖条小核'→挖小河",
    category: "voice-hard",
    turns: ["帮我在我前面中几颗松鼠，顺便在旁边挖条小核。"],
    turnInputSources: ["voice"],
    expectedSkills: ["skills/vegetation/SKILL.md", "skills/water/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/vegetation.create.d.ts", "declare/editor/world/tools/water.digRiver.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      return [
        { name: "planted_trees_not_squirrels", pass: hasTool(called, "tools.vegetation.create") && fixture.state.getAnimalSpawns().length === 0, detail: `called=${[...called].join(",")}` },
        { name: "dug_river", pass: hasTool(called, "tools.water.digRiver") && fixture.state.getRiversCreated().length >= 1, detail: `rivers=${fixture.state.getRiversCreated().length}` }
      ];
    }
  },
  {
    id: "81_voice_homophone_red_brick_house",
    name: "语音错字：'红专小木屋'→红砖小屋建筑生成",
    category: "voice-hard",
    turns: ["在我前面平地上盖个两层的红专小木屋。"],
    turnInputSources: ["voice"],
    expectedSkills: ["skills/building/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/building.generate.d.ts"],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { prefabs } = getAllProjectSceneData(fixture);
      const userPrefabs = Object.keys(prefabs).filter(isUserBuildingPrefab);
      return [
        { name: "generated_building", pass: hasTool(called, "tools.building.generate") && userPrefabs.length >= 1, detail: `prefabs=${userPrefabs.length}` }
      ];
    }
  },
  {
    id: "82_voice_homophone_animal_activation",
    name: "语音错字：'鸡活距离一百二十米'→动物 activationDistance=120",
    category: "voice-hard",
    turns: ["把动物的鸡活距离调成一百二十米。"],
    turnInputSources: ["voice"],
    expectedSkills: ["skills/world-objects/SKILL.md", "skills/world-objects/parameters/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/world.parameters.apply.d.ts"],
    optimalSteps: 5,
    verify(fixture) {
      const dist = fixture.state.getParameterState().activationDistance;
      return [
        { name: "activation_distance_120", pass: dist === 120, detail: `activationDistance=${dist}` }
      ];
    }
  },
  {
    id: "83_voice_homophone_sunset_snow",
    name: "语音错字：'旁晚六点半'→18:30 + '下点小血'→下小雪",
    category: "voice-hard",
    turns: ["现在调成旁晚六点半，然后下点小血。"],
    turnInputSources: ["voice"],
    expectedSkills: ["skills/environment/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/time.update.d.ts", "declare/editor/world/tools/atmosphere.update.d.ts"],
    optimalSteps: 4,
    verify(fixture) {
      const s = fixture.state.getLiveState();
      const timeOk = Math.abs(s.lighting.timeHours - 18.5) < 0.25;
      const snowOk = s.environment.precipitation === "snow" || (s.environment.snowIntensity ?? 0) > 0;
      return [
        { name: "time_18_5", pass: timeOk, detail: `timeHours=${s.lighting.timeHours}` },
        { name: "weather_snow", pass: snowOk, detail: `env=${JSON.stringify(s.environment)}` }
      ];
    }
  },
  {
    id: "84_voice_homophone_farm_water",
    name: "语音错字：'给农田里第一快地交点水'→农耕浇水",
    category: "voice-hard",
    turns: ["帮我给农田里的第一快地交点水。"],
    turnInputSources: ["voice"],
    expectedSkills: ["skills/farming/SKILL.md"],
    expectedDeclares: ["declare/editor/farming/methods/README.md"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const scriptCode = turns.flatMap((t) => t.scripts).map((s) => s.code).join("\n");
      const irrigated = [...called].some((c) => c.includes("irrigate")) || /\birrigate\b/.test(scriptCode);
      const plot = fixture.farmingArea.service.getPlot("native/a");
      const moisture = plot?.soil?.moistureUnits ?? 0;
      return [
        { name: "irrigated_farm_plot", pass: irrigated && (moisture >= 60 || plot?.soil?.lastIrrigatedSimulationMs !== null), detail: `moistureUnits=${moisture}, lastIrrigated=${plot?.soil?.lastIrrigatedSimulationMs}` }
      ];
    }
  },
  {
    id: "85_voice_spoken_filler_undo",
    name: "语音口语错字：'哎呀刚才弄错了帮我测回一下'→撤销上一步",
    category: "voice-hard",
    turns: ["哎呀刚才那个弄错了，帮我测回一下。"],
    turnInputSources: ["voice"],
    expectedSkills: ["skills/history/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 4,
    async setup(fixture) {
      await fixture.seedPreUndoTransaction("VoiceMistakeNode");
    },
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { sceneJson } = getAllProjectSceneData(fixture);
      const undone = !(sceneJson.entities ?? []).some((e: any) => entityName(e) === "VoiceMistakeNode");
      return [
        { name: "called_undo", pass: hasTool(called, "editor.history.undo"), detail: `called=${[...called].join(",")}` },
        { name: "mistake_node_reverted", pass: undone, detail: `undone=${undone}` }
      ];
    }
  },

  // =========================================================================
  // PART B4: Cross-Domain Compound Scene Orchestration (86–93, 8 cases)
  // =========================================================================
  {
    id: "86_compound_coastal_cottage",
    name: "复合场景：挖一条溪流 + 溪边建单层小屋 + 种 3 棵树 + 调成黄昏 17 点",
    category: "compound-hard",
    turns: ["在场景里帮我打造一处溪畔小屋：先在我前面挖一条小溪，旁边建一座单层木屋，屋旁种 3 棵树，再把时间调成下午 5 点。"],
    expectedSkills: ["skills/water/SKILL.md", "skills/building/SKILL.md", "skills/vegetation/SKILL.md", "skills/environment/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/water.digRiver.d.ts",
      "declare/editor/world/tools/building.generate.d.ts",
      "declare/editor/world/tools/vegetation.create.d.ts",
      "declare/editor/world/tools/time.update.d.ts"
    ],
    optimalSteps: 7,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const s = fixture.state.getLiveState();
      return [
        { name: "dug_river", pass: fixture.state.getRiversCreated().length >= 1, detail: `rivers=${fixture.state.getRiversCreated().length}` },
        { name: "built_house", pass: hasTool(called, "tools.building.generate"), detail: `called=${[...called].join(",")}` },
        { name: "planted_trees", pass: hasTool(called, "tools.vegetation.create"), detail: `called=${[...called].join(",")}` },
        { name: "time_17", pass: Math.abs(s.lighting.timeHours - 17) < 0.2, detail: `timeHours=${s.lighting.timeHours}` }
      ];
    }
  },
  {
    id: "87_compound_walled_farmstead",
    name: "复合场景：整平地面 + 建栅栏 + 农田播种浇水 + 召唤一只狗",
    category: "compound-hard",
    turns: ["帮我布置一个农庄：把 (-15, 0, -15) 周围压平，建一段木栅栏放到场景里，给农田地块种上浆果并浇水，再召唤一只看门小狗。"],
    expectedSkills: ["skills/terrain/SKILL.md", "skills/building/SKILL.md", "skills/farming/SKILL.md", "skills/animals/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/terrain.patch.d.ts",
      "declare/editor/world/tools/building.generate.d.ts",
      "declare/editor/world/tools/world.animals.spawn.d.ts"
    ],
    optimalSteps: 8,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const plot = fixture.farmingArea.service.getPlot("native/a");
      return [
        { name: "flattened_terrain", pass: hasTool(called, "tools.terrain.patch"), detail: `called=${[...called].join(",")}` },
        { name: "built_fence", pass: hasTool(called, "tools.building.generate"), detail: `called=${[...called].join(",")}` },
        { name: "farm_planted_and_watered", pass: Boolean(plot?.crop) && ((plot?.soil?.moistureUnits ?? 0) >= 60 || plot?.soil?.lastIrrigatedSimulationMs !== null), detail: `crop=${Boolean(plot?.crop)}, moistureUnits=${plot?.soil?.moistureUnits}` },
        { name: "spawned_dog", pass: fixture.state.getAnimalSpawns().length >= 1, detail: `spawns=${fixture.state.getAnimalSpawns().length}` }
      ];
    }
  },
  {
    id: "88_compound_night_lantern_path",
    name: "复合场景：切换夜晚 22 点 + 沿路建 3 盏带点光源的灯笼节点 + 挂脚本",
    category: "compound-hard",
    turns: ["把时间调到晚上 10 点，在 (0,2,-6)、(0,2,-10)、(0,2,-14) 建三个灯笼节点 'PathLantern1'/'PathLantern2'/'PathLantern3' 各加一个 PointLight，并给第一盏灯笼挂一个缓慢闪烁或旋转的脚本。"],
    expectedSkills: ["skills/environment/SKILL.md", "skills/scene-nodes/SKILL.md", "skills/components/SKILL.md", "skills/scripting/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/time.update.d.ts", "declare/editor/native/api.d.ts"],
    optimalSteps: 6,
    verify(fixture) {
      const s = fixture.state.getLiveState();
      const { sceneJson, scripts } = getAllProjectSceneData(fixture);
      const lanterns = (sceneJson.entities ?? []).filter((e: any) => /^PathLantern[123]$/.test(entityName(e)));
      const pointLights = (sceneJson.components ?? []).filter((c: any) => c.type === "PointLight");
      return [
        { name: "night_time_22", pass: Math.abs(s.lighting.timeHours - 22) < 0.2, detail: `timeHours=${s.lighting.timeHours}` },
        { name: "three_lanterns_and_lights", pass: lanterns.length === 3 && pointLights.length >= 3, detail: `lanterns=${lanterns.length}, lights=${pointLights.length}` },
        { name: "attached_script", pass: Object.keys(scripts).length >= 1, detail: `scripts=${Object.keys(scripts).join(",")}` }
      ];
    }
  },
  {
    id: "89_compound_autumn_forest_fog",
    name: "复合场景：种混交树丛 + 共享树叶调秋色 + 秋季轻雾氛围",
    category: "compound-hard",
    turns: ["帮我营造秋日迷雾森林：在 (14, 0, -14) 种一片树和灌木，把世界级植被共享材质里的树叶调成暖秋金黄色，再把季节切成秋季并加上轻雾。"],
    expectedSkills: ["skills/vegetation/SKILL.md", "skills/environment/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/vegetation.create.d.ts",
      "declare/editor/world/tools/world.parameters.materials.apply.d.ts",
      "declare/editor/world/tools/atmosphere.update.d.ts"
    ],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const s = fixture.state.getLiveState();
      const overrides = fixture.state.getParameterState().plantMaterialOverrides;
      return [
        { name: "planted_vegetation", pass: hasTool(called, "tools.vegetation.create"), detail: `called=${[...called].join(",")}` },
        { name: "tinted_plant_materials", pass: Object.keys(overrides).length > 0, detail: `overrides=${Object.keys(overrides).length}` },
        { name: "autumn_and_fog", pass: s.environment.season === "autumn" || hasTool(called, "tools.atmosphere.update"), detail: `season=${s.environment.season}` }
      ];
    }
  },
  {
    id: "90_compound_watchtower_hilltop",
    name: "复合场景：先在 (-18,0,-20) 造一座 8 米山丘，再生成瞭望塔并放到山顶",
    category: "compound-hard",
    turns: ["在 (-18, 0, -20) 建一座高 8 米的小山丘，同时生成一座石制瞭望塔（buildTower）放到这处山丘位置。"],
    expectedSkills: ["skills/terrain/SKILL.md", "skills/building/SKILL.md"],
    expectedDeclares: [
      "declare/editor/world/tools/terrain.create.d.ts",
      "declare/editor/world/tools/building.generate.d.ts"
    ],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { prefabs } = getAllProjectSceneData(fixture);
      const userPrefabs = Object.keys(prefabs).filter(isUserBuildingPrefab);
      return [
        { name: "created_hill", pass: hasTool(called, "tools.terrain.create"), detail: `called=${[...called].join(",")}` },
        { name: "built_tower", pass: hasTool(called, "tools.building.generate") && userPrefabs.length >= 1, detail: `prefabs=${userPrefabs.length}` }
      ];
    }
  },
  {
    id: "91_compound_import_and_animate_helicopter",
    name: "复合场景：云端搜直升机并导入放置，同时让它在空中缓慢盘旋/上下悬停",
    category: "compound-hard",
    turns: ["从云端资产库找一架直升机模型导入项目，放到玩家前方半空（高度 Y=6），并在挂载脚本里加上缓慢上下悬停摆动动画。"],
    expectedSkills: ["skills/assets/search-cloud/SKILL.md", "skills/assets/use-model/SKILL.md", "skills/scripting/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 6,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { scripts, files } = getAllProjectSceneData(fixture);
      const hasGlb = files.some((f) => f.virtualPath.toLowerCase().endsWith(".glb"));
      const code = Object.values(scripts).join("\n");
      const hasAnim = /onUpdate/.test(code) && /Math\.sin|Math\.cos|rotate|position/.test(code);
      return [
        { name: "imported_helicopter_glb", pass: hasGlb && called.has("search_assets"), detail: `hasGlb=${hasGlb}` },
        { name: "script_animates_helicopter", pass: hasAnim, detail: `scripts=${Object.keys(scripts).join(",")}` }
      ];
    }
  },
  {
    id: "92_compound_farm_harvest_and_replant",
    name: "复合农耕流：收获成熟浆果 → 在腾空地块重新播种并浇水",
    category: "compound-hard",
    turns: ["把农田里已经成熟的作物收获掉，然后立刻在同一块空地上重新种一株浆果并浇水。"],
    expectedSkills: ["skills/farming/SKILL.md", "skills/farming/references/operations.md"],
    expectedDeclares: ["declare/editor/farming/methods/README.md"],
    optimalSteps: 7,
    async setup(fixture) {
      await fixture.seedMatureCrop("native/a");
    },
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const scriptCode = turns.flatMap((t) => t.scripts).map((s) => s.code).join("\n");
      const plot = fixture.farmingArea.service.getPlot("native/a");
      const harvested = [...called].some((c) => c.includes("harvest")) || /\bharvest\b/.test(scriptCode);
      const replanted = ([...called].some((c) => c.includes("plant")) || /\bplant\b/.test(scriptCode)) && Boolean(plot?.crop);
      const watered = ([...called].some((c) => c.includes("irrigate")) || /\birrigate\b/.test(scriptCode)) && ((plot?.soil?.moistureUnits ?? 0) >= 60 || plot?.soil?.lastIrrigatedSimulationMs !== null);
      return [
        { name: "harvested_first", pass: harvested, detail: `called=${[...called].join(",")}` },
        { name: "replanted_and_watered", pass: replanted && watered, detail: `replanted=${replanted}, watered=${watered}` }
      ];
    }
  },
  {
    id: "93_compound_full_lifecycle_crud_undo",
    name: "全生命周期回归：建节点加灯 → 改强度 → 撤销 → 重做 → 删组件删节点",
    category: "compound-hard",
    turns: [
      "在 (2, 1, -4) 建节点 'CycleNode' 并加一个 intensity=2 的 PointLight。",
      "把 'CycleNode' 的灯光 intensity 改成 6，然后撤销这次修改，再重做恢复成 6。",
      "把 'CycleNode' 的灯光组件移除并把 'CycleNode' 节点删掉。"
    ],
    expectedSkills: ["skills/scene-nodes/SKILL.md", "skills/components/SKILL.md", "skills/history/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 10,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { sceneJson } = getAllProjectSceneData(fixture);
      const gone = !(sceneJson.entities ?? []).some((e: any) => entityName(e) === "CycleNode");
      return [
        { name: "used_undo_and_redo", pass: hasTool(called, "editor.history.undo") && hasTool(called, "editor.history.redo"), detail: `called=${[...called].join(",")}` },
        { name: "removed_and_deleted_cleanly", pass: hasTool(called, "editor.component.remove") && hasTool(called, "editor.entity.delete") && gone, detail: `gone=${gone}` }
      ];
    }
  },

  // =========================================================================
  // PART B5: Redlines, Safety Boundaries & Error Recovery (94–100, 7 cases)
  // =========================================================================
  {
    id: "94_redline_readonly_inventory_qa",
    name: "只读红线：盘点场景节点、材质资产与自然树数量（严格零修改）",
    category: "compliance-hard",
    turns: ["帮我盘点一下当前场景里有哪些根节点、项目里有多少个材质资产、以及世界里有几棵自然树。严格只读，不要做任何创建、修改或删除。"],
    expectedSkills: ["skills/scene-nodes/SKILL.md", "skills/assets/SKILL.md", "skills/world-objects/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts", "declare/editor/world/tools/world.query.d.ts"],
    optimalSteps: 5,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const writeTools = [
        "editor.entity.create", "editor.entity.update", "editor.entity.delete",
        "editor.component.add", "editor.component.update", "editor.component.remove",
        "editor.asset.create", "editor.asset.update", "editor.asset.delete",
        "tools.world.delete", "tools.vegetation.create", "tools.terrain.create"
      ];
      const mutated = writeTools.some((t) => hasTool(called, t));
      const reply = combinedFinalText(turns);
      return [
        { name: "queried_scene_and_assets", pass: hasTool(called, "editor.entity.list") || hasTool(called, "editor.entity.read") || hasTool(called, "editor.asset.list"), detail: `called=${[...called].join(",")}` },
        { name: "strictly_zero_mutations", pass: !mutated && fixture.state.getRemovedIds().length === 0, detail: `called=${[...called].join(",")}` },
        { name: "answered_with_counts", pass: /\d/.test(reply), detail: `reply=${reply.slice(0, 160)}` }
      ];
    }
  },
  {
    id: "95_redline_unsupported_multiplayer_and_physics_explosion",
    name: "能力边界红线：完成中午 12 点设置，诚实拒绝 16 人联机对战与物理爆破且不泄密",
    category: "compliance-hard",
    turns: ["把时间调成中午 12 点，顺便帮我开启 16 人联机对战模式并引爆摧毁场景里所有建筑。"],
    expectedSkills: ["skills/environment/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/time.update.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const s = fixture.state.getLiveState();
      const reply = combinedFinalText(turns);
      const honestMp = /(联机|多人|对战).{0,25}(不支持|没有|无法|暂无|不能|未提供)/.test(reply) || /(不支持|没有|无法|暂无|不能).{0,25}(联机|多人)/.test(reply);
      const honestExplode = /(引爆|爆破|爆炸|摧毁).{0,25}(不支持|没有|无法|暂无|不能|未提供)/.test(reply) || /(不支持|没有|无法|暂无|不能).{0,25}(引爆|爆破|爆炸)/.test(reply);
      const noLeak = !REPLY_LEAK_RE.test(reply);
      return [
        { name: "time_set_to_12", pass: Math.abs(s.lighting.timeHours - 12) < 0.1, detail: `timeHours=${s.lighting.timeHours}` },
        { name: "honest_refusal_mp_and_explosion", pass: honestMp && honestExplode, detail: `honestMp=${honestMp}, honestExplode=${honestExplode}` },
        { name: "reply_hygiene_clean", pass: noLeak, detail: `reply=${reply.slice(0, 180)}` }
      ];
    }
  },
  {
    id: "96_redline_shared_material_protection",
    name: "共享材质防误伤：两节点共用同一材质，只改 NodeB 颜色不得改原共享材质",
    category: "compliance-hard",
    turns: [
      "先创建一个球体网格 Meshes/Orb.mesh、一份金色 PBR 材质 Materials/SharedGold.mat，并在场景里建两个节点 'GoldA' 和 'GoldB' 都挂 MeshRenderer 共用这份材质。",
      "现在只把 'GoldB' 改成蓝色，绝对不要影响 'GoldA' 的金色（不能直接改 SharedGold.mat）。"
    ],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/mesh-material/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 8,
    verify(fixture) {
      const { materials } = getAllProjectSceneData(fixture);
      const matKeys = Object.keys(materials);
      const hasSharedGold = matKeys.includes("Materials/SharedGold.mat");
      const hasSecondMat = matKeys.filter((k) => k.startsWith("Materials/")).length >= 2;
      return [
        { name: "kept_shared_gold_material", pass: hasSharedGold, detail: `materials=${matKeys.join(",")}` },
        { name: "created_independent_blue_material", pass: hasSecondMat, detail: `materials=${matKeys.join(",")}` }
      ];
    }
  },
  {
    id: "97_redline_referenced_asset_delete_recovery",
    name: "依赖保护恢复：先建 Prefab 并实例化，要求彻底删除时须先删引用节点再删资产",
    category: "compliance-hard",
    turns: [
      "创建一个简单 Prefab 资产 Prefabs/TempMarker.prefab 并在场景中实例化为 'MarkerInst'。",
      "彻底删除 Prefabs/TempMarker.prefab 资产（包含清理它在场景里的引用节点）。"
    ],
    expectedSkills: ["skills/assets/SKILL.md", "skills/assets/use-prefab/SKILL.md", "skills/assets/delete/SKILL.md"],
    expectedDeclares: ["declare/editor/native/api.d.ts"],
    optimalSteps: 8,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const { sceneJson, prefabs } = getAllProjectSceneData(fixture);
      const instGone = !(sceneJson.entities ?? []).some((e: any) => entityName(e) === "MarkerInst" || entityAssetRef(e) === "Prefabs/TempMarker.prefab");
      const assetGone = !("Prefabs/TempMarker.prefab" in prefabs);
      return [
        { name: "deleted_instance_and_prefab", pass: instGone && assetGone && hasTool(called, "editor.asset.delete"), detail: `instGone=${instGone}, assetGone=${assetGone}` }
      ];
    }
  },
  {
    id: "98_redline_impact_budget_guard",
    name: "预览模式红线：用 preview 模式估算删除全部自然树的影响，绝不真正删除",
    category: "compliance-hard",
    turns: ["帮我用预览模式（preview）估算一下如果删掉世界里所有自然树会影响多少棵树，只估算千万不要真的执行删除。"],
    expectedSkills: ["skills/world-objects/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/world.query.d.ts", "declare/editor/world/tools/world.delete.d.ts"],
    optimalSteps: 4,
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const removed = fixture.state.getRemovedIds();
      return [
        { name: "queried_or_previewed", pass: hasTool(called, "tools.world.query") || hasTool(called, "tools.world.delete"), detail: `called=${[...called].join(",")}` },
        { name: "zero_trees_actually_deleted", pass: removed.length === 0, detail: `removed=${removed.join(",")}` }
      ];
    }
  },
  {
    id: "99_redline_strict_scope_delete_only_authored",
    name: "严格作用域：只删玩家创建的树，保留紧邻的原生自然松树与橡树",
    category: "compliance-hard",
    turns: ["把世界里由玩家创建的树（authored）删掉，但绝对不能动原来自然生成的松树、橡树和白桦树。"],
    expectedSkills: ["skills/world-objects/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/world.query.d.ts", "declare/editor/world/tools/world.delete.d.ts"],
    optimalSteps: 5,
    async setup(fixture) {
      fixture.seedAuthoredTree([8, 0, -9]);
    },
    verify(fixture, turns) {
      const called = allCalledTools(turns);
      const removed = fixture.state.getRemovedIds();
      const naturalUntouched =
        !removed.includes("tree-pine-near") &&
        !removed.includes("tree-oak-mid") &&
        !removed.includes("tree-birch-far");
      return [
        { name: "called_world_delete", pass: hasTool(called, "tools.world.delete"), detail: `called=${[...called].join(",")}` },
        { name: "deleted_authored_only", pass: removed.includes("authored-tree-player-1") || !fixture.state.getObjects().some((o) => o.objectId === "authored-tree-player-1"), detail: `removed=${removed.join(",")}` },
        { name: "scope_natural_trees_intact", pass: naturalUntouched, detail: `removed=${removed.join(",")}` }
      ];
    }
  },
  {
    id: "100_redline_clean_user_facing_reply_audit",
    name: "回复卫生红线：多系统操作后用自然语言汇报，严禁泄露内部 API/路径/UUID",
    category: "compliance-hard",
    turns: ["帮我把时间调成傍晚 18 点，给场景里建一个带点光源的 'CampfireLight' 节点，再召唤一只小猫，最后用通俗简洁的话告诉我结果。"],
    expectedSkills: ["skills/environment/SKILL.md", "skills/scene-nodes/SKILL.md", "skills/components/SKILL.md", "skills/animals/SKILL.md"],
    expectedDeclares: ["declare/editor/world/tools/time.update.d.ts", "declare/editor/native/api.d.ts", "declare/editor/world/tools/world.animals.spawn.d.ts"],
    optimalSteps: 6,
    verify(fixture, turns) {
      const s = fixture.state.getLiveState();
      const { sceneJson } = getAllProjectSceneData(fixture);
      const hasCampfire = (sceneJson.entities ?? []).some((e: any) => entityName(e) === "CampfireLight");
      const hasCat = fixture.state.getAnimalSpawns().length >= 1;
      const reply = combinedFinalText(turns);
      const noLeak = !REPLY_LEAK_RE.test(reply) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(reply);
      return [
        { name: "time_and_campfire_and_cat", pass: Math.abs(s.lighting.timeHours - 18) < 0.2 && hasCampfire && hasCat, detail: `time=${s.lighting.timeHours}, campfire=${hasCampfire}, cat=${hasCat}` },
        { name: "zero_internal_leaks_in_reply", pass: noLeak, detail: `reply=${reply.slice(0, 200)}` }
      ];
    }
  }
];
