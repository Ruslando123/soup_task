# Chrome performance evidence

This benchmark isolates the three-chart workload using the same generator, normalizer, uPlot renderer, 1M-point fixture, chart sizes and input sequence in both modes. The full-resolution baseline generates and normalizes on the page and gives uPlot every visible row. The optimized fixture uses the same worker and sampler as the app. The benchmark does not include catalog navigation, React layout, or network transit to Vercel. The baseline entry is not part of the application build.

## Reproduce

Install Node 22 dependencies and Google Chrome. Run the commands sequentially on an otherwise quiet machine. The runner defaults to three independent headless Chrome sessions per variant and records the first session as a trace.

```sh
npm ci
npx vite build --config vite.benchmark.config.ts
npm run benchmark -- baseline
npm run benchmark -- optimized
```

The runner sets the **page target** to 4× with [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate). It does not independently throttle the worker target. Both variants use a 1280 × 900 viewport at DPR 1 with three 1100 × 180 charts. It uses Chrome native mouse input for three consecutive centered drag zooms (23%–77% of the chart) and seven hover positions after zooming.

- **Initial:** navigation to all three charts constructed and a subsequent paint opportunity (two animation frames).
- **Zoom:** selection callback to a paint opportunity for the three new charts. Report the first drag across trials and retain all three timings in JSON.
- **Hover:** cursor callback to raw value committed and a paint opportunity. Report the median across seven positions × three trials. This includes frame scheduling, so it is not CPU handler time.
- **Renderer RSS:** the original timing runner also records renderer RSS from `ps` when all three charts are initially ready. The first trial identifies the renderer PID from its trace. These raw files retain the separate `JSHeapUsedSize` and the empty page-memory readings from those runs.

Open Chrome DevTools → **Performance** → **Load profile** and select the `.trace.json.gz` file (decompress first if necessary). Search for `bench:initial work`, `bench:zoom`, and `bench:hover` in the Timings track.

The pre-optimization capture was taken before the sampler and worker existed. The paired results use the final renderer in both variants, including the same axis tick spacing. See the [report](../docs/technical-report.md) for comparisons.

## Measure tab memory

After building the same fixture, run:

```sh
node performance/tab-memory.mjs
```

The runner alternates the variant order across five pairs. Each reading uses a fresh headless Chrome session with one page, the same viewport and page-target throttling, and a cross-origin isolated local fixture. It measures the full domain when all three charts are ready, before zoom or hover. The Chrome launch flag `ForceEagerMeasureMemory` triggers a prompt measurement at garbage collection. This is a separate run from the timing traces. [Chrome memory measurement documentation](https://web.dev/articles/monitor-total-page-memory-usage).

The report uses the median of Chrome's `performance.measureUserAgentSpecificMemory()` estimates. The breakdown attributes memory to the page and its dedicated worker and includes Canvas and DOM allocations where Chrome reports them. It does not cover whole-browser OS memory or peak usage. All ten raw readings and their attributions are in [tab-memory.json](results/tab-memory.json).
