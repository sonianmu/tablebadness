/* Second held-out set (val2), written AFTER the last algorithm change (term floors) and before running it.
 * Used only for the final blind visual review and metrics; never for tuning. */
(function () {
  const C = [
{ id: 'w-gov', set: 'val2', kind: 'struct', lang: 'zh-CN', tags: ['zh', 'colspan', 'multi-header', 'role-row'], title: '[val2] 政务服务 · 办理时限', html: `
<table><thead>
<tr><th rowspan="2">事项名称</th><th colspan="2">办理时限（工作日）</th><th rowspan="2">所需材料</th></tr>
<tr><th>法定</th><th>承诺</th></tr>
</thead><tbody>
<tr><th scope="row">企业设立登记</th><td>15</td><td>1</td><td>设立登记申请书、章程、法定代表人身份证明、住所使用证明</td></tr>
<tr><th scope="row">食品经营许可</th><td>20</td><td>5</td><td>申请书、营业执照复印件、与食品经营相适应的设备布局图</td></tr>
<tr><th scope="row">户口迁移</th><td>10</td><td>3</td><td>身份证、户口簿</td></tr>
</tbody></table>` },
{ id: 'w-sla', set: 'val2', kind: 'struct', lang: 'en', tags: ['en', 'role-col', 'role-row'], rowHeader: true, title: '[val2] SLA tiers', md: `
| Tier | Monthly uptime commitment | Service credit | Support channels |
|---|--:|--:|---|
| Standard | 99.5% | 10% | Email, community forum |
| Professional | 99.9% | 25% | Email, chat, phone during business hours in the customer's primary time zone |
| Mission-critical | 99.99% | 50% | 24/7 phone with a named technical account manager |
` },
{ id: 'w-ja-rowspan', set: 'val2', kind: 'struct', lang: 'ja', tags: ['ja', 'rowspan', 'role-row'], title: '[val2] 日本語 · 研修スケジュール', html: `
<table><thead><tr><th>日程</th><th>時間</th><th>内容</th><th>講師</th></tr></thead><tbody>
<tr><th scope="rowgroup" rowspan="2">1 日目</th><td>09:00–12:00</td><td>会社概要と行動規範、情報セキュリティの基本ルール</td><td>人事部</td></tr>
<tr><td>13:00–17:00</td><td>業務システムの操作演習</td><td>情報システム部</td></tr>
<tr><th scope="rowgroup" rowspan="2">2 日目</th><td>09:00–12:00</td><td>ビジネスマナー</td><td>外部講師</td></tr>
<tr><td>13:00–17:00</td><td>配属先でのオリエンテーション。先輩社員と一緒に一日の業務の流れを確認します。</td><td>各部署</td></tr>
</tbody></table>` },
{ id: 'w-ids', set: 'val2', kind: 'plain', lang: 'en', tags: ['en', 'code', 'adversarial'], adversarial: 'long unbreakable IDs compete with prose', title: '[val2][adversarial] Incident IDs vs prose', md: `
| Incident | Trace ID | Severity | Summary |
|---|---|---|---|
| INC-20240611-0042 | 4bf92f3577b34da6a3ce929d0e0e4736 | P1 | Checkout latency spiked to eight seconds after the cache cluster failed over to the secondary region. |
| INC-20240611-0043 | 00f067aa0ba902b7 | P3 | Typo in the Spanish translation of the password reset email. |
| INC-20240612-0001 | 7d3e0a1b9c2f4e6d | P2 | Webhook retries exhausted for one merchant. |
` },
{ id: 'w-ar-multi', set: 'val2', kind: 'struct', lang: 'ar', tags: ['ar', 'rtl', 'colspan', 'multi-header'], title: '[val2] العربية · ترويسة متعددة المستويات', html: `
<table><thead>
<tr><th rowspan="2">المحافظة</th><th colspan="2">عدد المدارس</th><th rowspan="2">ملاحظات</th></tr>
<tr><th>حكومية</th><th>خاصة</th></tr>
</thead><tbody>
<tr><th scope="row">القاهرة</th><td>3,214</td><td>1,107</td><td>أعلى كثافة طلابية في الفصول مقارنة ببقية المحافظات.</td></tr>
<tr><th scope="row">الإسكندرية</th><td>1,402</td><td>512</td><td>—</td></tr>
<tr><th scope="row">أسوان</th><td>611</td><td>48</td><td>توسع في المدارس المجتمعية في القرى.</td></tr>
</tbody></table>` },
{ id: 'w-tall-rowheader', set: 'val2', kind: 'struct', lang: 'zh-CN', tags: ['zh', 'role-row', 'adversarial'], rowHeader: true, adversarial: 'row headers much longer than one-line data: wrapping them adds height everywhere', title: '[val2][反例] 行标题长于数据', md: `
| 考核指标 | 权重 | 目标值 | 实际值 |
|---|--:|--:|--:|
| 年度新签合同金额（含框架协议） | 30% | 2.4 亿 | 2.61 亿 |
| 重点客户续约率（按合同金额加权） | 25% | 92% | 94.5% |
| 交付项目按期验收比例 | 25% | 90% | 87% |
| 员工主动离职率 | 20% | ≤ 12% | 9.8% |
` },
{ id: 'w-th-colspan', set: 'val2', kind: 'struct', lang: 'th', tags: ['th', 'colspan'], title: '[val2] ไทย · ราคาห้องพัก', html: `
<table><thead>
<tr><th rowspan="2">ประเภทห้อง</th><th colspan="2">ราคาต่อคืน (บาท)</th><th rowspan="2">สิ่งอำนวยความสะดวก</th></tr>
<tr><th>วันธรรมดา</th><th>วันหยุด</th></tr>
</thead><tbody>
<tr><td>ห้องมาตรฐาน</td><td>1,200</td><td>1,500</td><td>เตียงคู่ เครื่องปรับอากาศ อินเทอร์เน็ตไร้สาย</td></tr>
<tr><td>ห้องดีลักซ์วิวทะเล</td><td>2,400</td><td>2,900</td><td>ระเบียงส่วนตัวพร้อมวิวทะเล อ่างอาบน้ำ และอาหารเช้าสำหรับสองท่าน</td></tr>
</tbody></table>` },
{ id: 'w-mixed-2d', set: 'val2', kind: 'struct', lang: 'zh-CN', tags: ['zh', 'en', 'colspan', 'rowspan', 'mixed'], title: '[val2] 中英混排 · 二维合并发布矩阵', html: `
<table><thead>
<tr><th rowspan="2">Platform</th><th colspan="2">v3.2</th><th colspan="2">v3.3</th></tr>
<tr><th>Beta</th><th>GA</th><th>Beta</th><th>GA</th></tr>
</thead><tbody>
<tr><th scope="row">iOS</th><td>05-06</td><td>05-20</td><td rowspan="2" colspan="2">与 Android 同步发布，等待 App Store 与 Google Play 双平台审核通过后统一开放</td></tr>
<tr><th scope="row">Android</th><td>05-06</td><td>05-22</td></tr>
<tr><th scope="row">Web</th><td colspan="2">持续部署，无版本概念</td><td>—</td><td>06-03</td></tr>
</tbody></table>` },
  ];
  window.TB_CASES = (window.TB_CASES || []).concat(C);
})();
