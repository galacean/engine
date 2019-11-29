# Oasis 3D
初始化依赖
```
tnpm run bootstrap
```

### 发布

获取 token 解决 lerna 发布 tnpm 二次验证的问题

```
tnpm run otp:release
```

### 单元测试

关于[单元测试](https://yuque.antfin-inc.com/oasis3d/mlxz18/fhvrag)

```
tnpm run test
```

##### 测试覆盖率

```
tnpm run test-cov
```

查看 coverage/lcov-report/index.html

## 游乐场相关
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
```
npm run b:playground-miniprogram

```
