# 部署与运行记录

## 本地已验证

- 开发预览：`http://127.0.0.1:5173`，由 `npm run dev:all` 启动。
- D1 迁移、前端、API 与持久化操作均已实际运行。
- 独立 Node 调度器实际检查到期任务，关闭浏览器后仍可执行。
- `worker/index.ts` 提供 scheduled 入口；源配置与构建配置包含每分钟 cron。
- 构建产物 Worker scheduled 已由 Miniflare 直接调用，返回 ok 并成功写入 cloudflare-cron 心跳，见 validation/worker-scheduled.json。
- 当前 Wrangler 静态资源预览的 scheduled HTTP 测试入口返回异常；改用直接调用同一部署产物的 Miniflare 验证，未将失败入口冒充成功。
- 云端 cron 是否实际登记并触发，仍需部署后证据，不能与本地成功混为一谈。

## 托管目标

已注册所有者私有 Sites 项目，预期域名为 `https://risk-radar-agent-xjc.pinkstoat514.chatgpt.site`。该地址在平台确认部署成功前只是预期地址。

托管使用 D1 `DB` 绑定。源代码中不包含真实数据库 ID、模型 key、数据中继 token 或调度密钥。新站点维持所有者私有访问，不自动改为公开。

后续部署结果、版本及调度验证证据将写入本文或 validation/ 中。

## 自托管后台

如果目标平台未登记 Worker cron，使用独立 Node 调度器连接应用的 `/api/radar/tick`，为应用与调度器配置相同的 SCHEDULER_SECRET，生产环境需使用进程管理器或系统服务维持执行。只有网页前端不能承担持久后台调度。

应用需配置真实模型或授权中继时，修改服务端密钥并重新部署。页面“运行与数据”会区分未配置、已配置和近期心跳；“已配置”不等于已完成真实联调。
