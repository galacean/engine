# o3-decal
贴花模块能够在任意形状的表面，快速创建贴花效果
可以在playground -> decal 中快速体验
![image.png](https://intranetproxy.alipay.com/skylark/lark/0/2020/png/76063/1578471266950-777fd6f1-9688-46f0-86ea-ac8dbcff2d8f.png#align=left&display=inline&height=270&name=image.png&originHeight=750&originWidth=968&size=70182&status=done&style=none&width=349)
## 如何使用？

- 引入npm包
- 加载用于贴花的gltf模型
- 创建贴花探针，求交点
- 绑定事件，触发生成贴花

### 引入npm包
```javascript
import {
  DecalGeometry,
  DecalMaterial,
  Caster,
  transformDirection,
  getBoundingBoxByGLTF,
} from '@alipay/o3-decal'
```

推荐引入贴花模块中的全部类与方法，包括
DecalGeometry - 贴花几何体
DecalMaterial - 贴花材质
Caster - 拾取器
transformDirection - 数学方法（也可以自行实现
getBoundingBoxByGLTF - 获取模型的boundingBox（也可以自行实现

### 加载用于贴花的gltf模型
目前贴花模块只支持外部加载gltf mesh，不支持引擎的自带的几何形状
加载gltf模型的步骤可以参考官方教程：[导入gltf模型](https://oasis3d.alipay.com/tutorial/gltf.html)，也可参考playground中decal demo的代码

### 创建贴花探针与拾取器，求交点
#### 创建探针与拾取器
```javascript
// 这里使用的是CuboidGeometry作为探针
const mouseHelper = world.createChild('mouseHelper');
const renderer = mouseHelper.addComponent(GeometryRenderer);
renderer.geometry = new CuboidGeometry(0.5, 0.5, 5);
const mtl = new LambertMaterial('mouseHelper_mtl', false); 
mtl.diffuse = [1, 0, 0, 1];
renderer.setMaterial(mtl);
// 隐藏探针
mouseHelper.isActive = false;

const caster = new Caster();
// 在gltf加载完毕的回调中设置拾取
caster.setTarget(model);
```

#### 求交点
```javascript
let point; // 交点位置
let normla; // 交点处法线
let targetIntersection; // 交点信息

// 绑定事件求拾取交点
document.getElementById('o3-demo').addEventListener('mousemove', () => {
  moved = true;
});
document.getElementById('o3-demo').addEventListener('mousedown', () => {
  moved = false;
});
document.getElementById('o3-demo').addEventListener('mousemove', (e) => {
  // 设置拾取器射线
  const ray = world.cameraAb.screenPointToRay(e.clientX, e.clientY);
  caster.setRay(ray);
	
  // 求交
  let intersection;
  // 仅在moved为true时，取交
  if (moved) {
    intersection = caster.intersect();
  }
  // 讲交点按照距离排序
  let mostCloseIntersection;
  if (intersection.length > 0) {
    const sorted = intersection.sort((a, b) => {
      return a.distance - b.distance;
    });
    mostCloseIntersection = sorted[0];
  }
  // 获取最近的交点后，获取点的坐标与法线
  if (mostCloseIntersection) {
    // 取交成功时，显示探针
    mouseHelper.isActive = true;
    point = mostCloseIntersection.point.slice(0);
    normal = mostCloseIntersection.normal.slice(0);
    targetIntersection = mostCloseIntersection;
		// 设置探针坐标
    mouseHelper.position = point.slice(0);
		
    // 设置探针朝向
    const temp = vec3.create();
    const local = transformDirection(temp, normal, model.getModelMatrix());
    const n = [
      local[0] * 10 + point[0],
      local[1] * 10 + point[1],
      local[2] * 10 + point[2],
    ];
    mouseHelper.lookAt(n, [0, 1, 0]);
  } else {
    // 取交失败，隐藏探针
    mouseHelper.isActive = false;
    point = null;
    normal = null;
  }
});
```

### 绑定事件，触发生成贴花
```javascript
// 创建贴花材质
const decalMtl = new DecalMaterial('decal_mtl');
// demo中我们选择自定义的canvas作为贴图
const textCanvas = createText();
const texture = new Texture2D('text', textCanvas);
decalMtl.texture = texture;

// 绑定事件触发生成贴花
document.getElementById('o3-demo').addEventListener('mouseup', (e) => {
  const orientation = mouseHelper.rotation;
  // 若获取到了交点的位置与法线，则创建贴花
  if (point && normal && !moved) {
    const decal = world.createChild('decal');
    const renderer = decal.addComponent(GeometryRenderer);
    renderer.geometry = new DecalGeometry(
      targetIntersection,
      point,
      orientation,
      [10, 10, 10], // 贴花大小，根据模型大小自由调整
    );
    renderer.setMaterial(decalMtl); // decalMtl 贴花材质
  }
});

// 创建贴花材质的贴图（canvas
function createText() {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 300;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,300,300);
  ctx.fillStyle = '#000';
  ctx.font="60px Arial";
  ctx.fillText("Oasis贴花", 10, 100);
  return c;
}
```

DecalGeometry接受4个参数
交点信息：
```javascript
interface Intersection {
  node: Node,
  distance: Number,
  point: FloatArray,
  normal: FloatArray,
  primitive: Primitive,
  materialName: String,
}
```
交点坐标
交点法线
贴花尺寸

### TODO

- 贴花材质贴图旋转，透明度修改
- raycaster改造

