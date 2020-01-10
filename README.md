# Oasis 3D
> 绿洲引擎：面相前端工程师的高性能 3D 引擎

更多介绍：[https://oasis3d.alipay.com/](https://oasis3d.alipay.com/)

## Badge

[![TNPM version][tnpm-image]][tnpm-url]
[![TNPM downloads][tnpm-downloads-image]][tnpm-url]

[tnpm-image]: https://npm.alibaba-inc.com/badge/v/@alipay/o3.svg
[tnpm-url]: https://npm.alibaba-inc.com/package/@alipay/o3
[tnpm-downloads-image]: https://npm.alibaba-inc.com/badge/d/@alipay/o3.svg

## 初始化依赖
```
tnpm run bootstrap
```

## 发布

获取 token 解决 lerna 发布 tnpm 二次验证的问题

```
tnpm run otp:release
```

## 单元测试

关于[单元测试](https://yuque.antfin-inc.com/oasis3d/mlxz18/fhvrag)

```
tnpm run test
```

### 测试覆盖率

```
tnpm run test-cov
```

查看 coverage/lcov-report/index.html

## Playground
调试

```
npm run dev
```

发布

```
npm run b:playground
```

若内存溢出

```
npm run fix-memory-limit
```

缩略图模式

> 往playground/*/ 下面添加avatar.jpg 或者avatar.png ,将自动切换展示模式


发布小程序版本

> 将构建产物copy到小程序仓库的page/playground下面

``` shell
npm run b:playground-miniprogram
```


## Contributors(5)

Ordered by date of first contribution, by [ali-contributors](https://gitlab.alibaba-inc.com/node/ali-contributors).

- <a target="_blank" href="https://work.alibaba-inc.com/work/u/62285"><img style="vertical-align: middle;" width="20" src="https://work.alibaba-inc.com/photo/62285.40x40.xz.jpg"> @烧鹅</a> <a target="_blank" href="dingtalk://dingtalkclient/action/sendmsg?dingtalk_id=cyiqsko"><img style="vertical-align: middle;" width="20" src="https://img.alicdn.com/tfs/TB18HtyiyqAXuNjy1XdXXaYcVXa-24-24.svg"> 烧鹅</a>
- <a target="_blank" href="https://work.alibaba-inc.com/work/u/190504"><img style="vertical-align: middle;" width="20" src="https://work.alibaba-inc.com/photo/190504.40x40.xz.jpg"> @月木</a> <a target="_blank" href="dingtalk://dingtalkclient/action/sendmsg?dingtalk_id=fxynsrj"><img style="vertical-align: middle;" width="20" src="https://img.alicdn.com/tfs/TB18HtyiyqAXuNjy1XdXXaYcVXa-24-24.svg"> 胡松</a>
- <a target="_blank" href="https://work.alibaba-inc.com/work/u/205647"><img style="vertical-align: middle;" width="20" src="https://work.alibaba-inc.com/photo/205647.40x40.xz.jpg"> @慎思</a> <a target="_blank" href="dingtalk://dingtalkclient/action/sendmsg?dingtalk_id=cd2bbi3"><img style="vertical-align: middle;" width="20" src="https://img.alicdn.com/tfs/TB18HtyiyqAXuNjy1XdXXaYcVXa-24-24.svg"> 祝旭东-慎思</a>
- <a target="_blank" href="https://work.alibaba-inc.com/work/u/207662"><img style="vertical-align: middle;" width="20" src="https://work.alibaba-inc.com/photo/207662.40x40.xz.jpg"> @子鱼</a> <a target="_blank" href="dingtalk://dingtalkclient/action/sendmsg?dingtalk_id=czizzy"><img style="vertical-align: middle;" width="20" src="https://img.alicdn.com/tfs/TB18HtyiyqAXuNjy1XdXXaYcVXa-24-24.svg"> 陈卓</a>
- <a target="_blank" href="https://work.alibaba-inc.com/work/u/84888"><img style="vertical-align: middle;" width="20" src="https://work.alibaba-inc.com/photo/84888.40x40.xz.jpg"> @陆庄</a> <a target="_blank" href="dingtalk://dingtalkclient/action/sendmsg?dingtalk_id=t0pp2lv"><img style="vertical-align: middle;" width="20" src="https://img.alicdn.com/tfs/TB18HtyiyqAXuNjy1XdXXaYcVXa-24-24.svg"> 陆庄</a>

---
[![CoffeePay 打赏](http://coffee.alibaba-inc.com/projects/5e17ee1e3327bb54b4b0f1f0/badge)](http://coffee.alibaba-inc.com/donates?id=5e17ee1e3327bb54b4b0f1f0)
欢迎打赏一杯咖啡~
<br>
<img width="150" src="http://coffee.alibaba-inc.com/projects/5e17ee1e3327bb54b4b0f1f0/qr">


--------------------
