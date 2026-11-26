# Table Badness

Readability-aware layout of text tables: plain Markdown tables, header roles, and HTML tables with `colspan`/`rowspan` and multi-level headers. The research brief is in [RESEARCH.md](RESEARCH.md).

Interactive demo: `index.html`. Human evaluation page: `eval.html`. Both open directly from `file://`.

## Model (v2, `src/tablebadness.js`)

**One boundary grid for every table.** Columns have boundaries x₀…xₘ and rows have boundaries y₀…yₙ. A cell covering columns [a,b) and rows [c,d) gets content width `x_b − x_a − padding` and needs height `lines(W)·lh + padding`. The natural table height is a **longest path over row boundaries** (`y_d ≥ y_c + h(cell)`). The plain "row height = tallest cell" rule is the special case where no cell spans rows. Spans are input constraints, never inferred or changed.

**Measurement** (`src/measure.js`, shared with the v1 prototype). Each distinct cell is laid out twice in the browser:

- at `width:0`, every soft-wrap opportunity becomes a line start;
- with `nowrap`, the browser gives the in-context width of every unbreakable unit.

*Shrink-wrap descent* (`w ← tight(layout(w−ε))`) then lists every distinct layout of the cell exactly. Breaks are classified with the browser's own UAX #14 behaviour plus `Intl.Segmenter` word boundaries:

| Break kind | Example |
|---|---|
| natural | at a space or word boundary |
| intra-token | `F-12` → `F-\|12` |
| intra-word | `毛利率` → `毛利\|率` |
| emergency | `Enterprise` → `Enterpris\|e` |

Prediction matches Chromium in **99.8% of 31,220** random-width samples.

**Loss.** For each cell: `α(role) · [(lines−1) + A·(intra-token + intra-word-in-a-term breaks) + E·emergency]`. For the whole table: `λ · height / line-height`.

- **Scan axis.** A column header is scanned across, so a line break stacks its text against the scan: α = 1+σ. A row header is scanned down, so a break follows the scan: α = 1−σ. This one principle replaces separate header rules. Row headers wrap "for free" only where the longest path already has vertical slack.
- **Terms.** A term is a short cell such as a label, ID or header word (≤ 4 words). It is never split mid-word by choice: its min-content width is a hard floor.

**Solver.** The solver is an event-driven marginal-utility path that widens one column at a time. The candidate widths for a column are the staircase steps of the cells covering it; for a spanning cell this is its next step minus its current width. It also has:

- **cut moves**, which widen all columns of a row's tied tallest cells together, because lowering a row needs all of them to drop;
- **span-aware upper bounds**, so a single column can finish a span on its own.

The path is built once, every column width is monotone in the available width, and a resize is a binary search on the path.

**Scrolling.** The *comfort width* D is the narrowest point of the path below which widening still buys more than scrolling costs. The table scrolls only when W < D, so column widths stay monotone. The scroll rate was calibrated on the dev set to the browser's own scroll rate (13.6% browser vs 14.5% ours).

`tb2-ls` is an optional per-width refinement: local search on the same objective. It is better per width but not monotone across widths.

## Evaluation

All metrics are measured on the real rendered DOM (`src/metrics.js`), never on the engine's own prediction. Comparisons hold content, font, padding, break rules, width and scroll constraint fixed. The `*-fit` variants never scroll voluntarily.

**Sets** (`data/`):

| Set | Contents | Written |
|---|---|---|
| plain dev / val | 27 / 18 Markdown tables, 12+ scripts | before tuning |
| struct dev / val | 11 / 10 tables with row headers, multi-level headers, rowspan/colspan, 2-D merges, RTL, same-text-in-two-roles controls, adversarial cases (⚑) | before tuning |
| val2 | 8 more tables | after the last algorithm change, before running it |

Every case is run at widths 320–960 px and font sizes 14/16.

**Metrics.** Short values on one line; intra-token and emergency breaks; term breaks; severe fragmentation; column-header and group-header single-line rate; header-row height; row-header wrap rate and the height row headers add; height and row-height P90/max relative to CSS; overflow; clipped spanning cells; grid-boundary errors; prediction agreement.

**AI visual review.** Claude judged real renders with method names hidden behind seeded random letters, scoring integrity, coherence, space use, structure and overall. Judgments are in `results/visual/**/judgments.json` and the unblinded results in `unblinded.json`. This is a model's visual judgement, not a human reading study.

## Results (Chromium; `results/summary.txt`)

**Structural validation set**, same no-scroll constraint:

| method | short 1-line | col header 1-line | group header 1-line | header height / CSS | table height / CSS |
|---|--:|--:|--:|--:|--:|
| browser `table-layout:auto` | 87.8% | 85.5% | 80.6% | 1.000 | 1.000 |
| min-height (same grid model) | 97.0% | 94.5% | 84.7% | 0.872 | 0.901 |
| **v2 path** | **98.0%** | **95.6%** | **86.1%** | **0.857** | 0.906 |

On every set, clipped spanning cells and grid-boundary errors are 0 for every method.

**val2, fresh held-out set:** v2 93.9% short values on one line vs browser 83.8% vs min-height 93.0%; height 0.926 vs 1.000 vs 0.925.

**Plain validation set:** v2 88.0% short values on one line vs browser 73.4% vs min-height 85.7%. Column headers stay on one line in 94.5% of v2 layouts vs 85.2% for the browser.

**Blind visual review**

- **Validation set, 16 tables, before the term floor existed:**
  - v2: best 11, worst 2
  - min-height: best 11, worst 4
  - browser: best 2, worst 12
  - v2's losses were mid-word header splits (`Enterpris|e`). Dev case `s-2d` showed the same problem (`Vaccinat|ions`), which led to the term floor.
  - Three composites were cropped by the screenshot tool. They were invalidated, regenerated and re-judged blind.
- **val2, 8 tables:**
  - min-height: best 6, worst 1
  - v2: best 3, worst 2
  - browser: best 1, worst 5
  - A follow-up showed the cause was the convex fragmentation term (`tb2-ls` reproduced v2's choices), not the greedy path. The term is now off by default, which dev renders (`zh-project`, `s-multihdr`) also supported. With it off, v2 produces the same layout as min-height on the val2 tables it lost. That re-check is post-hoc, not a new held-out result.

**Path vs per-width optimum** (same objective, exhaustive search where small): the greedy path is exactly optimal in 204 of 252 instances, with a mean excess of 1.3% and a worst of 32% (`v-th-lo`). Local search reaches the optimum in 250 of 252.

**Stability and speed**, resizing 300→1000 px:

| | excess column movement | column shrinks per step | time per layout |
|---|--:|--:|--:|
| v2 path | 0 px | 0 | ≈1 µs |
| min-height | 9.4 px per 10 px step | 0.80 | 0.33 ms |

For 1,000 rows × 5 columns: prepare 62 ms (55 ms is DOM measurement), path 31 ms (60 ms with spans), re-prepare after an edit 12 ms, query 0.4 µs.

## What did not work or remains open

- **Role weights matter less than expected.** Turning σ off changes the metrics by about 1 point. Most header behaviour comes out of the geometry: the header row height is on the longest path, and row headers sit in slack.
- **The convex fragmentation penalty** made narrow tables worse. It is off by default and kept as an ablation (`fragCost`).
- **Greedy prefix commitment.** At some widths the monotone path is worse than a per-width optimum: about 1.3% on average and 32% in the worst case. `tb2-ls` fixes this but jitters across widths.
- **Dictionary gaps.** Breaks inside words the ICU dictionary does not know, such as the Thai loanword ห้องดีลักซ์ in `w-th-colspan` or `毛利|率`, are invisible to term protection.
- **Scope of measurement and validation.** Only Chromium on macOS system fonts was measured. Rowspan height is the theoretical longest path; the browser distributes extra height its own way, so the metrics use the real DOM. Inline elements must not have horizontal padding (`table.css` fakes code padding with `box-shadow`). No human reading experiment was run.

## Run

```bash
npm install                    # playwright-core (project-local); uses Playwright's cached Chromium or CHROME_PATH
npm test                       # grid partition, staircase monotone, longest-path, path monotone/budget, path cost bookkeeping
npm run all                    # accuracy, experiment, gap, stability, perf → results/*.json + results/summary.txt
node bench/calibrate.mjs       # comfort-width scroll calibration (dev set only)
node bench/inspect.mjs s-2d 430 15 css-auto,min-height,tb2-fit   # side-by-side render + metrics
node bench/visual-batch.mjs val2                                  # blinded composites for review
open index.html                # demo (Markdown or HTML input, role switches, manual column resizing)
open eval.html                 # human evaluation: blind adjust → blind A/B → reveal
```

```js
const M = TableBadness.prepare(tableEl, { rowHeader: true });    // measure + grid model (width-independent)
const path = TableBadness.buildPath(M);                          // once
TableBadness.apply(tableEl, TableBadness.layout(M, path, availableWidthPx)); // per resize, ~µs
```

The prototype v1 (plain grids only) is kept in `src/v1/` as a baseline. The research skills from RESEARCH.md §7 are installed project-locally under `.claude/skills/` (git-ignored; pinned in `skills-lock.json`).
