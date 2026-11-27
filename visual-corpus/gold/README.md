# Gold Reference Corpus (`gold-v1`)

A smaller, deeper companion to the [Visual Reference Corpus](../README.md). It aims at the **quality ceiling** of column-width layouts and at the **shape of visual quality around good layouts**, not at size. No layout algorithm of this project (v1, v2, min-height, any Table Badness score) generates, selects or scores anything here. Neutral baselines only appear, anonymised, in blind comparisons.

Research brief: the "黄金视觉参考集研究" task, building on [`../../VISUAL_RESEARCH.md`](../../VISUAL_RESEARCH.md).

**Model:** `codex/gpt-6.1-terra` through Pi, thinking `medium`, for every design, analysis, synthesis and review call. There is no fallback model (`tools/run.sh` sets `VC_MODELS` to this one model only). Model input images are sent at full size (`VC_SCALE=1`) because legibility is audited. Every call is a fresh, tool-less, session-less context. Its prompt, images and raw reply are kept in `runs/<scenario>/log-*.json`, and every record lists the model, thinking level and image scale of each step.

## Layout

```
manifest.json                 selected scenarios: inherited split, selection reason, coverage tags
tables/real-src.mjs           7 real-document tables (verbatim excerpts, source URL, licence, edits)
tables/<family>.json          table of every selected family
runs/<scenario>/              resumable state, every prompt / raw reply, every render
corpus/<split>/<id>.json      one record per scenario (schema below) + img/ screenshots
corpus/holdout/FROZEN.json    sha256 of every holdout file + render conditions
corpus/index.json             index + aggregate facts
corpus/audit.json             fresh-render audit of every record
viewer/index.html             interactive browser (open locally; screenshots load from ../corpus)
```

## Selection (`tools/select.mjs`)

The corpus has 60 scenarios. Coverage is chosen greedily over tags:
- structure, derived from the markup: multi-level headers, row headers, colspan, rowspan, 2-D spans, section rows, crosstab;
- script: Chinese, Japanese, Korean, RTL, Indic, Southeast Asian, other Latin;
- spatial pressure: loose, medium, tight, extreme, scroll;
- content: numeric, long text, code, dates, short labels;
- failures (`rejected` / `contested`) in the earlier Visual Corpus, favoured.

Two scenarios are always included:
- `x-w-gov` at two widths, the named counterexample in `VISUAL_RESEARCH.md` §1;
- every real-document table.

**Splits are inherited by family, never by scenario.**

| Gold split | From | Why |
|---|---|---|
| research | Visual-Corpus research families | these tables were used while developing the algorithms, so they can never be an independent test |
| validation | Visual-Corpus validation families + 4 real-document families | |
| holdout | Visual-Corpus holdout families + 3 real-document families | frozen after the build, before any algorithm runs |

**Real-document tables** come from Wikipedia (zh, en, ja), Unicode UAX #14 and the Python documentation. The source URL, licence and any excerpting are recorded per table. They reduce the bias of a corpus written entirely by a model.

## Pipeline per scenario (`tools/gold.mjs`)

1. **Three independent designers.** Each runs in its own contexts, with no access to the other designers, the earlier corpus or any algorithm. Each starts from a different angle:
   - the reader's tasks;
   - space and proportion;
   - content and roles.

   Each designer first writes down an understanding of the table:
   - purpose and tasks;
   - relations and roles;
   - what must stay whole and what may wrap;
   - which elements share a scale;
   - the horizontal vs vertical trade-off.

   It then proposes three different spatial strategies. Every design is rendered in Chromium and the screenshots go back to the designer. It critiques the renders, naming each fault and its cause, and revises. At least one revision is required. The designer stops when it declares no meaningful improvement left, after 5 rounds, or when it only proposes duplicates.
2. **Synthesis.** A fresh context sees all designers' finalists, anonymised and shuffled. For each one it analyses strengths, faults and spatial logic. It may combine designs, propose new ones or overturn all of them, and its new designs go through the same render → critique loop. It ends by choosing:
   - finalists, acceptable and bad layouts;
   - a deliberately flawed "contrast" layout;
   - same-function column groups;
   - rationale, candidate principles, trade-offs and open questions.
3. **Blind acceptance.** Three fresh reviewers rate every candidate, each in a different random order. The pool contains:
   - the synthesis finalists;
   - each designer's best layout;
   - the earlier Visual-Corpus preferred layout;
   - the contrast layout;
   - the browser's `table-layout:auto`;
   - equal widths.

   Identical layouts are merged and recorded as aliases. Reviewers do not know any origin. Each layout gets a grade (excellent…bad), a 0–100 score, 1–5 on six levels (correctness, readability, function, order, rhythm, aesthetics) and a reason.
4. **Quality landscape.** Around the best layout, `explored` lists 60–250 width changes, all measured in the browser with the total width kept:
   - transfers between adjacent columns;
   - equalising or skewing same-function groups;
   - row header vs body;
   - random redistributions;
   - a per-column search for the smallest transfer that changes any line count (`sensitivity`).

   Up to 14 research-relevant variants are rendered and rated blind with the reference hidden among them, 2 reviewers per batch of 7:
   - *metric twins*: identical line breaks, height and width, where only white space moves;
   - *near twins*: same line counts and height, different break positions;
   - the two sides of the most fragile column's *critical point*;
   - group and row-header changes;
   - adjacent transfers with and without line changes.

   `Δ` is the variant's score minus the reference's score from the same reviewer.

Hard constraints are enforced by code: column count, minimum width, and the width budget for `fit` scenarios. Only column widths vary. Content, font, size, padding, borders, colours and alignment are identical everywhere. For `scroll-allowed` scenarios:
- fitting and scrolling layouts are judged as separate classes;
- every scrolling layout also has a *viewport view* showing what is visible at first sight.

**Labels (per class).**
- `gold`: median grade ≥ good, at least 2 of 3 reviewers ≥ good, and a mean score within 5 points of the best in its class.
- `good`: the same without the score condition.
- `acceptable`: median ≥ acceptable.
- `bad`: median ≤ poor.

**Scenario status.**
- `gold`: a designed layout is gold.
- `contested`: something got a good vote with median ≥ acceptable.
- `unresolved`: otherwise.

There are no re-reviews, and there is no retrying until a verdict looks better.

## Three layers of evidence

| Layer | Source | Fields |
|---|---|---|
| geometry facts | browser measurement | column widths, row heights, table size, overflow, per-cell line boxes (`lineInfo`: text, width, x, break kind), measured intra-word breaks |
| visual judgement | blind reviews only | grades, scores, dimension scores, reasons, best, "indistinguishable" groups |
| semantic understanding | designers / synthesis | understanding, critiques, rationale, principles, same-function groups |

A model's statement never overrides a measurement. The audit flags reviewer text that claims clipping or scrolling where none was measured.

## Record schema (`corpus/<split>/<id>.json`)

| Field | Contents |
|---|---|
| `version`, `split`, `inheritedSplit`, `origin`, `selection` | data version, split provenance, why it was chosen |
| `status`, `primaryClass`, `top`, `topOrigin`, `gold`, `byClass` | verdict |
| `table`, `conditions` | content (HTML/Markdown, language, source, licence, edits), width, font size, policy, budget, CSS, browser |
| `candidates[]` | label, origin, geometry (incl. `lineInfo`), `review` (grades, scores, dims, reasons, best votes), `screenshot`, `viewport` |
| `landscape` | `ref`, `sensitivity`, `explored` (all measured variants), `variants[]` (geometry, `sameLinesAsRef`, `sameHeightAsRef`, `l1FromRef`, per-reviewer ratings and Δ, screenshot) |
| `understanding`, `synthesis`, `designHistory`, `designs` | the full design process: every design ever rendered, with geometry |
| `reviews` | raw acceptance and landscape reviews, mapped back to layout names |
| `provenance` | per-call model / thinking / image scale, Pi version, call count |

To reproduce a layout, render `table` at `conditions` with `<colgroup>` = `requestedWidths` and `table-layout:fixed`. `../tools/render.mjs` does exactly this. `requestedWidths: null` means the browser's auto layout.

## Run

```bash
sh gold/tools/run.sh                    # all scenarios, resumable (JOBS=5); stops on quota, re-run to continue
node gold/tools/finalize.mjs            # records + screenshots (never overwrites frozen holdout records)
node gold/tools/audit.mjs               # fresh-render audit → corpus/audit.json
node gold/tools/index.mjs               # index + aggregate facts
node gold/tools/freeze.mjs              # freeze holdout (then --verify; --append for later records)
node gold/tools/build-viewer.mjs        # viewer/index.html
```

## Limits

- **Same-model review.** Designers, synthesis and reviewers are the same model. Fresh contexts give only limited independence. This is neither cross-model validation nor a human aesthetic or reading study; the labels are reviewable design references, not aesthetic ground truth.
- **Screenshot conditions.** Only Chromium with macOS system fonts at device scale 1 was used. The live viewer re-renders in the viewer's own fonts, so it can differ slightly from the measured geometry.
- **Coarse grades.** Fine differences rest on the 0–100 scores, which the reviewers use consistently but which are not calibrated across scenarios.
- **Unsampled landscape.** The landscape is sampled where it is informative, not exhaustively.
