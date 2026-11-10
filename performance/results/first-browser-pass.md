# Browser verification during implementation

The first Chrome pass completed 12 tests: **9 passed, 3 failed**. The failures are listed here because a green final run alone would hide what the first run caught.

| Failing assertion | Observation | Resolution |
| --- | --- | --- |
| Back focuses the catalog heading | Chrome restored the skip link's fragment focus after the app's navigation handler. | Focus main explicitly for skip navigation without adding a fragment entry. Restore route heading focus after native history handling. |
| Tiny loss chart uses a localized fractional scientific tick | The 212 px chart drew integer mantissas only (`1E-14`, `2E-14`) at that spacing, so the browser assertion could not demonstrate the locale decimal separator. | Fit an additional set of readable ticks. The original check passed with the resulting fractional scientific label; exact readout and localized step checks also passed. |
| Mobile document width equals 390 px | Actual width was 685 px. The absolutely positioned accessible header label escaped the scroll wrapper. | Position the scroll wrapper and add a mobile scroll cue. The 390 px check and automated accessibility scan passed. |

An intermediate targeted rerun confirmed the width fix but still failed focus and axis checks. The next targeted run passed all four checks, including a new stale-viewport regression. The [original command output](verification.txt) records the complete successful rerun. See [GitHub Actions](https://github.com/Ruslando123/soup_task/actions/workflows/verify.yml) for the submission build.
