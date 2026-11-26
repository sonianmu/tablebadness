# Table Badness

Readability-aware column-width allocation for Markdown tables. Research brief: [RESEARCH.md](RESEARCH.md).

The core claim is that space is worth what it saves the reader, not how long the content is. The width a column needs is read from the browser's own text layout, and the whole viewport range is solved once.

## Method

1. **Prepare (independent of width, once per distinct cell).** Each distinct cell is laid out twice in a hidden host. At `width:0` the browser starts a line at every soft-wrap opportunity, so break opportunities come from the browser's own UAX #14 rules, Thai/Lao dictionary breaking, CJK kinsoku and emoji clusters. With `nowrap`, the same text gives the in-context width of every unbreakable unit. That is two reflows for the whole table, with no language-specific code. Each break opportunity is then classified:
   - *natural*: after whitespace, or next to a character from a script written without spaces (Han, Kana, Thai, …);
   - *intra-token*: any other browser-legal break, e.g. `F-|12`, `2024-|03-15`, `user-|profile`, or between Hangul syllables;
   - *emergency*: an `overflow-wrap` break inside a unit.

   Chrome breaks `F-12` and ISO dates at the hyphen, so atomicity cannot be taken from the browser's break opportunities alone.
2. **Staircase (pure arithmetic).** *Shrink-wrap descent*, `w ← tightWidth(layout(w − ε))`, lists every distinct greedy layout of a cell exactly, without bisection and without touching the DOM. A column's candidate widths are the union of its cells' staircase widths. No width between two candidates can change anything.
3. **Loss.** Each cell is charged `(lines−1) + A·intraTokenBreaks + E·emergencyBreaks + φ·lines·max(0, m₀/measure − 1)²`. Each row is charged `λ·(rowLines−1)`. Horizontal scroll costs `rows·(κ₀ + ρ·hiddenWidth/W)`. Defaults are in `TableBadness.DEFAULTS`.
4. **Allocation path (computed once for every width).** A greedy marginal-utility search repeatedly widens the one column whose jump to a larger candidate buys the most loss reduction per pixel. Every step only widens, so the result is a monotone width schedule. A resize is a binary search on that schedule, and column widths are continuous and non-decreasing in the available width. With `λ = 0` the objective is separable and the path reduces to merging the upper concave hulls of the columns' gain curves.

## Run

Requires Node 18+ and the Playwright Chromium build (or set `CHROME_PATH`).

```bash
npm install            # playwright-core only (project-local)
npm test               # invariants: staircase monotone, path monotone, DP ≤ path on the separable objective
npm run all            # accuracy + experiment + stability + perf → results/*.json, results/summary.txt
npm run sweep          # parameter sweep on the DEV set only
node bench/inspect.mjs zh-project 400 15    # one case, all methods, plus a screenshot
open index.html        # interactive demo (works from file://); drag column borders or use ←/→ to resize by hand
open eval.html         # human-preference evaluation: 24 blind trials (data/eval-set.js), you vs algorithms
```

API (classic script, `window.TableBadness`):

```js
const P = TableBadness.prepareTable(tableEl);   // measure (cached per distinct cell + font)
const path = TableBadness.buildPath(P);          // width-independent
const L = TableBadness.layoutAt(P, path, availableWidthPx); // ~µs
TableBadness.applyWidths(tableEl, L);            // <colgroup> + table-layout: fixed
```

## Test set and protocol

`data/cases.js` has 41 GFM tables: 27 in the dev set and 14 in the validation set, which was written before any tuning and was never used to choose parameters. They cover Chinese (16 tables), English, Japanese, Korean, Arabic, Hebrew, Hindi, Bengali, Tamil, Thai, Lao, Russian, Vietnamese, emoji, code, formula text, mixed scripts, repeated values, outliers, long headers and up to 10 columns.

Every case is run at widths 320/400/480/600/760/960 px and font sizes 14/16 px. All methods share the same CSS and the same break rules. Metrics are measured from the rendered DOM, not from the engine's predictions.

## Results (Chromium, `results/summary.txt`)

Engine accuracy: the predicted line count matches the browser in **99.8%** of 22,752 random-width samples across all scripts. The misses are sub-pixel cases where the engine predicts one extra line, which is the safe direction. Rendered columns add 1 px of slack.

Validation set (28 case × font, 6 widths):

| method | short values on one line | intra-token + emergency breaks / table | long text < 6em measure | height vs CSS | layouts that scroll |
|---|--:|--:|--:|--:|--:|
| browser `table-layout:auto` | 76.1% | 2.37 | 23.1% | 1.000 | 18.5% |
| content-proportional | 61.5% | 8.78 | 14.8% | 1.020 | 0% |
| min-height (local search) | 82.9% | 3.22 | 24.2% | 0.987 | 8.9% |
| **tb-fit** (scrolls only when forced) | 85.0% | 3.10 | 25.5% | 1.001 | 8.9% |
| **tb-path** (default) | **86.7%** | **1.96** | **9.7%** | **0.905** | 19.6% |

- At a similar scroll rate to the browser, `tb-path` keeps more short values intact, breaks fewer tokens, has less than half the severe fragmentation, and is about 10% shorter.
- Under the same "scroll only when forced" constraint, `tb-fit` is only marginally better than a min-height optimiser: a few more short values intact, slightly taller.
- The greedy path is within about 1% of a local-search optimum of the same objective (`tb-ls`).
- Ablations (`tb-separable`, `tb-nofrag`, `tb-lines-only`) each lose on at least one metric. The separable model (no row coupling) is visibly worse: it pays for breaking a date even when another cell already sets that row's height.

Resize stability (W = 300…1000 px, 5 px steps): `tb-fit` has 0 px excess column movement and 0 column shrinks. Min-height moves columns by 7.1 px per step, with some column shrinking on 67% of steps.

Performance (5 columns, 1000 rows): cold prepare 56 ms, path 10 ms, warm re-prepare after an edit 4 ms, one layout query about 10 µs. Line counts for every cell at 32 widths take 310 ms by DOM probing and 0.9 ms with the arithmetic engine.

## Known failures and limits

- **Long code tokens and URLs** (`code-config`, `v-en-deps`, `v-cli-flags`, `en-api` at ≤ 480 px): the browser overflows and scrolls, while Table Badness often emergency-breaks the token. As a result it scores below CSS auto on short-value integrity and atomic breaks in these cases.
- **Lao, Thai, Russian/Vietnamese and some Arabic** at ≤ 400 px: short-value integrity is sometimes below the min-height baseline.
- `tb-path` scrolls slightly more often than the browser on the validation set (19.6% vs 18.5%). The scroll trade-off is controlled by `scrollEntry`/`scrollCost`.
- All results are typesetting proxies. No human reading study was run, so nothing here shows that people read faster.
- Only Chromium on macOS system fonts was measured. Inline elements must not have horizontal padding: `table.css` fakes code padding with `box-shadow`. Vertical text, merged cells and nested tables are out of scope.
- The research skills listed in RESEARCH.md §7 are installed project-locally under `.claude/skills/` (git-ignored; versions pinned in `skills-lock.json`). Reinstall with the command in RESEARCH.md §7 from the repo root, adding `-a claude-code -y`.
