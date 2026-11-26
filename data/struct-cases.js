/* Structural cases: header roles, row headers, colspan / rowspan, multi-level headers.
 * html: a real HTML table (spans and th/scope are the input; never inferred).
 * rowHeader: caller declares the first logical body column as row headers (Markdown has no syntax for it).
 * adversarial: built to expose a weakness of role/span handling.
 * set 'dev' was used while designing; set 'val' was written before any tuning and never used to tune. */
(function () {
  const C = [
// ============================== DEV ==============================
{ id: 's-okr', set: 'dev', lang: 'zh-CN', tags: ['zh', 'role-row'], rowHeader: true, title: '行标题 · 年度目标拆解', md: `
| 目标 | 负责人 | 截止 | 关键结果 |
|---|---|---|---|
| 年度经营目标 | 周敏 | 12-31 | 营收同比增长 25%，其中海外业务占比提升到 30% 以上，毛利率不低于 36%。 |
| 客户满意度提升 | 吴昊 | 09-30 | NPS 从 41 提升到 50，投诉一次解决率达到 85%。 |
| 研发效能 | 郑雨 | 06-30 | 平均发布周期从两周缩短到一周，线上缺陷逃逸率下降一半。 |
| 组织建设 | 冯晓 | 12-31 | 完成两个新事业部的组建。 |
` },
{ id: 's-crosstab', set: 'dev', lang: 'en', tags: ['en', 'role-row', 'numeric'], rowHeader: true, title: 'Cross-tab · Regional sales', md: `
| Region | Jan | Feb | Mar | Apr | May | Jun |
|---|--:|--:|--:|--:|--:|--:|
| North America | 1,204 | 1,310 | 1,288 | 1,402 | 1,455 | 1,530 |
| Europe, Middle East & Africa | 986 | 1,002 | 1,040 | 1,011 | 1,098 | 1,120 |
| Asia Pacific | 640 | 702 | 758 | 801 | 845 | 910 |
| Latin America | 133 | 141 | 150 | 162 | 170 | 181 |
` },
{ id: 's-multihdr', set: 'dev', lang: 'zh-CN', tags: ['zh', 'colspan', 'multi-header', 'numeric'], title: '多级表头 · 半年度指标', html: `
<table><thead>
<tr><th rowspan="2">指标</th><th colspan="2">2023 年</th><th colspan="2">2024 年</th><th rowspan="2">备注</th></tr>
<tr><th>上半年</th><th>下半年</th><th>上半年</th><th>下半年</th></tr>
</thead><tbody>
<tr><th scope="row">营业收入（亿元）</th><td>71.2</td><td>81.5</td><td>84.9</td><td>96.4</td><td>海外市场贡献主要增量，汇率影响约 1.2 个百分点。</td></tr>
<tr><th scope="row">毛利率</th><td>34.9%</td><td>36.6%</td><td>36.8%</td><td>37.4%</td><td>原材料价格回落</td></tr>
<tr><th scope="row">研发投入（亿元）</th><td>8.7</td><td>10.5</td><td>11.3</td><td>13.5</td><td>新增两个研发中心</td></tr>
</tbody></table>` },
{ id: 's-rowspan-cat', set: 'dev', lang: 'zh-CN', tags: ['zh', 'rowspan', 'role-row'], title: '跨行类别 · 产品线', html: `
<table><thead><tr><th>类别</th><th>产品</th><th>价格</th><th>说明</th></tr></thead><tbody>
<tr><th scope="rowgroup" rowspan="3">智能手机</th><td>星河 X1</td><td>¥3,999</td><td>影像系统出色，夜景表现稳定，但机身偏重。</td></tr>
<tr><td>星河 X1 Pro</td><td>¥5,499</td><td>长焦镜头带来明显提升。</td></tr>
<tr><td>青柠 Air</td><td>¥2,299</td><td>轻薄便携。</td></tr>
<tr><th scope="rowgroup" rowspan="2">可穿戴设备</th><td>脉搏 Watch 3</td><td>¥1,299</td><td>新增血氧与睡眠呼吸监测，续航约 10 天。</td></tr>
<tr><td>脉搏 Band</td><td>¥249</td><td>基础运动记录。</td></tr>
</tbody></table>` },
{ id: 's-2d', set: 'dev', lang: 'en', tags: ['en', 'colspan', 'rowspan', 'multi-header', 'corner'], title: '2D merge · Clinic schedule', html: `
<table><thead>
<tr><th rowspan="2" scope="col">Time</th><th colspan="2" scope="colgroup">Monday</th><th colspan="2" scope="colgroup">Tuesday</th></tr>
<tr><th scope="col">Room A</th><th scope="col">Room B</th><th scope="col">Room A</th><th scope="col">Room B</th></tr>
</thead><tbody>
<tr><th scope="row">09:00</th><td rowspan="2">Cardiology clinic (Dr. Ito), walk-ins accepted until 10:30</td><td>Vaccinations</td><td>Physiotherapy</td><td rowspan="2">Dermatology</td></tr>
<tr><th scope="row">10:00</th><td>Blood tests</td><td>Physiotherapy</td></tr>
<tr><th scope="row">11:00</th><td colspan="2">Staff training — closed to patients</td><td>Pediatrics</td><td>Nutrition counselling for patients with type 2 diabetes</td></tr>
</tbody></table>` },
{ id: 's-longcolhdr', set: 'dev', lang: 'en', tags: ['en', 'role-col', 'adversarial'], adversarial: 'column-header protection should yield: very long headers over tiny numeric columns', title: '[adversarial] Long headers over tiny numbers', md: `
| Site | Average weekly active users across all platforms | Median session length in minutes | Share of sessions that ended in a purchase | Number of support tickets opened |
|---|--:|--:|--:|--:|
| A | 12k | 7.1 | 3.2% | 41 |
| B | 9.8k | 6.4 | 2.9% | 37 |
| C | 4.1k | 9.0 | 4.4% | 12 |
` },
{ id: 's-rtl-row', set: 'dev', lang: 'ar', tags: ['ar', 'rtl', 'role-row'], rowHeader: true, title: 'RTL · صفوف معنونة', md: `
| البند | الربع الأول | الربع الثاني | ملاحظات |
|---|--:|--:|---|
| الإيرادات التشغيلية | 412 | 455 | نمو مدفوع بزيادة المبيعات في السوق المحلية وتوسع قنوات البيع الإلكتروني. |
| المصروفات الإدارية والعمومية | 120 | 118 | انخفاض طفيف |
| صافي الربح | 88 | 104 | تحسن الهوامش |
` },
{ id: 's-interlock', set: 'dev', lang: 'zh-CN', tags: ['zh', 'colspan', 'adversarial'], adversarial: 'overlapping colspans share a column: widening it helps two spans at once', title: '[反例] 交错跨列 · 共享中间列', html: `
<table><thead><tr><th>项目</th><th>阶段一</th><th>阶段二</th><th>阶段三</th></tr></thead><tbody>
<tr><td>需求</td><td colspan="2">与业务方共同梳理核心流程，输出需求说明书并完成评审</td><td>冻结</td></tr>
<tr><td>开发</td><td>搭建脚手架</td><td colspan="2">完成核心模块开发与联调，接入统一认证与日志平台</td></tr>
<tr><td>测试</td><td>用例</td><td>回归</td><td>验收</td></tr>
</tbody></table>` },
{ id: 's-tallspan', set: 'dev', lang: 'en', tags: ['en', 'rowspan', 'adversarial'], adversarial: 'a rowspan cell taller than the rows it covers must push height into them', title: '[adversarial] Rowspan taller than its rows', html: `
<table><thead><tr><th>Step</th><th>Owner</th><th>Notes</th></tr></thead><tbody>
<tr><td>Plan</td><td>Ana</td><td rowspan="3">All three steps share one change ticket. Approval from the security review board is required before any production access is granted, and every action must be logged in the audit trail with the ticket number, the operator's name and the exact commands executed.</td></tr>
<tr><td>Build</td><td>Ben</td></tr>
<tr><td>Ship</td><td>Cai</td></tr>
</tbody></table>` },
{ id: 's-same-text', set: 'dev', lang: 'zh-CN', tags: ['zh', 'role-col', 'role-row', 'control'], rowHeader: true, title: '对照 · 同一文本的两种角色', md: `
| 指标名称 | 年度经营目标 | 客户满意度提升 | 研发效能改进 |
|---|---|---|---|
| 年度经营目标 | 营收增长 25% | — | — |
| 客户满意度提升 | — | NPS 提升到 50 | — |
| 研发效能改进 | — | — | 发布周期缩短到一周 |
` },
{ id: 's-groupwide', set: 'dev', lang: 'zh-CN', tags: ['zh', 'colspan', 'multi-header', 'adversarial'], adversarial: 'a group header longer than its short sub-columns', title: '[反例] 组标题长于子列', html: `
<table><thead>
<tr><th rowspan="2">城市</th><th colspan="3">空气质量指数（AQI）月度平均值</th><th rowspan="2">说明</th></tr>
<tr><th>一月</th><th>二月</th><th>三月</th></tr>
</thead><tbody>
<tr><td>北京</td><td>85</td><td>72</td><td>64</td><td>一月受供暖与静稳天气影响，出现两次重污染过程。</td></tr>
<tr><td>上海</td><td>61</td><td>58</td><td>55</td><td>整体平稳</td></tr>
<tr><td>广州</td><td>48</td><td>45</td><td>50</td><td>三月回南天湿度大，臭氧浓度略有上升。</td></tr>
</tbody></table>` },
// ============================== VAL (held out) ==============================
{ id: 'sv-timetable', set: 'val', lang: 'zh-CN', tags: ['zh', 'rowspan', 'colspan', 'role-row'], title: '[验证] 课程表 · 连堂与午休', html: `
<table><thead><tr><th>节次</th><th>周一</th><th>周二</th><th>周三</th><th>周四</th><th>周五</th></tr></thead><tbody>
<tr><th scope="row">第一节</th><td rowspan="2">数学（连堂）</td><td>语文</td><td>英语</td><td rowspan="2">物理实验：测量重力加速度</td><td>语文</td></tr>
<tr><th scope="row">第二节</th><td>英语</td><td>数学</td><td>历史</td></tr>
<tr><th scope="row">午休</th><td colspan="5">12:00–13:30 午餐与午休，图书馆开放</td></tr>
<tr><th scope="row">第三节</th><td>体育</td><td>信息技术与人工智能基础</td><td>美术</td><td>生物</td><td>班会</td></tr>
</tbody></table>` },
{ id: 'sv-income', set: 'val', lang: 'en', tags: ['en', 'colspan', 'multi-header', 'numeric', 'role-row'], title: '[val] Income statement · fiscal quarters', html: `
<table><thead>
<tr><th rowspan="2" scope="col">USD millions</th><th colspan="4" scope="colgroup">Fiscal 2024</th><th rowspan="2" scope="col">Full year</th></tr>
<tr><th scope="col">Q1</th><th scope="col">Q2</th><th scope="col">Q3</th><th scope="col">Q4</th></tr>
</thead><tbody>
<tr><th scope="row">Revenue</th><td>412.5</td><td>438.0</td><td>455.2</td><td>501.9</td><td>1,807.6</td></tr>
<tr><th scope="row">Cost of revenue, excluding depreciation and amortization</th><td>201.3</td><td>209.8</td><td>214.0</td><td>232.6</td><td>857.7</td></tr>
<tr><th scope="row">Research and development</th><td>88.1</td><td>90.4</td><td>93.7</td><td>97.2</td><td>369.4</td></tr>
<tr><th scope="row">Operating income</th><td>61.0</td><td>70.3</td><td>78.9</td><td>96.4</td><td>306.6</td></tr>
</tbody></table>` },
{ id: 'sv-spec', set: 'val', lang: 'ja', tags: ['ja', 'colspan', 'role-row'], title: '[検証] 仕様比較 · セクション行', html: `
<table><thead><tr><th>項目</th><th>スタンダード</th><th>プロ</th></tr></thead><tbody>
<tr><th colspan="3" scope="colgroup">ディスプレイ</th></tr>
<tr><th scope="row">サイズ</th><td>6.1 インチ</td><td>6.7 インチ</td></tr>
<tr><th scope="row">リフレッシュレート</th><td>60 Hz</td><td>1〜120 Hz の可変リフレッシュレートに対応し、静止画表示時の消費電力を抑えます。</td></tr>
<tr><th colspan="3" scope="colgroup">バッテリー</th></tr>
<tr><th scope="row">連続再生時間</th><td>最大 20 時間</td><td>最大 29 時間</td></tr>
<tr><th scope="row">急速充電</th><td>30 分で 50%</td><td>30 分で 50%（別売の 20W 以上のアダプタが必要）</td></tr>
</tbody></table>` },
{ id: 'sv-trial', set: 'val', lang: 'zh-CN', tags: ['zh', 'rowspan', 'role-row'], title: '[验证] 临床试验 · 分组与随访', html: `
<table><thead><tr><th>分组</th><th>访视</th><th>时间窗</th><th>检查项目</th></tr></thead><tbody>
<tr><th scope="rowgroup" rowspan="3">试验组（低剂量）</th><td>基线</td><td>D0</td><td>血常规、肝肾功能、心电图</td></tr>
<tr><td>第一次随访</td><td>D28 ± 3</td><td>血常规、肝肾功能，记录不良事件并评估是否需要调整剂量</td></tr>
<tr><td>第二次随访</td><td>D84 ± 7</td><td>全部基线项目</td></tr>
<tr><th scope="rowgroup" rowspan="2">对照组</th><td>基线</td><td>D0</td><td>同试验组</td></tr>
<tr><td>随访</td><td>D84 ± 7</td><td>同试验组</td></tr>
</tbody></table>` },
{ id: 'sv-he-row', set: 'val', lang: 'he', tags: ['he', 'rtl', 'role-row'], rowHeader: true, title: '[val] עברית · שורות מתויגות', md: `
| נושא | אחראי | סטטוס | הערות |
|---|---|---|---|
| שדרוג מערכת ההרשאות | דנה | בתהליך | נדרש אישור מצוות האבטחה לפני הפריסה לסביבת הייצור. |
| הדרכת עובדים חדשים | יוסי | הושלם | — |
| מעבר לספק ענן חדש | רונית | מתוכנן | הערכת עלויות תוצג בישיבת ההנהלה הבאה. |
` },
{ id: 'sv-matrix', set: 'val', lang: 'en', tags: ['en', 'role-row', 'adversarial'], rowHeader: true, adversarial: 'long row headers over one-line rows: wrapping them ADDS height in every row', title: '[val][adversarial] Feature matrix with long row headers', md: `
| Capability | Free | Team | Business | Enterprise |
|---|:-:|:-:|:-:|:-:|
| Single sign-on with any SAML 2.0 identity provider | — | — | ✓ | ✓ |
| Audit log export to external SIEM systems | — | — | — | ✓ |
| Granular role-based access control for workspaces | — | ✓ | ✓ | ✓ |
| Priority support with a guaranteed four-hour response | — | — | ✓ | ✓ |
| Data residency in the European Union | — | — | — | ✓ |
` },
{ id: 'sv-ko-multi', set: 'val', lang: 'ko', tags: ['ko', 'colspan', 'multi-header', 'numeric'], title: '[검증] 한국어 · 다단 헤더', html: `
<table><thead>
<tr><th rowspan="2">지역</th><th colspan="2">인구 (만 명)</th><th colspan="2">평균 기온 (°C)</th></tr>
<tr><th>2013년</th><th>2023년</th><th>1월</th><th>8월</th></tr>
</thead><tbody>
<tr><th scope="row">서울특별시</th><td>1,014</td><td>938</td><td>-2.4</td><td>25.7</td></tr>
<tr><th scope="row">부산광역시</th><td>353</td><td>330</td><td>3.2</td><td>25.9</td></tr>
<tr><th scope="row">제주특별자치도</th><td>59</td><td>67</td><td>6.1</td><td>27.0</td></tr>
</tbody></table>` },
{ id: 'sv-th-span', set: 'val', lang: 'th', tags: ['th', 'rowspan'], title: '[val] ไทย · ตารางเดินรถ', html: `
<table><thead><tr><th>สาย</th><th>ต้นทาง</th><th>ปลายทาง</th><th>หมายเหตุ</th></tr></thead><tbody>
<tr><th scope="rowgroup" rowspan="2">สายสีเขียว</th><td>หมอชิต</td><td>เคหะฯ</td><td rowspan="2">ให้บริการตั้งแต่ตีห้าครึ่งถึงเที่ยงคืนทุกวันรวมวันหยุดนักขัตฤกษ์</td></tr>
<tr><td>สนามกีฬาฯ</td><td>บางหว้า</td></tr>
<tr><th scope="row">สายสีน้ำเงิน</th><td>ท่าพระ</td><td>หลักสอง</td><td>วงกลม</td></tr>
</tbody></table>` },
{ id: 'sv-longgroup', set: 'val', lang: 'en', tags: ['en', 'colspan', 'multi-header', 'adversarial'], adversarial: 'a long group header over tiny sub-columns: keeping it on one line would starve the description', title: '[val][adversarial] Long group header over tiny sub-columns', html: `
<table><thead>
<tr><th rowspan="2">Model</th><th colspan="3">Benchmark accuracy on held-out multilingual evaluation suites (%)</th><th rowspan="2">Notes</th></tr>
<tr><th>EN</th><th>ZH</th><th>AR</th></tr>
</thead><tbody>
<tr><td>Small</td><td>71</td><td>64</td><td>58</td><td>Distilled from the base model; trades accuracy for a four times lower latency on CPU.</td></tr>
<tr><td>Base</td><td>79</td><td>75</td><td>70</td><td>Default</td></tr>
<tr><td>Large</td><td>85</td><td>83</td><td>79</td><td>Requires a GPU with at least 24 GB of memory.</td></tr>
</tbody></table>` },
{ id: 'sv-merge-notes', set: 'val', lang: 'zh-CN', tags: ['zh', 'colspan', 'rowspan'], title: '[验证] 二维合并 · 采购评审', html: `
<table><thead><tr><th>供应商</th><th>报价</th><th>交期</th><th>质保</th><th>评审意见</th></tr></thead><tbody>
<tr><th scope="row">甲公司</th><td>¥128,000</td><td>30 天</td><td>2 年</td><td rowspan="2" colspan="1">甲、乙两家报价接近，建议进入第二轮商务谈判，重点比较付款条件与售后响应时间。</td></tr>
<tr><th scope="row">乙公司</th><td>¥131,500</td><td>25 天</td><td>3 年</td></tr>
<tr><th scope="row">丙公司</th><td colspan="3">未按要求提交完整报价文件，视为无效投标</td><td>淘汰</td></tr>
</tbody></table>` },
  ];
  window.TB_CASES = (window.TB_CASES || []).concat(C.map(c => Object.assign({ kind: 'struct' }, c)));
})();
