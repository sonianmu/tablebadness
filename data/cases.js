/* Representative test set. set: 'dev' (used while designing) | 'val' (held out; written before tuning, never used to tune).
 * tags: scripts / content types present. lang: the table's lang attribute. */
window.TB_CASES = [
// =============================== DEV =====================================
{ id:'zh-project', set:'dev', lang:'zh-CN', tags:['zh','short-vs-long','repeated'], title:'中文 · 项目任务跟踪', md:`
| 编号 | 负责人 | 状态 | 截止日期 | 说明 |
|---|---|---|---|---|
| F-12 | 王磊 | 进行中 | 2024-03-15 | 完成支付模块的接口联调，需要与风控团队确认异常订单的回滚策略，并补充单元测试。 |
| F-13 | 李娜 | 已完成 | 2024-03-08 | 首页改版上线 |
| F-14 | 张伟 | 阻塞 | 2024-03-20 | 等待第三方物流平台提供新的签名算法文档，目前沙箱环境无法通过鉴权。 |
| F-15 | 王磊 | 进行中 | 2024-03-22 | 优化商品搜索的分词与排序逻辑，重点解决同义词召回不足的问题。 |
| F-16 | 陈静 | 未开始 | 2024-04-01 | 用户反馈中心的工单自动分派规则设计。 |
| F-17 | 李娜 | 已完成 | 2024-03-02 | 修复安卓端在低内存设备上偶发的白屏问题。 |
`},
{ id:'zh-api', set:'dev', lang:'zh-CN', tags:['zh','code','mixed'], title:'中文 · API 参数说明', md:`
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| \`user_id\` | \`string\` | 是 | — | 用户的唯一标识，由注册接口返回，长度固定为 24 位。 |
| \`page_size\` | \`int\` | 否 | \`20\` | 每页返回的记录条数，取值范围为 1 到 100，超出范围时按边界值处理。 |
| \`sort\` | \`enum\` | 否 | \`created_at\` | 排序字段，可选 \`created_at\`、\`updated_at\` 或 \`score\`。 |
| \`include_deleted\` | \`bool\` | 否 | \`false\` | 是否返回已软删除的数据，仅管理员令牌有效。 |
| \`callback_url\` | \`string\` | 否 | — | 异步任务完成后回调的地址，必须为 HTTPS 协议。 |
`},
{ id:'zh-finance', set:'dev', lang:'zh-CN', tags:['zh','numeric'], title:'中文 · 财务指标', md:`
| 指标 | 2022 年 | 2023 年 | 2024 年 | 同比 | 备注 |
|---|--:|--:|--:|--:|---|
| 营业收入（亿元） | 128.4 | 152.7 | 181.3 | +18.7% | 海外业务贡献主要增量 |
| 毛利率 | 34.2% | 35.8% | 37.1% | +1.3pp | 原材料价格回落 |
| 研发投入（亿元） | 15.6 | 19.2 | 24.8 | +29.2% | 新增两个研发中心，人员规模扩大约四成 |
| 经营性现金流（亿元） | 21.3 | 18.9 | 30.4 | +60.8% | 应收账款周转天数由 74 天降至 58 天 |
| 资产负债率 | 52.1% | 49.6% | 47.3% | −2.3pp | — |
`},
{ id:'zh-product', set:'dev', lang:'zh-CN', tags:['zh','numeric','short-vs-long'], title:'中文 · 产品对比', md:`
| 型号 | 价格 | 屏幕 | 续航 | 重量 | 评价 |
|---|--:|---|---|--:|---|
| 星河 X1 | ¥3,999 | 6.7 英寸 OLED | 约 1.5 天 | 198 g | 影像系统出色，夜景表现稳定，但机身偏重，单手操作略显吃力。 |
| 星河 X1 Pro | ¥5,499 | 6.8 英寸 LTPO | 约 1.8 天 | 221 g | 长焦镜头带来明显提升，适合经常拍摄演出和体育赛事的用户。 |
| 青柠 Air | ¥2,299 | 6.1 英寸 LCD | 约 1 天 | 172 g | 轻薄便携，日常使用流畅。 |
| 青柠 Max | ¥2,999 | 6.9 英寸 OLED | 约 2 天 | 215 g | 大电池是最大卖点，重度游戏场景下发热控制一般。 |
`},
{ id:'zh-medical', set:'dev', lang:'zh-CN', tags:['zh','short-vs-long'], title:'中文 · 用药说明', md:`
| 药品名称 | 规格 | 用法用量 | 频次 | 注意事项 |
|---|---|---|---|---|
| 阿莫西林胶囊 | 0.25 g × 24 粒 | 口服，一次 2 粒 | 每日 3 次 | 青霉素过敏者禁用；用药期间如出现皮疹、腹泻等症状，应立即停药并就医。 |
| 布洛芬缓释胶囊 | 0.3 g × 20 粒 | 口服，一次 1 粒 | 每日 2 次 | 不宜空腹服用；连续使用不超过 5 天。 |
| 奥美拉唑肠溶片 | 20 mg × 14 片 | 晨起空腹吞服 | 每日 1 次 | 不可咀嚼或压碎；长期服用需定期复查。 |
| 维生素 D3 滴剂 | 400 IU × 30 粒 | 滴入口中 | 每日 1 次 | 与钙剂同服效果更佳。 |
`},
{ id:'zh-changelog', set:'dev', lang:'zh-CN', tags:['zh','en','mixed','code'], title:'中文 · 版本更新日志（中英混排）', md:`
| 版本 | 日期 | 类型 | 变更内容 |
|---|---|---|---|
| v2.3.1 | 2024-05-12 | 修复 | 修复 WebSocket 断线重连后消息重复推送的问题（#1842）。 |
| v2.3.0 | 2024-05-02 | 新功能 | 新增基于 OAuth 2.0 的第三方登录，支持 GitHub、Google 与企业微信；新增 \`--dry-run\` 参数。 |
| v2.2.4 | 2024-04-18 | 性能 | 将冷启动时间从 2.4s 降低到 1.1s，主要通过延迟加载 i18n 资源实现。 |
| v2.2.3 | 2024-04-09 | 安全 | 升级 OpenSSL 至 3.0.13，修复 CVE-2024-0727。 |
`},
{ id:'en-api', set:'dev', lang:'en', tags:['en','code'], title:'EN · REST endpoints', md:`
| Endpoint | Method | Auth | Rate limit | Description |
|---|---|---|---|---|
| \`/api/v1/users/{id}\` | GET | Bearer | 600/min | Returns the public profile of a user, including display name, avatar URL and account creation date. |
| \`/api/v1/users\` | POST | Admin | 60/min | Creates a new user. Email addresses must be verified before the account becomes active. |
| \`/api/v1/sessions\` | DELETE | Bearer | 120/min | Revokes the current session token. |
| \`/api/v1/exports/{jobId}/download\` | GET | Bearer | 10/min | Streams a finished export as a gzip-compressed CSV file; returns 409 if the job is still running. |
`},
{ id:'en-pricing', set:'dev', lang:'en', tags:['en','short-vs-long'], title:'EN · Plan comparison', md:`
| Feature | Free | Pro | Enterprise | Notes |
|---|:-:|:-:|:-:|---|
| Projects | 3 | Unlimited | Unlimited | Archived projects do not count toward the limit. |
| Storage | 2 GB | 100 GB | Custom | Additional storage can be purchased in 50 GB blocks. |
| SSO / SAML | — | — | ✓ | Supports Okta, Azure AD and any SAML 2.0 identity provider. |
| Audit log | — | 30 days | 1 year | |
| Support | Community | Email | 24/7 phone & dedicated manager | Response time targets are defined in the SLA. |
`},
{ id:'en-bugs', set:'dev', lang:'en', tags:['en','repeated'], title:'EN · Issue tracker', md:`
| ID | Title | Severity | Assignee | Status | Updated |
|---|---|---|---|---|---|
| BUG-2041 | Checkout button unresponsive on Safari 17 | Critical | m.garcia | In progress | 2024-06-02 |
| BUG-2038 | Typo in password reset email | Low | j.chen | Done | 2024-05-30 |
| BUG-2035 | Dashboard charts render blank when timezone is UTC+13 | High | m.garcia | In review | 2024-06-01 |
| BUG-2031 | CSV export drops rows containing emoji | High | a.okafor | In progress | 2024-05-28 |
| BUG-2029 | Tooltip overlaps dropdown | Low | j.chen | Backlog | 2024-05-20 |
| BUG-2027 | Memory leak in long-running notification worker | Critical | a.okafor | In review | 2024-05-31 |
`},
{ id:'ja-schedule', set:'dev', lang:'ja', tags:['ja'], title:'日本語 · カンファレンス日程', md:`
| 日付 | 時間 | 会場 | 内容 |
|---|---|---|---|
| 6月12日（水） | 10:00–11:30 | 大ホール | 基調講演：生成AI時代のソフトウェア開発と品質保証のこれから |
| 6月12日（水） | 13:00–14:00 | 会議室B | 「型」から考えるフロントエンド設計。大規模なコードベースを段階的に移行した事例を紹介します。 |
| 6月13日（木） | 09:30–10:30 | 会議室A | パネルディスカッション |
| 6月13日（木） | 15:00–17:00 | 展示ホール | ハンズオン：ローカル環境で動かす検索拡張生成（RAG）入門。ノートPCをご持参ください。 |
`},
{ id:'ko-menu', set:'dev', lang:'ko', tags:['ko'], title:'한국어 · 메뉴', md:`
| 메뉴 | 가격 | 맵기 | 설명 |
|---|--:|---|---|
| 김치찌개 | 9,000원 | 보통 | 직접 담근 묵은지와 돼지고기 앞다리살을 넣고 푹 끓여 깊은 맛이 납니다. |
| 된장찌개 | 8,500원 | 순함 | 국산 콩으로 만든 된장을 사용합니다. |
| 제육볶음 | 11,000원 | 매움 | 고추장 양념에 하루 동안 재운 돼지고기를 센 불에 빠르게 볶아 냅니다. |
| 비빔밥 | 10,000원 | 순함 | 제철 나물 다섯 가지와 달걀 프라이가 올라갑니다. |
`},
{ id:'ar-products', set:'dev', lang:'ar', tags:['ar','rtl','numeric'], title:'العربية · المنتجات', md:`
| المنتج | السعر | المخزون | الوصف |
|---|---|---|---|
| حاسوب محمول | 3,200 ر.س | 14 | جهاز خفيف الوزن مع بطارية تدوم حتى اثنتي عشرة ساعة وشاشة عالية الدقة. |
| سماعات لاسلكية | 450 ر.س | 87 | عزل نشط للضوضاء. |
| شاشة 27 بوصة | 1,150 ر.س | 23 | دقة 4K مع دعم كامل لنطاق الألوان الواسع، مناسبة لأعمال التصميم والتحرير. |
| لوحة مفاتيح | 280 ر.س | 0 | غير متوفر حاليًا |
`},
{ id:'he-schedule', set:'dev', lang:'he', tags:['he','rtl'], title:'עברית · לוח זמנים', md:`
| יום | שעה | נושא | הערות |
|---|---|---|---|
| ראשון | 09:00 | פגישת צוות שבועית | יש להכין עדכון קצר על התקדמות הפרויקט ועל חסמים פתוחים. |
| שני | 14:30 | סקירת עיצוב | |
| רביעי | 11:00 | הדרכה על מערכת ההרשאות החדשה | ההדרכה תוקלט ותישלח לכל העובדים שלא יוכלו להשתתף. |
`},
{ id:'hi-schemes', set:'dev', lang:'hi', tags:['hi'], title:'हिन्दी · योजनाएँ', md:`
| योजना | शुरुआत | लाभार्थी | विवरण |
|---|---|---|---|
| प्रधानमंत्री आवास योजना | 2015 | 3 करोड़+ | शहरी और ग्रामीण क्षेत्रों में गरीब परिवारों को पक्का मकान उपलब्ध कराने के लिए वित्तीय सहायता। |
| जन धन योजना | 2014 | 50 करोड़+ | बैंक खाता खोलने की सुविधा। |
| आयुष्मान भारत | 2018 | 55 करोड़+ | प्रति परिवार प्रति वर्ष पाँच लाख रुपये तक का स्वास्थ्य बीमा कवर। |
`},
{ id:'th-travel', set:'dev', lang:'th', tags:['th'], title:'ไทย · สถานที่ท่องเที่ยว', md:`
| สถานที่ | จังหวัด | ค่าเข้าชม | รายละเอียด |
|---|---|---|---|
| วัดพระแก้ว | กรุงเทพฯ | 500 บาท | วัดที่สำคัญที่สุดในประเทศไทยตั้งอยู่ในบริเวณพระบรมมหาราชวังควรแต่งกายสุภาพ |
| ดอยสุเทพ | เชียงใหม่ | 30 บาท | วิวเมืองเชียงใหม่สวยงาม |
| อุทยานแห่งชาติเขาใหญ่ | นครราชสีมา | 400 บาท | ผืนป่ามรดกโลกที่มีสัตว์ป่าหลากหลายชนิดเหมาะสำหรับการเดินป่าและดูนก |
`},
{ id:'emoji-status', set:'dev', lang:'zh-CN', tags:['emoji','zh','en','repeated'], title:'Emoji · 服务状态', md:`
| 服务 | 状态 | 可用率 | 最近事件 |
|---|---|--:|---|
| API Gateway | ✅ 正常 | 99.99% | — |
| 支付服务 | ⚠️ 降级 | 99.12% | 03:12 起部分银行卡渠道响应变慢，已切换至备用通道 🔁 |
| 消息推送 | ✅ 正常 | 99.97% | 👨‍👩‍👧‍👦 家庭共享通知已恢复 |
| 对象存储 | ❌ 故障 | 97.40% | 华东 2 可用区磁盘阵列异常，工程师正在处理 🛠️ |
| CDN | ✅ 正常 | 99.99% | 🇨🇳 🇯🇵 🇺🇸 节点全部在线 |
`},
{ id:'code-config', set:'dev', lang:'en', tags:['code','en','extreme'], title:'Code · Config options with long tokens', md:`
| Option | Default | Example | Description |
|---|---|---|---|
| \`server.port\` | \`8080\` | \`9000\` | TCP port the HTTP server listens on. |
| \`db.url\` | — | \`postgres://app:secret@db.internal.example.com:5432/production_main\` | Connection string for the primary database. |
| \`log.pattern\` | \`%d{ISO8601} %-5level %logger{36} - %msg%n\` | — | Logback pattern used for console output. |
| \`cache.ttlSeconds\` | \`300\` | \`3600\` | Expiration time for cached responses; set to 0 to disable caching entirely. |
| \`auth.jwksUri\` | — | https://login.example.com/.well-known/openid-configuration/jwks.json | Where public signing keys are fetched from. |
`},
{ id:'formula', set:'dev', lang:'zh-CN', tags:['zh','formula','mixed'], title:'公式文本 · 物理量', md:`
| 物理量 | 符号 | 公式 | 单位 | 说明 |
|---|---|---|---|---|
| 动能 | Eₖ | Eₖ = ½mv² | J | 物体由于运动而具有的能量。 |
| 万有引力 | F | F = G·m₁m₂/r² | N | G ≈ 6.674×10⁻¹¹ N·m²/kg² |
| 理想气体状态方程 | — | pV = nRT | — | R 为摩尔气体常数，约 8.314 J/(mol·K)。 |
| 质能关系 | E | E = mc² | J | 静止质量对应的能量。 |
`},
{ id:'glossary-multi', set:'dev', lang:'en', tags:['mixed','zh','ja','ko','ar','en'], title:'Mixed · Multilingual glossary', md:`
| English | 中文 | 日本語 | 한국어 | العربية |
|---|---|---|---|---|
| Table | 表格 | 表 | 표 | جدول |
| Line break | 换行 | 改行 | 줄 바꿈 | فاصل الأسطر |
| Readability | 可读性 | 可読性 | 가독성 | سهولة القراءة |
| Horizontal scrolling | 横向滚动 | 横スクロール | 가로 스크롤 | التمرير الأفقي |
| Column width allocation | 列宽分配 | 列幅の割り当て | 열 너비 할당 | توزيع عرض الأعمدة |
`},
{ id:'outlier', set:'dev', lang:'zh-CN', tags:['zh','outlier','repeated'], title:'异常长值 · 标签列中的一个长值', md:`
| 城市 | 级别 | 人口（万） | 备注 |
|---|---|--:|---|
| 北京 | 一线 | 2,185 | 首都 |
| 上海 | 一线 | 2,487 | 经济中心 |
| 杭州 | 新一线 | 1,252 | — |
| 成都 | 新一线 | 2,140 | — |
| 克孜勒苏柯尔克孜自治州阿图什市 | 县级市（自治州首府，行政区划调整后统计口径变化） | 31 | 数据来自第七次全国人口普查 |
| 苏州 | 新一线 | 1,295 | — |
`},
{ id:'long-headers', set:'dev', lang:'en', tags:['en','header'], title:'EN · Long headers, short data', md:`
| Region | Quarterly revenue (USD, millions) | Year-over-year growth rate | Number of active enterprise customers | Net promoter score |
|---|--:|--:|--:|--:|
| NA | 412.5 | 12% | 1,204 | 61 |
| EMEA | 287.1 | 9% | 986 | 58 |
| APAC | 198.4 | 21% | 640 | 64 |
| LATAM | 54.0 | 17% | 133 | 55 |
`},
{ id:'wide-numeric', set:'dev', lang:'zh-CN', tags:['zh','numeric','many-cols'], title:'多列数值 · 8 列', md:`
| 日期 | 开盘 | 最高 | 最低 | 收盘 | 涨跌幅 | 成交量（手） | 成交额（万元） |
|---|--:|--:|--:|--:|--:|--:|--:|
| 2024-06-03 | 12.45 | 12.88 | 12.30 | 12.79 | +2.73% | 1,284,560 | 162,318.42 |
| 2024-06-04 | 12.80 | 12.95 | 12.51 | 12.60 | −1.49% | 987,112 | 125,004.07 |
| 2024-06-05 | 12.58 | 12.62 | 12.01 | 12.07 | −4.21% | 2,045,773 | 249,880.15 |
| 2024-06-06 | 12.10 | 12.47 | 12.05 | 12.42 | +2.90% | 1,102,394 | 135,920.66 |
`},
{ id:'two-long', set:'dev', lang:'zh-CN', tags:['zh','two-long'], title:'两列长文 · 方案对比', md:`
| 维度 | 方案 A：自建集群 | 方案 B：托管服务 |
|---|---|---|
| 成本 | 前期硬件投入较大，但在业务量稳定后单位成本更低，三年总成本预计低约 20%。 | 按量计费，无前期投入，业务波动大时更划算，但长期来看费用随规模线性增长。 |
| 运维 | 需要专职团队负责升级、监控与故障处理，对人员能力要求较高。 | 厂商负责底层运维，团队只需关注应用层配置。 |
| 合规 | 数据完全自主可控，便于满足等保三级要求。 | 需评估厂商的合规认证范围及数据出境风险。 |
`},
{ id:'ta-bn', set:'dev', lang:'ta', tags:['ta','bn'], title:'தமிழ் / বাংলা · Mixed Indic', md:`
| மொழி | ভাষা | பேசுவோர் | குறிப்பு |
|---|---|---|---|
| தமிழ் | তামিল | 8 கோடி | உலகின் மிகப் பழமையான செம்மொழிகளில் ஒன்றாகக் கருதப்படுகிறது. |
| বাংলা | বাংলা | 23 கோடி | বিশ্বের সপ্তম বৃহত্তম ভাষা, বাংলাদেশ ও পশ্চিমবঙ্গে প্রচলিত। |
| हिन्दी | হিন্দি | 60 கோடி | — |
`},
{ id:'ru-vi', set:'dev', lang:'ru', tags:['ru','vi','combining'], title:'Русский / Tiếng Việt · Diacritics', md:`
| Термин | Tiếng Việt | Описание |
|---|---|---|
| Производительность | Hiệu năng | Способность системы обрабатывать запросы с минимальной задержкой при высокой нагрузке. |
| Масштабируемость | Khả năng mở rộng | Возможность увеличивать ресурсы без изменения архитектуры. |
| Отказоустойчивость | Khả năng chịu lỗi | Hệ thống vẫn tiếp tục hoạt động khi một hoặc nhiều thành phần gặp sự cố. |
`},
{ id:'repeated-status', set:'dev', lang:'zh-CN', tags:['zh','repeated'], title:'重复值 · 审批流水', md:`
| 单号 | 申请人 | 类型 | 金额 | 状态 | 审批意见 |
|---|---|---|--:|---|---|
| AP-0001 | 赵敏 | 差旅报销 | 1,280.00 | 已通过 | — |
| AP-0002 | 赵敏 | 差旅报销 | 3,460.50 | 已通过 | 请补充酒店发票原件 |
| AP-0003 | 钱多多 | 采购申请 | 12,800.00 | 待审批 | — |
| AP-0004 | 孙悟空 | 差旅报销 | 860.00 | 已驳回 | 超出差旅标准，出租车费用应按公司规定选择公共交通 |
| AP-0005 | 钱多多 | 采购申请 | 4,999.00 | 已通过 | — |
| AP-0006 | 赵敏 | 团建费用 | 6,000.00 | 待审批 | — |
| AP-0007 | 孙悟空 | 差旅报销 | 420.00 | 已通过 | — |
| AP-0008 | 李逍遥 | 采购申请 | 23,500.00 | 待审批 | 需提供三家供应商比价单 |
`},
{ id:'ja-mixed-code', set:'dev', lang:'ja', tags:['ja','code','en','mixed'], title:'日本語 · CLI オプション', md:`
| オプション | 短縮形 | 説明 |
|---|---|---|
| \`--output-dir\` | \`-o\` | 生成されたファイルの出力先ディレクトリを指定します。存在しない場合は自動的に作成されます。 |
| \`--watch\` | \`-w\` | ファイルの変更を監視し、自動的に再ビルドします。 |
| \`--config\` | \`-c\` | 設定ファイル（\`tb.config.json\`）のパス。 |
`},
// =============================== VALIDATION (held out) =====================
{ id:'v-zh-hr', set:'val', lang:'zh-CN', tags:['zh','repeated','short-vs-long'], title:'[验证] 中文 · 员工花名册', md:`
| 工号 | 姓名 | 部门 | 职级 | 入职日期 | 主要职责 |
|---|---|---|---|---|---|
| E10234 | 周子涵 | 平台研发部 | P6 | 2019-07-01 | 负责消息队列与任务调度平台的架构演进，牵头完成了跨机房容灾改造。 |
| E10311 | 吴昊 | 数据智能部 | P7 | 2018-03-12 | 推荐算法负责人 |
| E10452 | 郑雨桐 | 平台研发部 | P5 | 2021-09-06 | 参与网关的限流与熔断组件开发，维护内部开发者文档。 |
| E10518 | 冯晓 | 用户体验部 | P6 | 2020-11-23 | 主导移动端设计规范的制定，推动设计系统在六条业务线落地。 |
| E10600 | 欧阳娜娜 | 数据智能部 | P4 | 2023-02-15 | 数据标注质检 |
`},
{ id:'v-zh-course', set:'val', lang:'zh-CN', tags:['zh','repeated'], title:'[验证] 中文 · 课程表', md:`
| 节次 | 时间 | 周一 | 周二 | 周三 | 周四 | 周五 |
|---|---|---|---|---|---|---|
| 1 | 08:00–08:45 | 语文 | 数学 | 英语 | 语文 | 数学 |
| 2 | 08:55–09:40 | 数学 | 语文 | 物理 | 化学 | 英语 |
| 3 | 10:00–10:45 | 英语 | 体育 | 数学 | 历史 | 信息技术与人工智能基础 |
| 4 | 10:55–11:40 | 生物 | 地理 | 语文 | 英语 | 班会 |
| 5 | 14:00–14:45 | 综合实践活动 | 物理 | 美术 | 数学 | 自习 |
`},
{ id:'v-zh-legal', set:'val', lang:'zh-CN', tags:['zh','two-long'], title:'[验证] 中文 · 合同条款修订对照', md:`
| 条款 | 原条款 | 修订后 | 修订理由 |
|---|---|---|---|
| 第 5.2 条 | 乙方应于每月 10 日前支付上月服务费用。 | 乙方应于收到甲方开具的合规发票后 15 个工作日内支付上月服务费用。 | 与乙方财务付款流程保持一致。 |
| 第 8.1 条 | 任何一方违约，应向守约方支付合同总金额 30% 的违约金。 | 任何一方违约，应赔偿守约方因此遭受的直接经济损失，但赔偿总额不超过合同总金额的 20%。 | 原违约金比例过高，可能被认定为显失公平。 |
| 第 12 条 | 本合同争议提交甲方所在地人民法院诉讼解决。 | 本合同争议提交上海国际仲裁中心仲裁解决。 | 双方协商一致。 |
`},
{ id:'v-en-deps', set:'val', lang:'en', tags:['en','code','extreme'], title:'[val] EN · Dependency audit', md:`
| Package | Version | License | Vulnerabilities | Notes |
|---|---|---|---|---|
| \`lodash\` | 4.17.21 | MIT | 0 | Consider replacing with native methods to reduce bundle size. |
| \`moment\` | 2.29.4 | MIT | 0 | In maintenance mode; migrate to \`date-fns\` or Temporal. |
| \`node-fetch\` | 2.6.7 | MIT | 1 (moderate) | See https://github.com/advisories/GHSA-r683-j2x4-v87g for details. |
| \`@company/internal-design-system-react-components\` | 12.0.0-beta.3 | Proprietary | — | Pre-release build pinned by the platform team. |
| \`left-pad\` | 1.3.0 | WTFPL | 0 | Unused. |
`},
{ id:'v-ja-spec', set:'val', lang:'ja', tags:['ja','numeric'], title:'[検証] 日本語 · 製品仕様', md:`
| 項目 | スタンダード | プレミアム | 備考 |
|---|---|---|---|
| 本体サイズ | 120 × 80 × 25 mm | 120 × 80 × 25 mm | 共通 |
| 重量 | 約 180 g | 約 195 g | バッテリー含む |
| 連続再生時間 | 最大 20 時間 | 最大 32 時間 | 音量や使用環境によって短くなる場合があります。 |
| 防水性能 | IPX4 | IPX7 | プレミアムは水深 1 m で 30 分間の浸水に耐えます。 |
`},
{ id:'v-ko-news', set:'val', lang:'ko', tags:['ko','en'], title:'[검증] 한국어 · 뉴스 요약', md:`
| 분야 | 제목 | 출처 | 요약 |
|---|---|---|---|
| 경제 | 한국은행 기준금리 동결 | 연합뉴스 | 한국은행 금융통화위원회는 물가 상승률 둔화 흐름을 좀 더 지켜보겠다며 기준금리를 연 3.50%로 유지했다. |
| IT | 국내 AI 반도체 스타트업 투자 유치 | ZDNet Korea | 시리즈 B 라운드에서 1,200억 원 규모의 투자를 받았다. |
| 스포츠 | 프로야구 올스타전 일정 확정 | 스포츠조선 | 올스타전은 7월 13일 인천에서 열린다. |
`},
{ id:'v-ar-he', set:'val', lang:'ar', tags:['ar','he','rtl','numeric','mixed'], title:'[val] العربية / עברית · Bidi with numbers', md:`
| الرمز | المدينة | עיר | السكان | ملاحظات |
|---|---|---|--:|---|
| RUH | الرياض | ריאד | 7,676,654 | عاصمة المملكة العربية السعودية وأكبر مدنها من حيث عدد السكان. |
| JED | جدة | ג'דה | 3,751,722 | ميناء رئيسي على البحر الأحمر |
| TLV | تل أبيب | תל אביב | 474,530 | מרכז כלכלי ותרבותי, ידועה בחופים ובחיי הלילה שלה. |
`},
{ id:'v-th-lo', set:'val', lang:'th', tags:['th','lo'], title:'[val] ไทย / ລາວ · Menu', md:`
| อาหาร | ອາຫານ | ราคา | คำอธิบาย |
|---|---|---|---|
| ต้มยำกุ้ง | ຕົ້ມຍຳກຸ້ງ | 180 บาท | ซุปรสเปรี้ยวเผ็ดใส่กุ้งแม่น้ำตะไคร้ใบมะกรูดและข่า |
| ส้มตำ | ຕຳໝາກຫຸ່ງ | 60 บาท | สลัดมะละกอรสจัดจ้าน |
| ข้าวเหนียวมะม่วง | ເຂົ້າໜຽວໝາກມ່ວງ | 120 บาท | ข้าวเหนียวมูนราดกะทิเสิร์ฟพร้อมมะม่วงน้ำดอกไม้สุก |
`},
{ id:'v-indic-sci', set:'val', lang:'hi', tags:['hi','bn','ta','numeric'], title:'[val] Indic · Planets', md:`
| ग्रह | গ্রহ | கோள் | दूरी (AU) | टिप्पणी |
|---|---|---|--:|---|
| बुध | বুধ | புதன் | 0.39 | सूर्य के सबसे निकट और सौरमंडल का सबसे छोटा ग्रह। |
| शुक्र | শুক্র | வெள்ளி | 0.72 | সবচেয়ে উজ্জ্বল গ্রহ |
| मंगल | মঙ্গল | செவ்வாய் | 1.52 | சிவப்பு நிறத்தில் காணப்படுவதால் இது செங்கோள் என்றும் அழைக்கப்படுகிறது. |
`},
{ id:'v-emoji-sport', set:'val', lang:'zh-CN', tags:['emoji','zh','numeric'], title:'[验证] Emoji · 赛事结果', md:`
| 排名 | 国家/地区 | 🥇 | 🥈 | 🥉 | 亮点 |
|--:|---|--:|--:|--:|---|
| 1 | 🇺🇸 美国 | 40 | 44 | 42 | 游泳与田径项目继续保持优势 🏊‍♂️🏃‍♀️ |
| 2 | 🇨🇳 中国 | 40 | 27 | 24 | 跳水包揽全部金牌，乒乓球五金全收 🏓 |
| 3 | 🇯🇵 日本 | 20 | 12 | 13 | 摔跤与滑板表现亮眼 |
| 4 | 🇦🇺 澳大利亚 | 18 | 19 | 16 | — |
`},
{ id:'v-cli-flags', set:'val', lang:'en', tags:['code','en'], title:'[val] Code · CLI flags', md:`
| Flag | Type | Default | Description |
|---|---|---|---|
| \`--max-old-space-size\` | number | \`4096\` | Sets the max memory size of V8's old memory section, in megabytes. |
| \`--experimental-vm-modules\` | boolean | \`false\` | Enables experimental ES module support in the \`vm\` module. |
| \`-r\`, \`--require\` | string | — | Preloads the specified module at startup. |
| \`--inspect-brk=[host:]port\` | string | \`127.0.0.1:9229\` | Activates inspector and breaks before user code starts. |
`},
{ id:'v-meeting', set:'val', lang:'zh-CN', tags:['zh','en','mixed','repeated'], title:'[验证] 中英混排 · 会议待办', md:`
| # | Action item | 负责人 | Due | 状态 |
|--:|---|---|---|---|
| 1 | 整理 Q3 OKR 草案并发给各业务线 review | Lily | 7/05 | 进行中 |
| 2 | Follow up with Legal on the GDPR data processing addendum（DPA）| 王强 | 7/08 | 未开始 |
| 3 | 评估将 CI 从 Jenkins 迁移到 GitHub Actions 的成本 | Tom | 7/12 | 进行中 |
| 4 | 更新 onboarding 文档 | Lily | 7/03 | 已完成 |
`},
{ id:'v-extreme', set:'val', lang:'en', tags:['extreme','en','many-cols'], title:'[val] Extreme · 10 columns + unbreakable values', md:`
| ID | SKU | Color | Size | Qty | Price | Tax | Total | Warehouse | Tracking |
|---|---|---|---|--:|--:|--:|--:|---|---|
| 1 | SKU-AX-7781-BLK | Black | XL | 2 | 49.90 | 4.99 | 104.79 | Rotterdam-NL-03 | 1Z999AA10123456784 |
| 2 | SKU-AX-7781-WHT | White | M | 1 | 49.90 | 4.99 | 54.89 | Rotterdam-NL-03 | 1Z999AA10123456785 |
| 3 | SKU-QZ-0042-RED | Red | S | 5 | 12.00 | 1.20 | 66.00 | Leipzig-DE-01 | — |
`},
{ id:'v-zh-orders', set:'val', lang:'zh-CN', tags:['zh','numeric','outlier'], title:'[验证] 中文 · 电商订单', md:`
| 订单号 | 下单时间 | 商品 | 金额 | 收货地址 |
|---|---|---|--:|---|
| 202406180001238845 | 06-18 00:01 | 无线降噪耳机 × 1 | ¥1,299.00 | 浙江省杭州市西湖区文三路 478 号华星时代广场 A 座 12 楼 |
| 202406180001239102 | 06-18 00:02 | 抽纸 24 包 | ¥59.90 | 北京市朝阳区 |
| 202406180001240017 | 06-18 00:05 | 机械键盘（87 键，茶轴，PBT 键帽，有线/蓝牙/2.4G 三模） | ¥469.00 | 广东省深圳市南山区科技园南区深南大道 9988 号 |
`},
];
