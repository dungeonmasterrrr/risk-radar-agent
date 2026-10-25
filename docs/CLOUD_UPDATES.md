# 云端后台更新约定

适用范围：本站已由 Sites 验证为仅所有者可访问的私有站点，且服务端 PRIVATE_SERVICE_UPDATES=true。该入口依赖平台访问边界，不应在公开或共享站点启用。变更受众前应关闭该环境开关并重新部署，或增加独立服务鉴权。

每轮只执行：

1. 读取当前链接站点的 get_site，确认仍为 owner-only；如果已共享或公开，停止后台调用并报告，不修改访问策略。
2. 使用 get_site 返回的服务访问凭据，通过 OAI-Sites-Authorization Bearer 头访问同一站点；凭据只保存在当前运行内存，不写入源文件、提示词、日志或报告，不跟随跨域重定向。
3. 对当前站点 `POST /api/radar/service-tick`，Content-Type 为 application/json，body 为 `{}`。服务器自行领取到期任务、取数、判断、去重和通知；不要替模型解释或更改规则。
4. 读取 `GET /api/radar/config`，确认 heartbeat.source 为 sites-cloud-task 且时间已更新。必要时通过 Sites 的数据库概览及 system 表回读。
5. 若请求失败，仅报告失败；服务器租约和幂等策略处理重复执行，不重新创建任务、不发布新版本、不改变用户规则。

定时轮询为每 5 分钟（Asia/Shanghai）。本轮人工调用验证只证明写入入口可用；只有观察到自动任务实际执行，才能声称自动周期已经运行。
