# Engine-MCP

> 大模型引擎代码理解与生成系统

**⚠️ 开发状态：此项目目前处于早期开发阶段，尚未发布可用版本**

Engine-MCP (Model Context Protocol for Engine) 是一个专门为 Galacean Engine 设计的智能代码理解与生成系统，旨在让大语言模型能够快速理解引擎架构、API 使用方式，并根据用户意图生成高质量的引擎代码。

## 🎯 项目目标

- **🧠 代码理解**: 让 LLM 深度理解 Galacean Engine 的架构和设计模式
- **🚀 智能生成**: 根据自然语言描述生成符合引擎规范的代码
- **📚 最佳实践**: 确保生成的代码遵循引擎的最佳实践
- **🎨 上下文感知**: 基于现有项目结构生成一致的代码

## 📁 项目结构

```
engine-mcp/
├── src/                    # 源代码
│   ├── knowledge/         # 知识图谱构建
│   ├── context/           # 上下文提取
│   ├── intent/            # 意图解析
│   ├── generator/         # 代码生成
│   ├── validator/         # 质量验证
│   └── types/             # 类型定义
├── docs/                  # 项目文档
│   ├── RFC.md            # 项目 RFC 文档
│   ├── api.md            # API 文档
│   └── examples/         # 使用示例
├── examples/              # 代码示例
│   ├── basic/            # 基础示例
│   ├── advanced/         # 高级示例
│   └── templates/        # 代码模板
├── tests/                 # 测试文件
├── config/               # 配置文件
└── data/                 # 数据文件
    ├── knowledge-base/   # 引擎知识库
    ├── templates/        # 代码模板
    └── examples/         # 示例代码库
```

## 🛠 核心组件

### 1. 知识图谱构建器
- 分析 Galacean Engine 源码
- 构建组件关系图谱
- 提取 API 信息和最佳实践

### 2. 上下文提取器
- 分析用户项目结构
- 提取代码风格和依赖关系
- 识别项目特征

### 3. 意图解析器
- 解析自然语言描述
- 识别开发任务类型
- 提取参数和约束条件

### 4. 代码生成器
- 基于模板生成代码
- 应用最佳实践规则
- 优化代码结构

### 5. 质量验证器
- 验证语法正确性
- 检查类型安全
- 评估性能影响

## 📚 开发者指南

### 环境要求
- Node.js >= 16.x
- TypeScript >= 4.x
- Galacean Engine 项目 (用于测试)

### 贡献代码
由于项目处于早期开发阶段，我们欢迎各种形式的贡献：
- 🐛 问题反馈和建议
- 📝 文档改进
- 💡 功能设计讨论
- 🔧 代码贡献

## 🎨 预期使用示例

> ⚠️ 以下示例展示项目完成后的预期API，当前版本尚未实现

```typescript
import { EngineCodeGenerator } from 'engine-mcp';

const generator = new EngineCodeGenerator();

// 分析现有项目
await generator.analyzeProject('./my-galacean-project');

// 生成代码
const code = await generator.generate({
  intent: "创建一个旋转的立方体，带有点光源照明",
  context: "基于现有的场景结构"
});

console.log(code);
```

### 预期生成效果
```typescript
// 基于意图自动生成的 Galacean Engine 代码
const cubeEntity = scene.createRootEntity("RotatingCube");
const meshRenderer = cubeEntity.addComponent(MeshRenderer);
meshRenderer.mesh = PrimitiveMesh.createCube(engine, 1);

const material = new BlinnPhongMaterial(engine);
meshRenderer.setMaterial(material);

// 添加点光源
const lightEntity = scene.createRootEntity("PointLight");
const pointLight = lightEntity.addComponent(PointLight);
lightEntity.transform.setPosition(2, 2, 2);

// 旋转动画脚本
class RotationScript extends Script {
  onUpdate(deltaTime: number) {
    this.entity.transform.rotate(0, 50 * deltaTime, 0);
  }
}
cubeEntity.addComponent(RotationScript);
```

## 📖 文档

- [RFC 文档](./docs/RFC.md) - 项目设计和实施计划
- [API 文档](./docs/api.md) - API 使用说明
- [示例集合](./examples/) - 代码示例和模板

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🔗 相关链接

- [Galacean Engine](https://github.com/galacean/engine)
- [官方文档](https://galacean.antgroup.com/engine/docs)
- [官方编辑器](https://galacean.antgroup.com/editor)
