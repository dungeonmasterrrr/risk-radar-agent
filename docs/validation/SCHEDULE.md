# 云端调度验证

2026-10-26（Asia/Shanghai）。

- 请求每 5 分钟调度时，平台返回：Tasks can't run more than 1 times per hour。该请求未创建任务。
- 已另行保存并启用每小时任务，时区 Asia/Shanghai。自动任务 ID：Automation_6a584437f7188191b7eb503c8f935d0d。
- 平台返回的日历规则：FREQ=HOURLY;INTERVAL=1。首次自动执行尚未观察，不将已保存等同于已运行。
- 所有者私有服务写入已人工验证：POST service-tick 后，持久化记录标记 scheduled=true，心跳 source=sites-cloud-task；见 hosted-results.json。这是入口就绪证明，不是自动周期证明。
- Node 本地常驻调度已实际运行多轮，每 15 秒轮询；浏览器关闭后的执行证据见 browser-results.json。
- UI 显示实际部署轮询周期。分钟级后台检查应使用本地常驻进程或部署到具备分钟级调度能力的服务器；当前云端预览受小时级限制。
