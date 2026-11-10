# AI usage

Codex generated the implementation, fixture definitions, UI, tests, and documentation in this workspace. It used npm, Vitest, Playwright, Chrome DevTools Protocol, and local Git and deployment tools. The source is intended to be read and defended in a technical review; no claim is made that the candidate wrote or manually tested the project unaided.

The accepted design used typed columns, a dedicated worker, uPlot, per-viewport min/max retention, and raw inspection independent of the rendered points. Mean-only sampling and smoothing were excluded because either could hide divergence. Workers were used for the million-row workload; a multiresolution index was deferred until there is evidence it is needed.

Checks executed by the tools include catalog regeneration, a production build, fixture and sampler tests, browser interactions, canvas pixel inspection, delayed worker replies, accessibility scans, and recorded Chrome traces. The first browser pass caught issues with mobile overflow and keyboard focus. The report distinguishes the measured results from behavior that was not tested. No benchmark was estimated from source code or invented.

Engineering judgment was needed to choose which records define truth: the last source row wins, but conflicting discarded values remain accessible; gaps are inferred from the sampling contract rather than raw step differences. The separate raw inspector and visible exact extrema are intentional because a sampled line alone cannot answer every question about the original signal. The decision to stop a real training run remains with the engineer.
