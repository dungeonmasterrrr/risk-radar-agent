# Gemini 免费层接入

## 申请与配置

1. 打开 [Google AI Studio API Keys](https://aistudio.google.com/apikey)，使用自己的 Google 账号登录。
2. 若首次使用需要接受条款，请自行阅读确认。已有默认项目和 key 时可直接使用；否则创建 key 并选择自己有权限的项目。
3. 要使用免费层，保持项目为 Free tier，不启用付费结算。key 本身不保证免费：实际配额、地区、模型权限及项目结算状态以 AI Studio 为准。
4. 把以下内容填入被 Git 忽略的 `.dev.vars`，保留已有调度配置：

```dotenv
MODEL_PROVIDER=gemini
GEMINI_API_KEY=替换为自己的key
GEMINI_MODEL=gemini-3.1-flash-lite
```

只填写 GEMINI_API_KEY 时也会优先选择 Gemini，使用上述默认模型。显式选择 Gemini 后，失败不会自动调用其他提供方或其他模型。

## 验证与费用边界

模型只在点击生成规则草案时调用，周期性监控仍使用确定性执行引擎。请求使用固定 Google 域名和 x-goog-api-key 请求头，不把 key 放在 URL、浏览器、源码或报告中；不进行自动重试，不启用联网搜索等附加工具。

免费额度耗尽、速率限制、key／地区权限错误、网络超时或输出无效会在 Agent 过程里显示原因，再降级为本地解析器。降级结果不会标成大模型成功。

配置后需重启本地服务。线上 key 必须另外写入托管平台的服务端 secret 并重新部署；本地文件不会自动上传。只有看到真实调用 mode=model、provider=gemini 且输出通过规则校验，才能认定联调成功。“已配置”只代表字段齐全。

默认模型 gemini-3.1-flash-lite 的官方页面列明支持结构化输出，价格页列出免费层输入／输出。免费层内容可能用于改进 Google 产品，演示请使用非敏感输入。账户限额需在 AI Studio 查看，不在代码中承诺固定每日次数。

## 当前验证状态

适配器和模拟服务测试已实现。创建 key、真实账号权限、真实模型效果及线上 key 配置仍需在拿到有效 key 后验证。本文件不代表已经申请或生成 key。

官方资料：[API keys](https://ai.google.dev/gemini-api/docs/api-key)、[模型说明](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)、[价格](https://ai.google.dev/gemini-api/docs/pricing)、[结构化输出](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)、[可用地区](https://ai.google.dev/gemini-api/docs/available-regions)。
