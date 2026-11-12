import type { SpatialField } from "./SpatialDocument";
import type {
  TerrainLightingRuntime,
  TerrainLightingVisualTuning,
  TerrainTimeOfDayLightingSample
} from "../integrations/terrain/lighting/TerrainLightingRuntime.ts";
import type { PlanningSystemDeclaration } from "./PlanningSystemDeclaration";
import type { PlanningResourceDefinition } from "./PlanningResourcePreflight";
import {
  decodeTerrainLightingProfile,
  sampleTerrainLightingProfile
} from "../integrations/terrain/lighting/TerrainLightingProfile.ts";
import seedLightingProfile from "@galacean/engine-environment/terrain/lighting/SeedWorldLightingProfile.json";
import { SEED_WORLD_DEFAULT_FOG_VALUES } from "@galacean/engine-environment/terrain/lighting/SeedWorldLightingPreset";

const seedLightingSamples = seedLightingProfile.samples.map((sample) => ({
  timeHours: sample.timeHours,
  sunIntensity: sample.sunIntensity,
  ambientIntensity: sample.ambientIntensity,
  iblIntensity: sample.iblIntensity,
  skyExposure: sample.skyExposure,
  skyTintRGB: [sample.skyTintR, sample.skyTintG, sample.skyTintB],
  fogDensity: sample.fogDensity,
  zenithRGB: [sample.customSkyZenithR, sample.customSkyZenithG, sample.customSkyZenithB],
  horizonRGB: [sample.customSkyHorizonR, sample.customSkyHorizonG, sample.customSkyHorizonB]
}));

export const PLANNING_LIGHTING_RESOURCES: readonly PlanningResourceDefinition[] = [
  { field: "profileUrl", validate: decodeTerrainLightingProfile }
];

const LIGHTING_SAMPLES_FACT =
  "# 日照采样\n\n从随应用发布的 SeedWorldLightingProfile.json 直接提取。只有当前 profileUrl 指向该资源时才适用。时刻之间按原生曲线插值，明确的覆盖值优先。\n\nzenithRGB 和 horizonRGB 按红、绿、蓝排列，是 customSkyZenithR/G/B 和 customSkyHorizonR/G/B 的曲线来源，表示天空着色系数，不是最终像素颜色。\n\n```json\n" +
  JSON.stringify(seedLightingSamples) +
  "\n```\n";

export const PLANNING_LIGHTING_DECLARATION: PlanningSystemDeclaration = {
  id: "lighting",
  title: "光照与后处理",
  skill: "environment",
  components: [
    {
      type: "lighting",
      domain: "lighting",
      validateExecution: validateLightingExecution,
      readInherited: readInheritedLighting,
      facts: [{ path: "lighting-samples.md", content: LIGHTING_SAMPLES_FACT }],
      knowledge: [
        "profileUrl 引用原生 JSONAsset，其中含完整日照曲线和星月静态设置。只引用已查询到或用户明确提供的资源 URL，不能根据情绪或主题编造地址。资源仍要实际加载验证。显式光源字段覆盖资产的采样值。reset 删除覆盖，回到当前 profile 的曲线。",
        "改时间的入口：用户只要求改当前时间时，用 tools.time.update。重新设计整套光照时，才通过本组件修改 timeHours。timeHours 是保存在规划组件里的作者时刻。世界重新发布不会改动当前时钟，只有这个值变化时才会移动时钟。用 world.parameters.inspect 读作者参数，用 tools.time.get 读当前时钟。",
        "lighting 是当前世界的真实光照能力。timeHours 同时采样太阳方向、天空和云层色彩、大气与光源的原生日照曲线，不只是修改物体亮度。日落时刻会改变整片天空。明确设置的光源和天空字段覆盖相应曲线值，reset 恢复曲线。修改时刻不会自动删除这些历史覆盖，要一并检查它们是否适合新的时段。",
        "光照创作先构思视觉关系，再选参数。根据题材、风格、情绪和用户参考，综合评估时刻与光线方向、主光和补光的比例、受光面与阴影的层次、天空与实体的冷暖，以及空气清晰度。先从实际日照曲线选择支持这组关系的时段，再协调光源、天空覆盖和后处理。不要先固定旧时刻，再用更多光强、色温或渐变去抵消不合适的时段。timeHours 是首要的光照设计维度，当前值不是锁定条件。保留当前值也要符合构思。不能把情绪词绑定为固定时间、亮度或色彩配方。清晨、正午、黄昏和夜景都可用于创作，通透明亮不是所有情绪的默认目标。",
        "当前参数只是待修改的起点，不是创作目标或美术参考。已有的偏色、灰雾、过曝或暗沉要重新判断。如果选择热情、温暖而明快的表达，可以让暖色主体接受清晰日光，用较冷的天空和阴影衬托，光照充足、空气清澈、亮部保有材质细节、暗面有补光和体积。不要用黄昏底色加暖滤镜表达温暖。具体时刻仍要依据实际曲线的太阳方向和天空色关系决定，不能固定到某个小时。选择暮色或暗调时，采用相应的视觉关系。",
        "整套光照构思要一起检查时刻、光源和天空覆盖、阴影和雾。lighting 是单个世界组件。用 world.parameters.inspect 指定 id=world、component=lighting 读取当前值，按 nextOffset 翻页。声明用 world.parameters.describe 读取。只改某个参数时，用 fields 的确切字段键定向读取，不使用通配符。目录首页不是全部字段，页末的雾密度等控制不能因未出现在首页就忽略。当前值缺省的字段表示没有作者覆盖，沿用 profile 的采样，不表示零或没有能力。",
        "sunIntensity、sunColorR/G/B 作用于真实太阳主光，需要开启 direct。ambientIntensity 和 iblIntensity 作用于环境补光和反射，需要开启 environment。阴影强度和雾密度分别受 shadows、fog 开关控制。需要启用已关闭的通道时，把开关修改一同提出。",
        "当前 lighting 只有世界作用域，没有局部灯光分区。照明要求由实际光源承接，后处理的曝光、色温和饱和度不能替代光源变化。",
        "照明、时刻和天空可以参与题材和情绪表达，要与建筑、树木和草花的固有色共同设计。通常用主次关系和冷暖对比形成层次：大面积冷色天空和阴影，与暖色受光面、草地、树冠相互衬托，少量高饱和点缀突出主体，不要把所有系统推向同一种颜色。原文明确要求单色、异色天空或特殊风格时，按该意图设计，不把一般建议当成禁止修改的规则。",
        "光线方向和主光、补光比例共同塑造体积。材料固有色、受光色和阴影色要形成可读的层次。明快的构思可以用较充分的补光保留暗面细节。戏剧性的构思可以用方向明确的主光和更强的明暗对比。不能把压黑所有暗部或全部泛白当成体积塑造。温暖可以来自暖色受光面、建筑和树冠，与较冷的天空、远景和阴影对照，不必把主光和所有元素都调成浓橙色。按实际日照曲线、材料和曝光协调能量。参数变化不等于达成画面目标。",
        "普通白天通常保留偏蓝的天空上部。夕阳的橙金暖色主要集中在太阳和地平线附近，再向上自然过渡到较冷的天空。暖色云缘和较冷云影可以形成层次。",
        "skyTintR/G/B 改变原生大气的散射波长配色，是天空底色的来源。customSkyZenithR/G/B 和 customSkyHorizonR/G/B 是分别乘在天空上部和地平线散射辐亮度上的线性 RGB 系数，1 表示该通道不缩放，不是直接替换像素颜色。customSkyTintStrength 在中性系数 1 和这个渐变乘数之间混合。因此把暖色散射底色乘上略偏蓝的系数，不保证成为蓝天，要同时读取并协调 skyTint 和渐变。skyExposure 是天空自身的曝光倍率。这些字段用于原生天空材质和环境 IBL，不是全画面滤镜。timeHours 仍控制太阳方向和其余日照曲线。设计前先读当前时刻、天空覆盖和调色。不能宣称降低后处理色温就已保留蓝天。未覆盖的字段继承日照资产，reset 恢复该资产。",
        "fogDensity 是距离雾的密度系数，单位是米的倒数。物体越远、密度越高，原生指数雾把越多物体颜色混合为大气辐亮度。明亮通透靠真实光源和动态范围，不是加厚雾把暗面泛白。先与当前资产的密度比较，避免因很小的小数把密度提高数倍。要保留近景材质细节和远景层次。",
        "选时刻前读取 profileUrl，确认使用哪份日照资产。各时刻的数值见[日照采样](declare/editor/world/facts/lighting-samples.md)，它只在 profileUrl 指向 SeedWorldLightingProfile.json 时适用，其他资源要按实际数据判断。红通道主导的天顶通常偏暖。蓝通道主导的天顶更适合作为蓝天的来源，再结合当前曝光、调色和实际渲染判断。不能只凭“下午”这个名称推断天空是蓝色，也不能把保留原时刻当成蓝天已保留的证据。"
      ]
    },
    {
      type: "postProcess",
      domain: "grading",
      validateExecution: validatePostProcessExecution,
      knowledge: [
        "postProcess 在全画面渲染完成后处理曝光补偿、白平衡色温、饱和度、对比度、色调映射和 Bloom。天空、云、地面和所有物体一起受影响，它不是目标物体的颜色控制。它不改变灯光能量、物体材质、几何或花的颜色种类。",
        "temperature、contrast、saturation 是 [-100,100] 的原生调整量，0 表示该项中性，不是开尔文、百分比绝对颜色或 RGB 倍率。它们可以协调整体画面，但会同时改变天空和物体。对象颜色由所属材质能力表达，不能用整体暖色温或高饱和度替代暖色场景元素。",
        "先检查当前值是否已有历史调色叠加，避免每次生成都继续加暖或增饱和。以主体辨识、天空和地面的冷暖对比、亮暗和饱和度的主次为目标选择绝对值。需要时可以减弱已有的整体偏色。热情、明快等情绪不等于全屏橙黄或每个元素都高饱和。暖色草地、橙色树冠和较冷蓝天可以同时存在，后处理要服务于这种关系。",
        "调色要服务于所选的光照构思，用 postExposure 和色调映射协调动态范围和视觉重心。明亮、暗调或朦胧都按原文设计，不默认提亮所有画面。避免重要受光面大面积过曝失去纹理，或重要暗面压黑失去体积。提高对比度会压暗暗部。全画面暖色温会同时改变蓝天。不要用暗黄滤镜或强 Bloom 替代真实光照，也不要为追求亮度让所有区域同样亮。",
        "后处理需要开启 enabled，Bloom 另受 bloom 开关控制。修改具体效果时，检查对应开关和当前值。参数合法和已执行都不能证明最终画面或审美满足。"
      ]
    }
  ]
};

async function readInheritedLighting(
  current: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  signal: AbortSignal
) {
  const inherited = fields.filter((field) => current[field] === undefined);
  if (!inherited.length || typeof current.profileUrl !== "string") return;
  signal.throwIfAborted();
  const response = await fetch(current.profileUrl, { signal });
  if (!response.ok) throw new Error(`日照资产读取失败：HTTP ${response.status}`);
  const profile = decodeTerrainLightingProfile(await response.json());
  signal.throwIfAborted();
  const timeHours = Number(current.timeHours);
  return {
    values: sampleTerrainLightingProfile(profile, timeHours, inherited),
    source: { kind: "lightingProfile", url: current.profileUrl, timeHours }
  };
}

function validateLightingExecution(
  patch: Readonly<Record<string, unknown>>,
  effective: Readonly<Record<string, unknown>>
): string | undefined {
  let reason: string | undefined;
  if ((patch.fogDensity !== undefined || patch.fogExponent !== undefined) && effective.fog === false)
    reason = "大气雾关闭；请显式开启 fog 后调整距离雾";
  if (patch.shadowStrength !== undefined && (effective.shadows === false || effective.direct === false))
    reason = "太阳月光或实时阴影关闭；请显式开启 direct 和 shadows 后调整阴影强度";
  if (
    ["sunIntensity", "sunColorR", "sunColorG", "sunColorB"].some((key) => patch[key] !== undefined) &&
    effective.direct !== true
  )
    reason = "直射光关闭；请在同一意图设置 direct 为 true 后调整主光强度或颜色";
  if (["ambientIntensity", "iblIntensity"].some((key) => patch[key] !== undefined) && effective.environment !== true)
    reason = "环境光关闭；请在同一意图设置 environment 为 true 后调整环境补光或反射强度";
  return reason;
}

function validatePostProcessExecution(
  patch: Readonly<Record<string, unknown>>,
  effective: Readonly<Record<string, unknown>>
): string | undefined {
  if (effective.enabled === false && Object.keys(patch).some((key) => key !== "enabled"))
    return "后处理关闭，外观参数不会显示；请在同一意图显式设置 enabled 为 true";
}

/** Existing light-source controls, independent of post-process colour grading. */
export const PLANNING_LIGHT_SOURCE_FIELDS: SpatialField[] = (
  [
    [
      "sunIntensity",
      "直射光强度",
      "太阳主光的能量；0关闭主光能量，同时参与云层光照，不能作为仅改变目标物体亮度的控制。"
    ],
    ["sunColorR", "直射光颜色 · 红", "主光线性RGB红通道，同时参与云层受光颜色。"],
    ["sunColorG", "直射光颜色 · 绿", "主光线性RGB绿通道，同时参与云层受光颜色。"],
    ["sunColorB", "直射光颜色 · 蓝", "主光线性RGB蓝通道，同时参与云层受光颜色。"],
    ["ambientIntensity", "环境漫反射强度", "天空环境对物体暗面的补光能量。"],
    ["iblIntensity", "环境反射强度", "天空环境镜面反射能量。"]
  ] as const
).map(([key, label, description]) => ({
  key,
  label,
  type: "number",
  min: 0,
  step: 0.01,
  unit: key.startsWith("sunColor") ? "线性 RGB" : "强度",
  combine: "override",
  description: description + " 未设置时沿用当前时刻的原生日照曲线；重置恢复曲线。"
}));

/** Sparse overrides of the native atmosphere gradient and its exposure, including HDR channels. */
export const PLANNING_SKY_FIELDS: SpatialField[] = [
  ...(["R", "G", "B"] as const).map((channel) => ({
    key: `skyTint${channel}`,
    label: `天空大气底色 · ${channel}`,
    type: "number" as const,
    min: 0,
    step: 0.01,
    unit: "线性 RGB",
    combine: "override" as const,
    description:
      "世界天空原生大气散射波长的配色控制，由天空材质转换后计算散射；不是最终像素颜色，也不改变物体固有色。天空渐变系数乘在此散射结果上，环境 IBL 随之更新。未设置继承当前日照曲线；重置恢复曲线。"
  })),
  {
    key: "customSkyTintStrength",
    label: "天空渐变混合权重",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    unit: "比例",
    combine: "override",
    description:
      "世界天空渐变乘数的权重，0为中性乘数1，1为完整渐变乘数；不会用渐变替换大气散射底色。未设置继承当前日照曲线；重置恢复曲线。"
  },
  ...(["Zenith", "Horizon"] as const).flatMap((region) =>
    (["R", "G", "B"] as const).map((channel) => ({
      key: `customSky${region}${channel}`,
      label: `天空${region === "Zenith" ? "天顶" : "地平线"} · ${channel}`,
      type: "number" as const,
      min: 0,
      step: 0.01,
      unit: "线性 RGB",
      combine: "override" as const,
      description: `世界天空${region === "Zenith" ? "上部" : "底部"}渐变的线性 ${channel} 乘数，1为不缩放该通道，支持 HDR；乘在大气散射颜色上，与另一端形成过渡，受混合权重控制。不是最终像素 RGB。同时影响天空环境 IBL；不改变物体固有色。未设置继承当前日照曲线，重置恢复曲线。`
    }))
  ),
  {
    key: "skyExposure",
    label: "天空曝光倍率",
    type: "number",
    min: 0,
    step: 0.01,
    unit: "倍率",
    combine: "override",
    description: "世界天空材质自身曝光，同时影响环境 IBL；不是全画面后处理曝光。未设置继承当前日照曲线；重置恢复曲线。"
  },
  ...(
    [
      ["sunSize", "太阳盘尺寸", "原生太阳盘的角尺寸参数。"],
      ["atmosphereThickness", "大气厚度", "原生散射光程；与天空渐变乘数分别控制。"],
      ["starIntensity", "星光强度", "原生星空辐亮度；不改变星点分布。"],
      ["moonLightIntensity", "月光强度", "原生月光能量，同时作用于夜间直射光和天空月光散射。"],
      ["moonDiskIntensity", "月盘亮度", "仅月盘辐亮度；不替代天空环境能量。"],
      ["moonAtmosphereIntensityScale", "月光散射倍率", "原生天空的月光散射能量；独立于白天天空渐变。"],
      ["twilightIntensity", "暮光强度", "原生地平线暮光辐亮度。"],
      ["airglowIntensity", "夜间气辉强度", "原生夜间气辉辐亮度。"],
      ["fogRadianceIntensity", "雾辐亮度倍率", "真实天空环境进入距离雾的能量倍率，不改变雾密度。"]
    ] as const
  ).map(([key, label, description]) => ({
    key,
    label,
    type: "number" as const,
    min: 0,
    step: 0.01,
    unit: "原生参数",
    combine: "override" as const,
    description: description + " 未覆盖时继承所选光照资产；重置恢复资产。"
  })),
  ...(["moonColor", "fogTint", "groundTint"] as const).flatMap((slot) =>
    (["R", "G", "B"] as const).map((channel) => ({
      key: slot + channel,
      label: `${slot === "moonColor" ? "月光颜色" : slot === "fogTint" ? "雾散射乘数" : "大气地面反照色"} · ${channel}`,
      type: "number" as const,
      min: 0,
      step: 0.01,
      unit: "线性 RGB",
      combine: "override" as const,
      description:
        "原生光照资产的独立颜色通道，不读取物体主题色。月光颜色影响月光直射与散射；雾乘数作用于天空方向辐亮度。未覆盖时继承资产，重置恢复资产。"
    }))
  )
];

/** Restore the source profile first so deleting an authored override resets both light and sky. */
export function applyPlanningLightSources(
  lighting: Pick<
    TerrainLightingRuntime,
    "setTimeOfDayLightingProfile" | "setTuning" | "setVisibility" | "applyVisualTuning"
  >,
  values: Record<string, unknown>,
  sourceProfile: readonly TerrainTimeOfDayLightingSample[],
  applyTime = true
): void {
  const visual: Partial<TerrainLightingVisualTuning> = { fogExponent: SEED_WORLD_DEFAULT_FOG_VALUES.fogExponent };
  const overrideKeys = [
    ...PLANNING_LIGHT_SOURCE_FIELDS.map((field) => field.key),
    ...PLANNING_SKY_FIELDS.map((field) => field.key),
    "shadowStrength",
    "fogDensity",
    "fogExponent"
  ];
  for (const key of overrideKeys) {
    const value = values[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`光源参数无效：${key}`);
    if (key === "customSkyTintStrength" && value > 1) throw new Error(`天空混合权重须在 0–1 之间`);
    if (key === "fogExponent" && value === 0) throw new Error("距离雾指数须大于 0");
    Object.assign(visual, { [key]: value });
  }
  lighting.setTimeOfDayLightingProfile(sourceProfile);
  if (applyTime) lighting.setTuning({ playing: false, timeHours: Number(values.timeHours) });
  lighting.setVisibility({
    direct: Boolean(values.direct),
    environment: Boolean(values.environment),
    shadows: Boolean(values.shadows),
    fog: Boolean(values.fog)
  });
  lighting.applyVisualTuning(visual, Number(values.timeHours));
}
