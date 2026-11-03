// From galacean/editor b1b59de685d4df29a51c3df7eaf3d45a6bc74c1f.
/**
 * Galacean Scene/Prefab 文件格式 v2
 *
 * 设计原则：
 * - Source 文件使用稳定 string id 表达实体/组件身份
 * - runtime compiler 负责将 source id lowering 成运行时整数索引
 * - props = 引擎内存镜像，无 class/methods/constructParams 包装
 * - `$` 前缀为格式保留字，用户属性名不得以 `$` 开头
 * - `_` 前缀为编辑器私有字段，运行时忽略
 * - 省略默认值以减小文件体积
 *
 * @see https://github.com/galacean/editor/issues/3668
 */

export {};

declare global {
  type SourceEntityId = string;
  type SourceComponentId = string;

  // Transitional globals for the schema-v2 rollout. New code should import these
  // schema types from `@editor/model/scene-file-v2` instead of relying on globals.
  // ---------------------------------------------------------------------------
  // 顶层文件结构
  // ---------------------------------------------------------------------------

  /** 场景文件 (.scene) */
  interface GalaceanSceneFile {
    asset: { version: string; generator?: string };
    scene: GalaceanSourceSceneSchema;
    entities: GalaceanSourceEntitySchema[];
    components: GalaceanSourceComponentSchema[];
    /**
     * Scene-owned nested instance overrides, addressed from a stable scene root
     * through source instance boundaries. Shared validation and resolution live
     * in Model's scene-file-v2 module; runtime compilation consumes this state.
     */
    prefab?: Record<string, unknown>;
  }

  /** Validated canonical source scene file. */
  interface GalaceanSourceSceneFile extends GalaceanSceneFile {}

  /** 预制体文件 (.prefab) */
  interface GalaceanPrefabFile {
    asset: { version: string };
    /** 根实体稳定 id */
    root: SourceEntityId;
    entities: GalaceanSourceEntitySchema[];
    components: GalaceanSourceComponentSchema[];
  }

  /** Validated canonical source prefab file. */
  interface GalaceanSourcePrefabFile extends GalaceanPrefabFile {}

  // ---------------------------------------------------------------------------
  // 场景设置
  // ---------------------------------------------------------------------------

  interface GalaceanSceneSchema {
    name?: string;
    /** 根实体稳定 id 列表 */
    rootEntities: SourceEntityId[];
    background?: GalaceanBackgroundSchema;
    ambient?: GalaceanAmbientSchema;
    shadow?: GalaceanShadowSchema;
    fog?: GalaceanFogSchema;
    ambientOcclusion?: GalaceanAmbientOcclusionSchema;
    /** 环境光自动烘焙，省略 = true */
    autoBake?: boolean;
  }

  interface GalaceanSourceSceneSchema extends GalaceanSceneSchema {
    /** 根实体稳定 id 列表 */
    rootEntities: SourceEntityId[];
  }

  interface GalaceanBackgroundSchema {
    mode: number;
    /** { r, g, b, a } */
    color: { r: number; g: number; b: number; a: number };
    texture?: GalaceanAssetRef;
    skyMaterial?: GalaceanAssetRef;
    skyMesh?: GalaceanAssetRef;
    textureFillMode?: number;
  }

  interface GalaceanAmbientSchema {
    ambientLight?: GalaceanAssetRef | null;
    customAmbientLight?: GalaceanAssetRef | null;
    diffuseMode?: number;
    /** { r, g, b, a, _metaIntensity } — HDR 颜色，经 hdrColorSerializer 转换 */
    diffuseSolidColor?: { r: number; g: number; b: number; a: number; _metaIntensity: number };
    diffuseIntensity?: number;
    specularMode?: number;
    customSpecularTexture?: GalaceanAssetRef;
    bakerResolution?: number;
    specularIntensity?: number;
  }

  interface GalaceanShadowSchema {
    castShadows?: boolean;
    enableTransparentShadow?: boolean;
    shadowResolution?: number;
    shadowDistance?: number;
    shadowCascades?: number;
    shadowTwoCascadeSplits?: number;
    /** [x, y, z] */
    shadowFourCascadeSplits?: [number, number, number];
    shadowFadeBorder?: number;
  }

  interface GalaceanFogSchema {
    mode?: number;
    /** { r, g, b, a } */
    color?: { r: number; g: number; b: number; a: number };
    density?: number;
    start?: number;
    end?: number;
  }

  interface GalaceanAmbientOcclusionSchema {
    enabled?: boolean;
    quality?: number;
    intensity?: number;
    radius?: number;
    bias?: number;
    power?: number;
    bilateralThreshold?: number;
    minHorizonAngle?: number;
  }

  // ---------------------------------------------------------------------------
  // 实体
  // ---------------------------------------------------------------------------

  /**
   * 实体 schema（v2）
   *
   * 默认值省略规则：
   * - position: [0,0,0], rotation: [0,0,0], scale: [1,1,1]
   * - isActive: true, layer: 0, isLocked: false
   * - children: [], components: []
   */
  interface GalaceanEntitySchema {
    /** Source 层稳定实体 id */
    id: SourceEntityId;
    name?: string;
    /** 子实体稳定 id 列表 */
    children?: SourceEntityId[];
    /** 局部坐标 [x, y, z]，省略 = [0,0,0] */
    position?: [number, number, number];
    /** Euler 度数 [x, y, z]，省略 = [0,0,0] */
    rotation?: [number, number, number];
    /** [x, y, z]，省略 = [1,1,1] */
    scale?: [number, number, number];
    /** 组件稳定 id 列表 */
    components?: SourceComponentId[];
    /** 省略 = true */
    isActive?: boolean;
    /** Layer bitmask，省略 = 0 (Layer.Nothing) */
    layer?: number;
    /** 省略 = false */
    isLocked?: boolean;
    /** Prefab/glTF 实例 */
    instance?: GalaceanInstanceSchema;
  }

  interface GalaceanSourceEntitySchema extends GalaceanEntitySchema {
    /** Source 层稳定实体 id */
    id: SourceEntityId;
  }

  // ---------------------------------------------------------------------------
  // 组件
  // ---------------------------------------------------------------------------

  interface GalaceanInlineComponentSchema {
    /** Source 层稳定组件 id；仅 addedComponents 根节点可沿用外层 override.id */
    id?: SourceComponentId;
    /** 引擎类名: "Camera", "MeshRenderer", "Script" 等 */
    type: string;
    /**
     * Source 层仅 type="Script" 时保留脚本资产引用；
     * runtime compiler 会 lower 成 engine 结构位所需的裸 number ref。
     */
    script?: GalaceanAssetRef & { key?: string };
    /** 纯属性树（内存镜像） */
    props?: GalaceanSourceValueRecord;
    /** 可执行调用数据（runtime compiler 会递归 lower 其中的 source sentinel） */
    calls?: GalaceanSourceCallSpec[];
  }

  interface GalaceanComponentSchema extends GalaceanInlineComponentSchema {}

  interface GalaceanSourceComponentSchema extends GalaceanComponentSchema {
    /** Source 层稳定组件 id */
    id: SourceComponentId;
  }

  // ---------------------------------------------------------------------------
  // Prefab/glTF 实例
  // ---------------------------------------------------------------------------

  interface GalaceanInstanceSchema {
    asset: GalaceanAssetRef & { key?: string };
    overrides?: GalaceanInstanceOverrides;
    /**
     * Authored glTF raw-main SHA-256. Required when overrides address glTF-internal
     * entities/components; optional for Editor-owned root-only entity props.
     * Must be a 64-digit lowercase hex digest when the field exists.
     */
    sourceContentRevision?: string;
  }

  interface GalaceanInstanceOverrides {
    /** 实体属性覆盖（数组，每项含 target source entity id） */
    entityProps?: GalaceanEntityPropOverride[];
    /** 组件 mutation 覆盖（数组，每项含 target source component id） */
    componentProps?: GalaceanComponentOverride[];
    /** 移除的实体 source id */
    removedEntities?: SourceEntityId[];
    /** 移除的组件 source component id */
    removedComponents?: SourceComponentId[];
    /** 新增实体 */
    addedEntities?: GalaceanAddedEntityOverride[];
    /** 新增组件 */
    addedComponents?: GalaceanAddedComponentOverride[];
  }

  interface GalaceanEntityOverrideProps {
    name?: string;
    isActive?: boolean;
    layer?: number;
    isLocked?: boolean;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  }

  /** 实体属性覆盖条目（含 source entity id） */
  interface GalaceanEntityPropOverride extends GalaceanEntityOverrideProps {
    target: SourceEntityId;
  }

  /** 组件属性覆盖条目（含 source component id） */
  interface GalaceanComponentOverride {
    target: SourceComponentId;
    props?: GalaceanSourceValueRecord;
    calls?: GalaceanSourceCallSpec[];
  }

  interface GalaceanAddedEntityOverride {
    id: SourceEntityId;
    /** 父实体 source id */
    parent: SourceEntityId;
    /** sibling 插入位置 */
    index?: number;
    /**
     * Source 层保留内联实体，便于编辑器序列化和 reload；
     * runtime compiler 会将其扁平化到顶层 entities[] 并把这里 lower 成索引。
     */
    entity: GalaceanInlineEntitySchema;
  }

  interface GalaceanAddedComponentOverride {
    id: SourceComponentId;
    /** owner source entity id */
    owner: SourceEntityId;
    /**
     * Source 层保留内联组件；
     * runtime compiler 会将其扁平化到顶层 components[] 并把这里 lower 成索引。
     */
    component: GalaceanInlineComponentSchema;
  }

  /**
   * 内联实体（用于 addedEntities override）
   * 与 GalaceanEntitySchema 相同但 children/components 是内联定义而非索引
   */
  interface GalaceanInlineEntitySchema {
    /** 稳定实体 id；仅 addedEntities 根节点可沿用外层 override.id */
    id?: SourceEntityId;
    name?: string;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    isActive?: boolean;
    layer?: number;
    isLocked?: boolean;
    components?: GalaceanSourceComponentSchema[];
    children?: (GalaceanInlineEntitySchema & { id: SourceEntityId })[];
    /** Nested Prefab/glTF instance. Instance entities should not carry normal entity fields. */
    instance?: GalaceanInstanceSchema;
  }

  // ---------------------------------------------------------------------------
  // 值类型
  // ---------------------------------------------------------------------------

  /** 资产引用 */
  interface GalaceanAssetRef {
    $ref: string;
    key?: string;
  }

  /** 实体引用（props 中使用） */
  interface GalaceanEntityRef {
    /** Source entity id */
    $entity: SourceEntityId;
  }

  interface GalaceanInstanceComponentTarget {
    /** Source entity id of the Prefab/glTF instance anchor */
    instance: SourceEntityId;
    /** Source component id inside Prefab or canonical glTF component target */
    target: SourceComponentId;
  }

  /** 组件引用（props 中使用） */
  interface GalaceanComponentRef {
    /** Local source component id or a component inside a Prefab/glTF instance */
    $component: SourceComponentId | GalaceanInstanceComponentTarget;
  }

  /** 多态构造实例（props 中使用） */
  interface GalaceanTypeInstance {
    /** 引擎类名 */
    $type: string;
    /** 构造参数；与 Engine loader TypeValue.$args 对齐 */
    $args?: GalaceanSourceValue[];
    [prop: string]: GalaceanSourceValue;
  }

  /** 引擎类引用（方法调用参数中使用） */
  interface GalaceanClassRef {
    $class: string;
  }

  /** Engine loader 可 JSON 序列化的正无穷值 */
  interface GalaceanSpecialNumberValue {
    $number: "Infinity";
  }

  interface GalaceanSourceCallSpec {
    target?: string[];
    method: string;
    args?: GalaceanSourceValue[];
    result?: GalaceanSourceMutationBlock;
  }

  interface GalaceanSourceMutationBlock {
    props?: GalaceanSourceValueRecord;
    calls?: GalaceanSourceCallSpec[];
  }

  /** Signal 事件监听器（props 中使用） */
  interface GalaceanSignalListener {
    /** Script component that receives the event */
    target: GalaceanComponentRef;
    /** Method invoked on the target component */
    methodName: string;
    /** Arguments appended after the emitted Signal arguments */
    args?: GalaceanSourceValue[];
  }

  /** Signal 事件绑定（props 中使用） */
  interface GalaceanSignal {
    $signal: GalaceanSignalListener[];
  }

  type GalaceanSourcePrimitive = null | string | number | boolean;
  type GalaceanSourceValueRecord = { [key: string]: GalaceanSourceValue };
  type GalaceanSourceValue =
    | GalaceanSourcePrimitive
    | GalaceanAssetRef
    | GalaceanEntityRef
    | GalaceanComponentRef
    | GalaceanSignal
    | GalaceanTypeInstance
    | GalaceanClassRef
    | GalaceanSpecialNumberValue
    | GalaceanSourceValue[]
    | GalaceanSourceValueRecord;

  // ---------------------------------------------------------------------------
  // 常量
  // ---------------------------------------------------------------------------

  /** 当前 v2 版本号 */
  type GalaceanSchemaVersion = "2.0";
}
