import type { PlanningSystemDeclaration } from "@galacean/engine-world-planning/spatial/PlanningSystemDeclaration";
import { NATURAL_VEGETATION_SIZE_CONTROLS } from "@galacean/engine-world-planning/runtime/NaturalVegetationLayers";

/** Ecology owns population and habitat semantics; appearance remains with the material system. */
export const VEGETATION_SYSTEM_DECLARATION: PlanningSystemDeclaration = {
  id: "vegetation-distribution", title: "植被分布", skill: "vegetation",
  components: [
    { type: "flowers", domain: "vegetation", knowledge: [
      "flowers.coverage 是可种植地面中花区面积的目标比例。densityPerM2 是花区内部的花丛密度。patchSizeM 和分布偏好改变花区形状和选址。面积、密度、斑块尺度是不同的控制量。",
      "花变体候选来自素材目录的 Flowers 类别。默认混合比例由 Seed 和所属区域身份确定性抽样，同 Seed 和区域可以重放，区域之间相互独立。assetWeights 以真实资产 ID 为身份，只覆盖明确设置的变体权重。未设置的字段继续生成，0 排除对应变体，恢复默认时移除覆盖。生成比例不保存为手动参数。变体权重不会直接改写花瓣颜色。",
      "花区面积乘 densityPerM2 是名义数量。实际候选仍经过道路、水域、实体占地和主体视线筛选，不因数量不足重试补足，也不做植株之间的间距排斥。尺寸变化可能改变避让结果。路边富集可能增加数量。检查实际放置数和 shortfall，不能把参数被接受等同于数量达标。花区内部没有二次聚簇，也没有树下伴生偏好。"
    ] },
    { type: "landscape", domain: "vegetation", knowledge: [
      "landscape 控制对应区域的生态密度、环境倾向、高度和群落层次。低草高度从所在群落启用的花灌木实测高度和相对比例推导。路边和墙脚伴生沿实际轮廓分布，并保留通行净空，不用固定的全局草高代替群落关系。",
      "整体场景的题材、风格或情绪创作，要先安排各实际植被层的角色：背景轮廓、主体陪衬、连续铺底、过渡层、点缀和近景细节。分别考虑固有色、相对大小、疏密和层次，再读参数执行。只调整树高、草色或花量，不能代表完整的素材构成变化。花瓣、草本、匍匐地被、蘑菇和落叶也要参与构思。保留已有的合适关系要基于整体方案，不能因用户没有逐一列出素材就跳过。范围窄或只改某项参数的明确请求，仍按原授权范围执行。",
      "世界共享尺寸字段 plantSizes.<layerKey>.scaleMin/scaleMax 是相对各素材原始尺度的正倍率。同一功能层的所有物种共用一组范围，保留素材自身的比例和稳定的个体差异，并重新计算占地和花灌木与低草的相对高度。乔木尺寸由 treeHeightMinM/treeHeightMaxM 负责，低草由 grassRelativeHeight/grassHeightVariation 负责。灌木、高草杂草、地被、野花、落叶菌类按功能层调整，不逐物种设置尺寸。配色读 plantMaterial，花的出现比例读 flowers.assetWeights。不能用颜色代替尺度，也不能用权重代替颜色。",
      "共享尺寸目录：用 world.parameters.describe 的 component=landscape、search=对应前缀发现上下限字段，再用 inspect 的 fields 读取确切键。尺寸是世界级功能层参数，同层所有物种一起生效，不能声称只改一种、一株或一块花区。可以用 query 的 kind=world 定向发现目标，不需要枚举所有区域或物种。目录：" + JSON.stringify(NATURAL_VEGETATION_SIZE_CONTROLS.map(({ key, label }) => ({ layer: key, label, prefix: `plantSizes.${key}` }))),
      "vegetation.* 是 0–1 的生成候选显露比例，不是可以超过 1 的增密倍率。减少后恢复时，只隐藏或显露固定位置，不补位，也不重新装填邻居。landscape.vegetation.flowers 同样有效，它筛选 flowers 花区里的候选。flowers.coverage、patchSizeM、densityPerM2 和种子等规划参数可以改变底图。用 world.parameters.describe 返回的 editEffect 区分 reveal、replan、instance，不要把所有生态字段都当作显露参数。",
      "情绪和风格可以由树木、灌木、草花的高低、疏密、留白和前中远景关系表达。构思时要评估乔木和灌木的轮廓节奏，不要只提高花草密度或全屏饱和度。treeHeightMinM/treeHeightMaxM 改变树高范围，冠幅按物种比例同步计算。这是尺寸和群落轮廓的变化，不是重新生成某种枝干或树冠造型。当前没有公开单株倾斜、旋转或枝条角度参数，角度由原生 PCG 派生。不能编造这些字段或宣称已修改。有能力才提出对应参数，没有能力时说明具体的造型或姿态缺口。",
      "原生林下植被不做逐株间距、树脚小石占地排他、视点远近稀释或世界外边界增密。道路、水域、建筑、大型岩石、耕地、坡度和主体视线筛选仍然生效，道路和墙脚富集也仍然生效。普通斑块由固定场决定，物种片区和颜色规则保留。",
      "显露比例和单体作者记录是独立的原子能力。单体修改不参与生成避让，也不要求它与后来显露的候选无碰撞。不能因密度变化擅自删除单体记录。由用户意图决定调用区域参数还是单体能力，只使用查询得到的实际对象 ID 和公开能力。屏幕驻留数量不是保存的世界人口。不能给派生林下实例编造单株编辑 ID。"
    ] },
    { type: "landscapePopulation", domain: "vegetation", knowledge: [
      "landscapePopulation 调整世界候选布点和人口倍率。候选采样、物种生境和实际占地共同决定最终数量。倍率不保证数量。提高密度不能绕过生态条件或实体净空。"
    ] },
    { type: "landscapeInfluence", domain: "vegetation", knowledge: [
      "landscapeInfluence 是目标体量或路径周边的生态影响，改变周边密度和高度倾向，不改变影响源自己的位置、形状或材质。使用实际提供该组件的对象作为目标。"
    ] },
    { type: "flowerInfluence", domain: "vegetation", knowledge: [
      "flowerInfluence 控制路径或广场周边的花区偏好。它不替代 flowers 的面积和区内密度，也不创建新的花资产或颜色。"
    ] }
  ]
};
