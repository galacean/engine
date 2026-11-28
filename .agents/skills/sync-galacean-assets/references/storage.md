# 存储协议与运行边界

AFTS 协议依据用户提供的《afts-upload 开发使用手册 v2》（2026-09-16）。
本文件保存协议，不保存账号密钥。

## 配置

| 变量 | 默认值或要求 |
|---|---|
| `AFTS_APPID` | `apwallet` |
| `AFTS_BIZKEY` | `asap_serivce`，保留该拼写 |
| `AFTS_BIZSECRET` | 由运行进程注入 |
| `AFTS_OP_TOKEN_URL` | `https://mmtcapi.alipay.com/token/1.0/op` |
| `AFTS_MASS_TOKEN_URL` | `https://mmtcapi.alipay.com/token/1.0/mass` |
| `AFTS_UPLOAD_URL` | `http://mass.alipay.com/file/auth/upload` |
| `AFTS_PUBLIC_URL_BASE` | `https://mdn.alipayobjects.com` |

上传地址来自手册。目标环境是否支持 HTTPS，需要实际检查。
不要根据猜测更换协议或域名。

## 上传协议

1. 使用 `MD5(appId + bizKey + timestamp_ms + bizsecret)` 生成签名。
2. 依次获取 opToken 和 massToken。
3. 响应 `code` 接受数值 `0` 或字符串 `"0"`。`data` 接受 token 字符串或对象。
4. massToken 缓存 55 分钟。
5. 使用 multipart 文件流上传，设置 `setpublic=true`。不使用覆盖选项。
6. 对上传 alias 和对应 multipart 字段名执行一次 URL 路径编码，保留 `/`。
7. 公网 URL 使用相同的一次编码结果。
8. 回读 CDN 文件，检查长度、SHA-256 和 CORS。

直接使用原始中文 alias 会返回业务错误 607。
相同编码用于保持中文、空格和百分号文件名的相对路径一致。
上传响应不能单独证明成功。最多尝试 3 次，仍失败则停止。
不要输出签名 URL 或完整服务响应。

## CDN 目录

```text
galacean-retrieval/v1/
  assets/<asset-directory-hash>/<object-set-fingerprint>/<original-relative-path>
  catalog/index/<content-hash>.bin
  catalog/summaries/<content-hash>.json
  catalog/<manifest-content-hash>.json
```

manifest、index 和 summaries 共享 `catalog/` 父目录，供现有客户端解析相对 URL。
索引 `.bin` 的文件内容已经 gzip 压缩。
不要设置 `Content-Encoding: gzip`，以免浏览器提前解压。

保留物料文件名和相对目录。文件不能跨出所属资产目录。
不要自动删除 CDN 历史版本。旧客户端可能仍然引用旧 manifest。

## 外部状态与临时文件

SQLite 是同步账本，不是项目资产。它保存：

- 已处理的资产描述和文件清单指纹。
- 已校验的上传映射。
- 上次成功同步时间。
- 本地直传资产的来源记录。

不要将账本放入仓库，也不要将它当作临时文件删除。
删除账本会丢失增量检查点和本地发布记录。

`tmp/run-*` 保存当前物料临时文件和工作文件。
`tmp/catalog-*` 保存目录构建产物。
脚本持有状态目录锁后，才清理自己创建的崩溃遗留目录。
本地上传线程使用独立检查点，保存在 `local-workers/` 下。
这些检查点不保存长期物料副本。

## 项目接入

发布流程更新项目的 catalog URL 配置。
这不等于宿主已经配置并创建 RetrievalClient。
目标项目尚未读取 `catalog.json` 时，明确报告需要接入宿主。
不要将配置更新报告为运行时召回已经启用。
