# Soup · AI Training Run Monitor

Soup is a frontend take-home for the Soup Frontend Engineer Internship. It lets an ML engineer compare simulated training runs and inspect evidence that could inform a stop or continue decision. The 20 fixtures are deterministic, use a fixed seed, and contain no live telemetry, timestamps, or actual training costs.

The million-point fixture contains one loss of **1,000 at step 500,123**. Select **Open demo run** in the catalog, check the full range, select **Peak**, and enter `500123` in the Loss inspector. For a deliberately corrupted run, try **Boreal / NaN** or **Delta / missing range**. The **Linear / Logarithmic** switch on **Delta / zero rate** demonstrates why raw zeros must remain inspectable.

## Run locally

Use Node.js 22.18+ in the Node 22 line and npm. The browser requires Canvas, module Web Workers, ResizeObserver, and modern Intl support.

```sh
nvm use
npm ci
npm run dev
```

Open `/#runs` for the workspace. Use project and status filters, or select two to four runs and choose **Compare**. Use the avatar menu to change number formatting or filter by data quality.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

With Google Chrome already installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`. The browser suite runs against `dist`; set `APP_URL` to test a deployment instead. `npm run catalog` regenerates the checked-in catalog. Change `VERSION` when changing the fixtures or their published sampling contract.

## Architecture and data contract

- `src/data` generates columnar Float64 fixtures, normalizes source rows, computes exact retained statistics, and samples a visible range. `public/catalog.json` contains generated summaries and compact loss previews. The project labels, planned step counts and spend are illustrative fixture metadata. A test compares the catalog against every generated run.
- `src/workers` owns the currently open run's columns. The worker transfers compact frames to the browser and resolves exact raw inspection by binary search. The app uses a new worker for each route, cancels old work on navigation, and commits only replies for the current request. While zoom or scale changes are pending, the plot labels the viewport still on display.
- `src/features/runs` implements the catalog and detail views. The uPlot canvas uses straight lines and explicit breaks. DOM text exposes the committed viewport, exact visible extrema, scale exclusions, and the raw reading; screen readers do not have to interpret the canvas. Each chart has an independent viewport.
- Sort by step and source index. The final original row at each step wins, even if its value is invalid. Discarded conflicting readings remain visible with source row numbers. All summary statistics and chart extrema describe **retained rows**. “Steps” is the number of distinct observed steps; the source row count and numeric step domain are shown separately.
- The expected sampling grid starts at the first retained step and advances by the configured interval. Count grid slots strictly between observed steps. Extra off-grid rows are flagged. The monitor cannot infer missing measurements before the first or after the last observation. Anomaly counts sum invalid metric cells, discarded rows, source order reversals, missing expected steps and off-grid rows; overlapping categories may refer to one row. Conflicts are a subset of discarded rows. A real spike is signal evidence and does not increment the integrity count.
- NaN, both infinities, and explicit missing measurements are separate inspection states. None participates in extrema or is converted to zero. Log scale treats zero and negatives as breaks with a count and a raw readout. Axes and summary cards use compact locale formatting; visible extrema, title text, and raw inspection use round-trip precision.

### Why the spike survives

Binary search selects rows inside the viewport. If they fit the render budget, the sampler keeps every plottable row. Otherwise it divides the visible step domain into buckets based on chart width. For each uninterrupted fragment of each bucket it keeps the original min and max, in chronological order. The first and last values of every continuous segment are also kept. Null markers keep invalid rows, absent expected measurements, and log exclusions from being connected. Isolated valid points are drawn as dots. The exact visible extrema also control the vertical scale.

A sampled polyline does not represent every change within a pixel. The raw inspector never reads sampled vertices: it uses the retained observations, labels a nearest recorded step when appropriate, and reports a known gap instead of jumping across it. Focus the plot and use arrows, Shift+arrow, Home, or End; use the step field to reach an exact step without dragging. Use the zoom buttons or drag a selection, then reset to the full range.

## Verification and deployment

- [Live demo](https://soup-training-run-monitor.vercel.app/#runs) · [GitHub Actions results](https://github.com/Ruslando123/soup_task/actions/workflows/verify.yml)
- [Technical report](docs/technical-report.md) · [AI usage](docs/ai-usage.md) · [Benchmark procedure](performance/README.md)
- [Performance traces and raw results](performance/results/) · [Initial browser failures and fixes](performance/results/first-browser-pass.md)
- `.github/workflows/verify.yml` runs the audit, unit tests, build, and Playwright on pushes and pull requests.
- `vercel.json` uses Vite's static output, rewrites run deep links, and revalidates the catalog. No environment variables or backend are needed.

## Known limits

This is a static synthetic monitor with no ingest, live freshness SLA, checkpoint control, or stop action. The sampler scans visible rows per chart and uses extra output for every distinct break, so extremely fragmented data can exceed the nominal sample budget. Internal transforms work on retained observations and do not interpolate across the visible boundary. Mouse drag and keyboard controls are supported; use the buttons for touch zoom. Browser checks and automated accessibility scans do not establish screen reader usability or performance on other devices.
