# 测试说明与验证边界

日期：2026-10-26（Asia/Shanghai）。Node 24.22.1，Windows，Edge 无头浏览器，真实本地 D1/SQLite。

## 当前结果

- 自动化测试：94 项通过、0 失败。原始 JUnit：[unit-results.xml](validation/unit-results.xml)。
- TypeScript：`tsc --noEmit` 通过。
- Vinext：生产构建通过；部署产物的 Worker scheduled 入口通过 Miniflare 直接调用验证，返回 ok 并写入 cloudflare-cron 心跳，见 [worker-scheduled.json](validation/worker-scheduled.json)。
- 浏览器：9 个操作场景通过、0 页面脚本错误。报告额外包含 1 条后台执行证据，不能将该证据另算一次操作测试。见 [browser-results.json](validation/browser-results.json)。
- 真实公开行情：实际请求成功，来源时间为上一交易日，规则正确返回未知；见 [data-probe.json](validation/data-probe.json)。
- 一键启动：本地迁移检查成功，Web 与独立调度器启动，实际观察多轮后台执行。

## 覆盖范围

| 测试文件 | 验证重点 |
|---|---|
| rules.test.mjs | 白名单、阈值边界、三值逻辑、来源与新鲜度、事件回看、日历、北京时间时段 |
| agent.test.mjs | 明确输入、歧义澄清、不支持指标、模型契约、结构校验、失败降级、能力边界 |
| gemini.test.mjs | Gemini 原生请求、额度与鉴权失败、超时、截断、澄清及密钥隔离 |
| model-worker.test.mjs | 真实 workerd 构造模型请求；跨提供方拒绝重定向与密钥转发 |
| providers.test.mjs | 行情字段、来源时间、状态错误、中继配置与服务端鉴权 |
| fuyao.test.mjs | 直连鉴权、业务错误码、空最新价、指数接口、日历有效期、后台证据与密钥隔离 |
| engine.test.mjs | 命中、去重、冷却、恢复、暂停、版本、后台领取、事务、并发、租约接管、重启与隔离 |
| api.test.mjs | 确认启用、主链路、证据、通知、浏览器空间隔离、跨站写入、调度鉴权、无效请求 |

浏览器验收：

1. 页面加载，载入隔离演示任务。
2. 自然语言生成草案，修改参数，验证未确认不能启用。
3. 立即检查和持续命中去重。
4. 注入数据过期，查看未知结果、解释与原始快照。
5. 编辑规则生成 v2，保留 v1。
6. 暂停禁止检查，恢复重新可执行。
7. 提醒中心标为已读。
8. 390px 手机布局与任务搜索，检查整页无水平溢出；表格允许内部横向滑动。
9. 关闭浏览器后，独立 Node 调度进程执行，并通过 HTTP 回读数据库中的 scheduled 执行记录。

截图：[桌面总览](images/overview-desktop.png)、[过期证据](images/stale-evidence.png)、[手机总览](images/overview-mobile.png)。截图中的数据为演示数据。

扶摇增量验收：股票快照和交易日历已真实请求；最新成交价盘前为空时正确显示未知。`scripts/fuyao-browser-qa.mjs` 验证来源选择、任务创建、真实检查、原始证据、连接检查及手机布局，不调用规则编译模型。真实结果见 validation/fuyao-adapter-live.json、validation/fuyao-calendar-probe.json、validation/fuyao-browser-results.json；截图见 images/fuyao-data-status.png。

## 复现

```sh
npm ci
npm test
npm run typecheck
npm run build
node scripts/check-worker-scheduled.mjs
npm run dev:all
```

浏览器模块可用后，在另一个终端设置可选的 PLAYWRIGHT_IMPORT、BROWSER_EXECUTABLE，再运行 `node scripts/browser-qa.mjs`。默认连接 5173；RADAR_ORIGIN 可覆盖。脚本会创建测试任务，不接真实交易账户。

仅探测公开行情：`node scripts/probe-data.mjs`，会更新 data-probe.json。该探测没有使用模型凭据或授权中继。

## 没有验证的内容

- OpenAI 真实模型调用与模型效果的大规模评估；Gemini 基础实调已通过，自动化模型测试仍使用模拟服务。
- iFinD、真实公告／热度及未接入的数据权限；扶摇价格与当日日历已实调通过，中继测试使用契约响应，不代表全部权限可用。
- 正式商业数据许可、大规模负载、长期运行、跨区域故障和高可用。
- 在源配置中声明 cron 不代表目标托管平台已启用；部署记录单独区分本地、云端和未验证能力。

## 缺陷修复原则

发现失败后先定位规则、持久化或操作时序问题，修复后运行受影响测试；不通过放宽断言掩盖功能错误。浏览器版本测试使用等待新版本出现以处理正常异步刷新；未删除对旧版本保留的断言。
