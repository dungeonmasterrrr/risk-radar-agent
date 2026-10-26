# 扶摇直连接入与验证

## 配置

在本地 `.dev.vars` 中设置 `FUYAO_API_KEY`，保留 Gemini 与调度配置。线上使用托管平台服务端 secret 单独配置；密钥不进入前端、源码或报告。

使用扶摇服务端直连。创建／编辑任务时选择“扶摇直连（价格与日历）”。旧演示任务保持原数据来源；如需改成真实来源，编辑、检查并确认新规则版本。

## 当前范围

- 股票价格：GET `/api/a-share/prices/snapshot`，使用完整 thscode。
- 沪深300：GET `/api/a-share-index/prices/snapshot`，避免将指数当股票请求。
- 交易日历：GET `/api/a-share/calendar/trading-days`，只在交易时段任务中读取，用于确认当天是否交易日。
- 绝对时间提醒仍是用户规则，不假装自动获取财报日程。
- 公告和热度没有在此次扶摇适配中实现，不接受这两类条件使用 fuyao 来源；可继续使用演示或另行授权接入。

接口使用固定 HTTPS 域名 `https://fuyao.aicubes.cn`，请求头 X-api-key；手动拒绝重定向。不自动重试或切换模拟数据，同时检查 HTTP 状态与业务 code。HTTP 200 中的 2001、2003、4001 等业务错误仍算失败。

## 数据口径

`last_price` 才是最新成交价。为空、非数值或非正值时返回未知，保留 prev_price 作为原始证据，但不把昨收当最新价。行情采用单标的请求，使用 data.timestamp 所表示的上游有效时间，另记 fetchedAt；不以抓取时间替代来源时间。保存 request_id 以便追溯。

交易日历为来源提供的近一年至今日固定窗口。要求有效日期行、北京时间午夜时间戳，以及覆盖今天的来源时间；列表为空、日期冲突或时间过期时，不将今天猜为非交易日。日历失败不抹去已经取得的价格证据，价格失败也不丢弃成功日历。

## 已实际验证

2026-10-26 盘前：用户 key 的股票快照和交易日历请求均返回 HTTP 200、code=0。交易日历共 242 条，包含 20261026；价格快照的 last_price 为 null、prev_price 为 1335。该盘前结果证明接口与权限可用，不能声称已经获得有效盘中最新价或触发了真实价格告警。

原始首轮记录保存在 outputs/fuyao-first-probe.json 与 outputs/fuyao-calendar-probe.json。应用适配后的本地与线上验证另保存为 outputs/fuyao-adapter-live.json、outputs/fuyao-online-check.json。

线上追加验证通过：配置读取、行情与日历连接、Gemini 生成扶摇来源草案、任务执行及持久化证据共四项。检查后暂停了验收任务。报告副本见 validation/fuyao-online-check.json。

## 官方文档

[快速开始](https://fuyao.aicubes.cn/docs/quickstart/)、[行情](https://fuyao.aicubes.cn/docs/api-reference/prices/)、[交易日历](https://fuyao.aicubes.cn/docs/api-reference/calendar/)、[完整聚合文档](https://fuyao.aicubes.cn/llms-full.txt)。权限、数据可用性和限流以平台与每次响应为准。
