# 项目中的 iFinD MCP

本项目在服务端直接使用官方远程MCP；不依赖用户浏览器、Codex会话或全局安装Skill。依据官方[接入指南](https://mcp.51ifind.com/gwstatic/static/ds_web/ifind-mcp-web/skills/SKILL_INSTALL_GUIDE.md)及其1.5.0包中的call-node.js与工具说明实现。

密钥放在被Git忽略的 `.dev.vars`：`IFIND_MCP_API_KEY=真实密钥`。发布环境使用同名secret。禁止放进前端、Git、任务JSON或模型提示词。

连接固定官方站点HTTPS网关 `https://mcp.51ifind.com/ds-mcp-servers/`（官方包原入口api-mcp:8643在Workers出现530／超时；官网443入口已用相同密钥、会话协议和工具验证），只开放stock、index、news三个服务。按官方要求使用裸Authorization Token、initialize、notifications/initialized、Mcp-Session-Id及tools/call，兼容JSON和SSE结果。重定向不跟随，错误不回传上游正文，响应最多512KiB，单次网络请求12秒、单轮MCP取数40秒预算；同一Worker实例同时最多2个MCP请求。跨实例并发不作保证，429进入既有退避机制，不自动切换模拟或付费来源。

## 已接入能力

- `stock_highfreq_quotes`、`index_highfreq_quotes`：读取实际证券代码、time和最新价，字段为空、错标的、重复、过期或无时间时无法判断，不以抓取时间替代time。
- `search_notice`：公告关键词监控，检索标题与相关片段，保留查询日期、来源、公告日期和日期精度。摘要不是全文；上游没有原文链接或ID时不伪造，使用标的+公告日期+标题的SHA-256作本地稳定去重标识。
- `search_news`、`search_trending_news`：在“运行与数据 → iFinD MCP”手动检索公告、新闻和近24小时热门资讯。展示真实结果；返回日期超出范围的记录会过滤。
- 绝对时间日历提醒继续由任务引擎处理；交易时段日历继续使用扶摇。

语义检索不保证完整覆盖。没有检索到不能断言没有公告，所以监控结果为unknown；只有确认标的、关键词与回看窗口均匹配时才通知。公告仅提供日期时，如果回看窗口切入该日期，不能编造分钟级发布时间，结果仍为unknown。

热门资讯不等于“0–100热度指数”。目前没有已核实的数值热度字段，因此iFinD来源拒绝heat条件。演示热度仍明确标记模拟。

## 使用

1. 在“运行与数据”检查iFinD连接并手动查询。工具列表连接成功不代表所有账号权益已开放。
2. 创建规则时选择“iFinD MCP”，或输入“宁德时代出现回购公告时提醒，使用iFinD，每5分钟检查”。
3. 先试算草案、检查来源及条件，再确认启用。历史演示任务不会自动改成真实数据。

Sites当前后台仍为每小时运行；MCP接入不改变调度频率。每5分钟执行需要常驻调度服务。手动查询会消耗账号额度。

## 验证

2026-10-26已用用户在本地配置的密钥完成真实initialize、工具列表、茅台价格、沪深300价格、公告与新闻检索。原始样本仅保留在被忽略的本地目录；无密钥进入源码。自动测试覆盖协议会话、HTTP/业务错误、重定向、响应上限、时间精度、空语义结果、多条件隔离、去重与后台执行。
