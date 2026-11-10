# Soup · Technical report

**Verdict: SHIP for the Soup take-home.** The deployed design is a deterministic synthetic monitor. It provides evidence for a stop or continue decision without asserting that a numeric threshold should stop a run.

**Architecture and integrity.** React and TypeScript present a static catalog and independent uPlot charts. A dedicated worker generates and retains Float64 source columns, computes summaries, and transfers compact viewport frames. It sorts by step, keeps the final source row per duplicate step, and exposes conflicting discarded values. Stats describe finite retained readings. Expected missing slots are counted against each run’s sampling interval; NaN, signed infinities, missing cells, and log-excluded values have explicit breaks. One bucket per horizontal plot pixel keeps both extrema of each uninterrupted fragment and segment endpoints. No smoothing or viewport-boundary interpolation is used. Hover and keyboard inspection read the underlying retained row.

**Verification.** Node 22.23.2: TypeScript and production build passed locally, along with **13 Vitest and 15 Playwright tests**. The browser tests inspect canvas pixels for the million-point peak and the NaN gap. Unit tests preserve the peak in five width and viewport combinations and check bucket extrema across metrics. The first browser run found three failed assertions (focus, tiny axis tick density, and mobile overflow). All three were corrected and rerun. See [GitHub Actions](https://github.com/Ruslando123/soup_task/actions/workflows/verify.yml), [earlier command output](../performance/results/verification.txt), and [initial failures](../performance/results/first-browser-pass.md).

| Silent failure | Reproduced outcome |
| --- | --- |
| Stale snapshot / request race | Wrong catalog version rejected; two forced late run replies and one late zoom frame could not replace current results. Pending zoom explicitly labels the prior viewport. |
| Locale / time zone | Unit checks cover en-US, de-DE, fr-FR. Chrome records localized canvas labels and checks the exact raw readout. The source has no timestamps or time zone. |
| Smoothing / hidden spike | Pixel and raw-readout checks find the same 1,000 loss at step 500,123 at full range and after zoom. |
| Log zero | 480 true zeros are explicitly excluded from the learning-rate log path. Raw inspection still reports zero, and a viewport without positive values has an explicit state. |

**Performance.** Chrome 156.0.8078.81 on Apple M1, 1280 × 900, 4× CPU throttling on the page target. The timing comparison uses three cold trials per variant with the same fixture, chart renderer and input sequence. The first baseline predates the worker implementation. The paired comparison uses the final renderer. [Method and traces](../performance/README.md).

| 1M observations per metric | Full resolution | Worker + min/max |
| --- | ---: | ---: |
| Initial render, median | 585.7 ms | 332.3 ms |
| First drag zoom, median | 132.5 ms | 45.4 ms |
| Third drag zoom, median | 34.6 ms | 46.1 ms |
| Raw hover, median across 21 readings | 16.6 ms | 33.4 ms |
| Tab-attributed memory, median of five fresh sessions | 34.46 MiB | 34.87 MiB |
| Main renderer RSS at first ready checkpoint | 175.3 MiB | 185.0 MiB |
| Initial points in the Loss chart | 1,000,000 | 1,964 |

Chrome's page-memory API measured the full viewport after all three charts were ready and before interaction, in five fresh sessions per variant. It attributed 30.88 MiB to the dedicated worker in the optimized case. Tab-attributed memory increased by 0.42 MiB (1.2%). This is an estimate at a single checkpoint. The earlier RSS figures measure the renderer process and use a separate accounting method. [Raw memory readings](../performance/results/tab-memory.json).

**What surprised me and what still concerns me.** Keeping a few thousand measured vertices was enough to make the extreme spike obvious, yet a worker round trip carried a visible cost on the raw hover path. The optimized render wins are concentrated in the initial load and broad zooms. If real data has alternating valid and invalid readings, preserving every break can exceed the nominal frame budget. The tests also cannot establish whether a person notices a spike, how a screen reader presents the controls, or how other browser engines behave.

**Highest-priority remaining fix:** build a bounded rendering mode for very fragmented runs that displays missing coverage explicitly and keeps the raw inspector available. Verify its behavior with realistic corrupt-data patterns before adding live data.
