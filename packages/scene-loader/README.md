# o3-schema-parser

- 插件化 schema-parser

## 快速上手

### 安装

``` shell
tnpm i @alipay/o3-schema-parser -S
```

### 使用

``` TypeScript
import { parser } from "@alipay/o3-schema-parser";

parser.parse({
  config: schema,
  // HTMLCanvasElement
  canvas: canvas,
  // 自动调用 engine.run()，默认为 false
  autoPlay: true,
});

```

### schema 生成

[oasis-editor](http://3deditor.alipay.net/)

