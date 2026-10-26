# 风险雷达 · 投资监控 Agent

将自然语言投资关注转换为可检查、可修改的规则，经用户确认后在后台持续检查，并解释为什么触发、未触发、被去重／冷却，或因为数据不足无法判断。

面向有明确标的及关注条件的个人投资者。它是监控与提醒工具，不执行交易。

## 当前交付

- React 工作台：总览、自然语言创建与结构化编辑、任务详情、执行证据、规则版本、操作日志、提醒中心、运行与数据、使用指南。
- 服务端：任务与用户空间、统一条件模型、持久化数据库、调度、租约、通知、异常降级。
- 条件：价格、公告关键词、绝对日历时间、热度，支持单层 AND／OR。
- 验证：自动化测试、类型检查、可部署构建、Edge 桌面／手机浏览器验收、关闭浏览器后的独立后台执行。

本轮对应用户指定的第 1–9 步；视频与正式对外提交尚未制作。Gemini 与扶摇价格／交易日历已在本地和线上实调通过；iFinD已接入价格、公告语义检索与手动新闻／热点查询；同花顺热榜已接入，原始热度只展示，不应声称已具备全部生产数据能力。

## 快速启动

要求 Node.js 24、npm。首次安装：

```sh
npm ci
npm run dev:all
```

打开终端输出的 `http://127.0.0.1:5173`。`dev:all` 自动应用本地 D1 迁移、启动 Web 服务和独立调度进程；每 15 秒轮询到期任务。首次自动生成的调度密钥保存在被 Git 忽略的 `.dev.vars`，不输出密钥内容。Ctrl+C 停止本地服务。

当前 Windows 工作区也可运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

此脚本优先使用系统 Node，找不到时尝试当前 Codex 运行时。克隆到其他电脑仍推荐安装标准 Node.js 24。

仅开发界面/API：`npm run dev`。这不会自动启用独立 Node 调度器，不能以打开网页替代后台执行。

## 首次体验

1. 点击“载入演示任务”，创建三个明确标注的演示监控，看到触发、提醒及数据过期状态。
2. 点击“创建监控”，输入“茅台价格低于 1400 元，每 5 分钟检查，冷却 30 分钟”。
3. 查看 Agent 过程，核对并修改规则，勾选确认后启用。
4. 在详情点击“立即检查”，展开执行记录，查看数据来源、时间、实际值、阈值与原始快照。
5. 重复检查验证去重；切换演示场景验证恢复、过期、冲突、接口超时与字段缺失。
6. 编辑规则生成新版本，查看历史；暂停／恢复任务，检查提醒中心。

演示场景的数值与公告均为模拟，不能据此判断真实市场。

## AI 角色与配置

Agent 负责标的核对、草案编译、缺失信息澄清和规则校验；不直接启用任务、不执行买卖。周期检查使用确定性代码，判断和通知不会依赖大模型临场决策。

模型只在生成规则草案时调用，不参与定时阈值计算。当前部署已接入 Gemini；未配置凭据的环境启用受限本地中文解析器，页面和 trace 明确披露。该解析器只支持少量清晰模式，复杂表达要求澄清或使用编辑器。

如已有自己的模型访问权限，将以下字段配置在本地 `.dev.vars` 或部署平台服务端密钥中：

```dotenv
MODEL_API_KEY=<your-server-side-key>
MODEL_NAME=<your-accessible-structured-output-model>
```

服务端支持 Gemini 原生 generateContent 与 OpenAI Responses 两种结构化输出适配，输出再次校验。Gemini 免费层配置见 [接入说明](docs/GEMINI_SETUP.md)，推荐使用自己的免费项目 key：

```dotenv
MODEL_PROVIDER=gemini
GEMINI_API_KEY=<your-server-side-key>
GEMINI_MODEL=gemini-3.1-flash-lite
```

保留原 OpenAI 配置时需显式设置 MODEL_PROVIDER=openai。Gemini 出错不会自动切换提供方或升级付费；额度与计费取决于 Google 项目。真实模型测试尚需有效凭据；模拟接口测试不代表真实模型准确率。修改环境后重启本地服务；生产环境需要重新部署以应用。

## 数据使用

| 来源 | 能力与状态 |
|---|---|
| 内置演示 | 支持全部条件和异常场景，始终标注 simulated |
| 腾讯公开行情 | 实验价格接口，已真实探测；无 SLA，过期数据不触发正常判断 |
| 扶摇直连 | FUYAO_API_KEY；已实现股票／指数行情、同花顺热榜和交易日历，首轮权限验证成功；盘前最新价可能为空 |
| 全球行情 | Yahoo 实验来源支持价格与窗口高点回撤；可能延迟，无 SLA。 |
| iFinD MCP | IFIND_MCP_API_KEY；股票／指数价格、公告关键词监控、手动公告／新闻／热点查询；非完整公告覆盖；组合热榜时由扶摇提供 |
| 交易日历 | trading 模式使用扶摇日历或 Yahoo 交易时段；缺少、失败或过期时降级为未知 |

扶摇配置与字段口径见 [直连说明](docs/FUYAO_SETUP.md)。热度使用[同花顺热榜](docs/HEAT_SETUP.md)：支持上榜、排名、排名变化和趋势；取消原始热度值阈值；日历条件是用户指定的绝对时间，不代表自动获取财报日程。iFinD配置见 [MCP直连说明](docs/IFIND_SETUP.md)。详见 [数据契约](docs/DATA_CONTRACT.md)。

## 可靠性与版本

- active／paused 是任务生命周期；pending／healthy／degraded 是健康度；条件结果单独记录。
- 数据过期、冲突、缺失、无来源、请求失败产生未知，保留解释和快照。组合条件使用三值逻辑。
- 同一轮价格持续命中只通知一次；同公告按稳定事件 ID 去重；冷却期保留命中但抑制通知。
- 暂停恢复保留去重和冷却；新规则版本明确重置相关状态，历史执行仍关联原版本。
- 租约、revision、请求幂等键、通知唯一键及事务保护并发；过期执行者不能提交旧结果。
- 持久化 nextRunAt 与状态，进程重启后恢复到期检查；失败退避最长 15 分钟。

详见 [架构](docs/ARCHITECTURE.md)。

## 测试与构建

```sh
npm test
npm run typecheck
npm run build
node scripts/probe-data.mjs
```

浏览器验收需安装 Playwright 并准备浏览器。项目未把浏览器二进制打包进依赖：

```sh
npm exec --package=playwright -- playwright install chromium
```

将 `PLAYWRIGHT_IMPORT` 设置为可导入的 Playwright 模块路径（或在本机安装 Playwright），可选设置 `BROWSER_EXECUTABLE`，服务启动后执行 `node scripts/browser-qa.mjs`。脚本不需要模型 key，会创建隔离的演示任务。测试说明和真实验证范围见 [TESTING.md](docs/TESTING.md)。

## 部署

托管源码使用 Sites Vinext starter 与 `sites()` 构建集成；`.openai/hosting.json` 声明 D1 的 `DB` 绑定。迁移在 `drizzle/`，部署时必须先应用。实际站点和验证状态见 [DEPLOYMENT.md](docs/DEPLOYMENT.md)。不要直接将本地占位数据库 ID 用于生产。

提供两种后台执行入口：Worker `scheduled` 与密钥保护的 `POST /api/radar/tick`。源配置包含每分钟 cron；部署后必须观察心跳或调度记录，不能只凭配置认定云端调度已启用。Node 调度器可部署为独立常驻进程，请使用平台进程管理器维持运行。

当前所有者私有 Sites 还支持平台访问保护的 service-tick，由关联云端任务每小时轮询。该入口只在已验证私有边界后启用；对外分享前须关闭或补充独立服务鉴权，详见 [云端约定](docs/CLOUD_UPDATES.md)。本地轮询更细；界面配置间隔不构成云端秒级检查承诺。

独立 HTTP 调度需在目标应用与调度器中配置相同的 `SCHEDULER_SECRET`（至少 32 字符），并设置 `RADAR_ORIGIN`。本地 `.env.scheduler` 仅用于手动运行 `npm run scheduler`；勿提交实际值。

## 目录与交付材料

```text
app/                  React 页面和 API 路由
components/           可编辑规则窗口
core/                 规则、Agent、数据适配、存储和执行引擎
db/ + drizzle/        D1 schema 与生成迁移
worker/               Worker fetch / scheduled 入口
scripts/              一键开发、独立调度、数据探测及浏览器验收
tests/                自动化验收
docs/                 需求映射、架构、数据契约、AI 记录、测试与部署状态
docs/validation/      实际测试报告和数据探测
outputs/qa/           本地浏览器截图（不提交运行时状态）
```

## 已知边界与未做事项

支持名称／代码搜索并核实已接入标的、最多八个单层条件、每空间五十个任务；本地演示 cookie 隔离不是完整账号系统。仅站内提醒，无短信邮件或自动交易。没有真实模型效果评估、授权数据联调、大规模压力测试或高可用保证。版本修改后可能重新通知同一仍满足条件，界面会要求确认。

更多限制和逐项验收入口见 [需求映射](docs/REQUIREMENTS.md)，开发 AI 记录见 [AI_USAGE.md](docs/AI_USAGE.md)。
