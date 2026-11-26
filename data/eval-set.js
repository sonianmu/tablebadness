/* Human evaluation set (v2, width–height coupling).
 * 8 row-height structures x 3 width tightness levels = 24 trials.
 * tau: available width = Wfit * (Wtop / Wfit)^tau, Wtop = min(Wnatural, 960px). Wfit is the narrowest width every method
 *      can fit without scrolling; Wnatural puts every cell on one line. Width is a HARD limit (no scrolling).
 * baseline: the method Table Badness is blind-compared against in that trial (rotated, 8 trials each).
 * Order is tau-major so consecutive trials differ in structure and script. */
(function () {
  const STRATA = [
    ['single', '单一瓶颈列', ['zh-project', 'en-api', 'v-zh-hr']],
    ['co', '多列并列瓶颈', ['v-zh-legal', 'v-h-co', 'two-long']],
    ['shift', '瓶颈在行间转移', ['v-h-shift', 'zh-product', 'v-ko-news']],
    ['sparse', '稀疏高行', ['v-h-sparse', 'v-zh-orders', 'outlier']],
    ['run', '连续高行', ['v-h-run', 'ja-schedule', 'v-meeting']],
    ['short', '全短值 / 数值', ['wide-numeric', 'long-headers', 'v-extreme']],
    ['script', '双向与无空格文字', ['ar-products', 'th-travel', 'v-ar-he']],
    ['code', '代码与长标记', ['code-config', 'v-cli-flags', 'v-en-deps']],
  ];
  const TAUS = [0.5, 0.2, 0.8];
  const BASES = ['css-auto', 'min-height', 'proportional'];
  const out = [];
  TAUS.forEach((tau, ti) => {
    STRATA.forEach(([stratum, label, cases], si) => {
      const n = out.length;
      out.push({ id: 'h' + String(n + 1).padStart(2, '0'), caseId: cases[ti], stratum, stratumLabel: label, tau, fs: 15, baseline: BASES[(si + ti) % 3] });
    });
  });
  window.TB_EVAL = out;
  window.TB_EVAL_STRATA = STRATA.map(([k, l]) => ({ key: k, label: l }));
})();
