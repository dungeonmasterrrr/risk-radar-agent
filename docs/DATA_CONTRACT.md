# 数据接入契约

## 演示适配器

`provider=demo` 提供确定性价格、公告与热度。记录 `simulated=true`，界面显示演示标签。`match`／`clear` 根据当前阈值构造满足或恢复场景；`stale`、`conflict`、`failure`、`missing` 验证异常。数值、公告和时间均为模拟，不代表真实市场。

## 腾讯公开行情（实验）

只请求固定域名 `https://qt.gtimg.cn/q=<market><code>`，校验股票代码、价格格式和 14 位来源时间。使用 GB18030 解码；来源时间按北京时间解析。原始价格、代码和时间字段保存在执行证据中。

该公开接口无 SLA，字段可能改变、可能限流，未验证商业再分发许可。不能作为正式授权数据替代品。返回上一交易日数据时不将抓取时间视为行情时间，不自动放宽新鲜度要求。

## 扶摇直接接入

设置 FUYAO_API_KEY 后可直接访问扶摇股票／指数行情和交易日历，不需要部署中继。配置、字段口径与真实验证记录见 [FUYAO_SETUP.md](FUYAO_SETUP.md)。密钥已配置只说明字段齐全，权限和数据仍以实际请求为准。

## 其他授权数据中继（包括尚未接入的 iFinD）

如果另有授权服务，可实现下述标准化 HTTP 契约。它是可选适配入口，不是扶摇原生地址，也不等同于直接接入 iFinD。服务端配置：

```dotenv
DATA_RELAY_URL=https://your-authorized-service.example/snapshot
DATA_RELAY_TOKEN=<server-side-secret>
```

请求：`GET <DATA_RELAY_URL>?code=600519&market=SH`。如有 token，使用服务端 Authorization Bearer 头。该 URL 只能由服务端配置，访客不能提交任意 URL。

响应示例（示例数值不是真实行情）：

```json
{
  "tradingDay": true,
  "price": {
    "value": 1388,
    "currency": "CNY",
    "source": "授权数据产品及字段名",
    "url": "https://licensed-source.example/evidence/123",
    "observedAt": "2026-10-26T10:00:00+08:00",
    "conflict": false
  },
  "event": {
    "source": "授权公告数据产品",
    "observedAt": "2026-10-26T10:00:00+08:00",
    "items": [{
      "id": "globally-stable-announcement-id",
      "title": "关于回购的公告（契约示例）",
      "publishedAt": "2026-10-26T09:45:00+08:00",
      "url": "https://licensed-source.example/announcement/123"
    }]
  },
  "heat": {
    "value": 82,
    "metric": "明确说明统计口径、范围及单位",
    "source": "授权热度数据产品",
    "observedAt": "2026-10-26T10:00:00+08:00"
  }
}
```

- `observedAt` 是来源数据时间，不是本次中继请求的时间。应用另外记录 fetchedAt。
- 每类数据都必须有非空 source 与有效来源时间；缺失不参与正常判断。
- 事件 ID 必须稳定，不得每次请求重新生成；publishedAt 必须准确并带时区。空 items 表示成功查询但没有事件；接口失败应返回错误状态，不能用空列表掩盖。
- `conflict=true` 时记录 alternatives 等可追溯内容，规则返回未知，不选择冲突值。
- 允许每类数据返回 `{ "error": "可向用户展示的错误" }`，不要含 token、内部路径或敏感响应体。
- `tradingDay` 仅在请求日期匹配的授权交易日历下返回布尔值。真实 trading 模式缺少该值时降级；演示交易日历只用于演示。
- 缺少价格、事件或热度时，对应条件未知；纯用户日历提醒不依赖行情来源。
- 中继需自行处理许可、鉴权、缓存、限流、上游映射和响应大小控制。生产化前仍需完成与真实服务的联调。
