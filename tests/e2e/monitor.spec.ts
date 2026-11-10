import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { generate } from '../../src/data/generate'
import { metricValue } from '../../src/data/format'

const loss = (page: Page) => page.getByRole('region', { name: 'Loss', exact: true })
const catalog = (page: Page) => page.getByRole('table')
const inspect = async (page: Page, title: string, step: number) => {
  await page.getByRole('spinbutton', { name: `${title} step to inspect` }).fill(String(step))
  await page.getByRole('region', { name: title, exact: true }).getByRole('button', { name: 'Inspect', exact: true }).click()
}

test('the catalog links to the demo run and keeps the sidebar focused on training runs', async ({ page }) => {
  await page.goto('/')
  const workspace = page.getByRole('navigation', { name: 'Workspace', exact: true })
  await expect(workspace.locator('.workspace-nav-item')).toHaveCount(1)
  await expect(workspace.getByRole('link', { name: 'Training runs' })).toBeVisible()
  await expect(page.getByText('These runs use simulated data.', { exact: false })).toBeVisible()
  const sample = page.getByRole('button', { name: 'View sample CSV' })
  await sample.click()
  const dialog = page.getByRole('dialog', { name: 'Sample training CSV' })
  await expect(dialog).toContainText('step,loss,lr,grad_norm')
  await page.keyboard.press('Escape')
  await expect(sample).toBeFocused()

  await page.getByRole('link', { name: 'Open demo run' }).click()
  await expect(page).toHaveURL(/\/runs\/million$/)
  await expect(loss(page)).toBeVisible()
  await page.getByRole('link', { name: 'All training runs' }).click()
  await expect(page.getByRole('link', { name: 'Open demo run' })).toBeVisible()
})

test('search, combine filters, and reset an empty result', async ({ page }) => {
  await page.goto('/')
  await expect(catalog(page).locator('tbody tr')).toHaveCount(20)
  await page.getByLabel('Filter by status').selectOption('Failed')
  await page.getByRole('button', { name: /Open workspace settings/ }).click()
  await page.getByLabel('Filter by data quality').selectOption('flagged')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(catalog(page).locator('tbody tr')).toHaveCount(4)
  await page.getByRole('searchbox', { name: 'Search runs' }).fill('cinder')
  await expect(catalog(page).locator('tbody tr')).toHaveCount(2)
  await page.getByRole('searchbox').fill('there is no such run')
  await expect(page.getByRole('heading', { name: 'No matching runs' })).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(catalog(page).locator('tbody tr')).toHaveCount(20)
})

test('sorts steps and latest loss numerically and leaves unavailable loss last', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Progress (steps)', exact: true }).click()
  await expect(catalog(page).locator('tbody tr').first()).toContainText('Grove / million-step')
  await page.getByRole('button', { name: 'Progress (steps)', exact: true }).click()
  await expect(catalog(page).locator('tbody tr').first()).toContainText('Grove / queued')
  await page.getByRole('button', { name: 'Latest loss', exact: true }).click()
  await expect(catalog(page).locator('tbody tr').first()).toContainText('Atlas / divergence')
  await expect(catalog(page).locator('tbody tr').last()).toContainText('Grove / queued')
  await page.getByRole('button', { name: 'Latest loss', exact: true }).click()
  await expect(catalog(page).locator('tbody tr').first()).toContainText('Ember / small signal')
  await expect(catalog(page).locator('tbody tr').last()).toContainText('Grove / queued')
})

test('catalog loading, HTTP error, retry, and mismatched snapshot', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let requests = 0
  await page.route('**/catalog.json', async route => {
    requests++
    if (requests === 1) { await gate; await route.fulfill({ status: 503, body: 'Unavailable' }) }
    else if (requests === 2) { await route.fulfill({ json: { version: 'stale-v0', runs: [] } }) }
    else await route.continue()
  })
  await page.goto('/')
  await expect(page.getByText('Loading training runs…')).toBeVisible()
  release()
  await expect(page.getByRole('alert')).toContainText('HTTP 503')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert')).toContainText('different dataset version')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(catalog(page).locator('tbody tr')).toHaveCount(20)
  await expect(page.getByText('Static snapshot', { exact: true })).toBeVisible()
})

test('keyboard opens an empty run, moves focus, and returns to the catalog', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  const link = page.getByRole('link', { name: 'Grove / queued', exact: true })
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/runs\/empty$/)
  await expect(page.getByRole('heading', { name: 'Grove / queued' })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'No observations yet' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Training runs' })).toBeFocused()
  await expect(catalog(page)).toBeVisible()
})

test('a worker startup error is recoverable without displaying old data', async ({ page }) => {
  const pattern = '**/assets/run.worker-*.js'
  await page.route(pattern, route => route.abort())
  await page.goto('/runs/healthy')
  await expect(page.getByRole('alert')).toContainText('worker could not start')
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.unroute(pattern)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('canvas')).toHaveCount(3)
})

test('late replies from previous runs cannot replace the current run', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker
    let number = 0
    class DelayedWorker extends Original {
      private sequence = ++number
      override set onmessage(listener: Worker['onmessage']) {
        const sequence = this.sequence
        super.onmessage = event => {
          if (sequence > 2 || !event.data?.result?.version) { listener?.call(this, event); return }
          document.documentElement.dataset[`held${sequence}`] = 'true'
          setTimeout(() => {
            document.documentElement.dataset[`delivered${sequence}`] = 'true'
            listener?.call(this, event)
          }, 1800)
        }
      }
    }
    window.Worker = DelayedWorker
  })
  await page.goto('/runs/healthy')
  await expect(page.getByText('Loading observations for Atlas / baseline…')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-held1', 'true')
  await page.getByRole('link', { name: 'Next run: Atlas / divergence' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-held2', 'true')
  await page.getByRole('link', { name: 'Next run: Atlas / oscillation' }).click()
  await expect(page.getByRole('heading', { name: 'Atlas / oscillation' })).toBeVisible()
  await expect(loss(page)).toContainText('Full resolution')
  const current = await loss(page).locator('.chart-extrema').textContent()
  await expect(page.locator('html')).toHaveAttribute('data-delivered1', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-delivered2', 'true')
  await expect(page.getByRole('heading', { name: 'Atlas / oscillation' })).toBeVisible()
  await expect(loss(page).locator('.chart-extrema')).toHaveText(current!)
  await expect(page.getByText('Oscillating loss', { exact: true })).toBeVisible()
})

async function lossPixels(page: Page, [from, to]: [number, number], topFraction = 1) {
  return loss(page).locator('.plot-host').evaluate((node, { from, to, topFraction }) => {
    const canvas = node.querySelector('canvas')!, over = node.querySelector<HTMLElement>('.u-over')!
    const ratio = canvas.width / canvas.clientWidth
    const x = Math.floor((over.offsetLeft + over.clientWidth * from) * ratio)
    const y = Math.floor(over.offsetTop * ratio)
    const width = Math.max(1, Math.floor(over.clientWidth * (to - from) * ratio))
    const height = Math.max(1, Math.floor(over.clientHeight * topFraction * ratio))
    const pixels = canvas.getContext('2d')!.getImageData(x, y, width, height).data
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]! > 150 && pixels[i]! > pixels[i + 1]! * 1.35 && pixels[i + 1]! > pixels[i + 2]! * 1.15 && pixels[i + 3]! > 120) count++
    }
    return count
  }, { from, to, topFraction })
}

test('canvas retains the million-point spike at full range and after zoom; inspection reads exact raw values', async ({ page }) => {
  await page.goto('/runs/million')
  await expect(page.getByText('1,000,000', { exact: true }).first()).toBeVisible()
  await expect(loss(page)).toContainText(/Downsampled · [\d,]+ of 1,000,000 plottable values/)
  await expect(loss(page).locator('.chart-extrema')).toContainText('to 1,000')
  await expect.poll(() => lossPixels(page, [.48, .52], .23)).toBeGreaterThan(0)
  const unchanged = await page.getByTestId('range-lr').innerText()
  await loss(page).getByRole('button', { name: 'Zoom to Loss peak' }).click()
  await expect(page.getByTestId('range-loss')).toHaveText('Steps 490,123–510,123')
  await expect(page.getByTestId('range-lr')).toHaveText(unchanged)
  await expect.poll(() => lossPixels(page, [.48, .52], .23)).toBeGreaterThan(0)
  await inspect(page, 'Loss', 500_123)
  await expect(page.getByTestId('reading-loss')).toHaveText('Step 500,123 · 1,000')
  await loss(page).getByRole('button', { name: 'Reset Loss zoom' }).click()
  await expect(page.getByTestId('range-loss')).toHaveText('Steps 1–1,000,000')
  const group = loss(page).getByRole('group', { name: 'Loss plot' })
  await group.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('reading-loss')).toHaveText(`Step 2 · ${metricValue(generate('million').values.loss[1]!)}`)
})

test('canvas leaves invalid values disconnected, and mouse hover reports the invalid reason', async ({ page }) => {
  await page.goto('/runs/nan')
  await expect(loss(page)).toContainText('1 break in view')
  const over = await loss(page).locator('.u-over').boundingBox()
  if (!over) throw new Error('Loss canvas not found')
  await page.mouse.move(over.x + over.width * ((477 - 1) / 1199), over.y + 32)
  await expect(page.getByTestId('reading-loss')).toContainText('NaN (invalid)')
  expect(await lossPixels(page, [.389, .405])).toBe(0)
  expect(await lossPixels(page, [.31, .36])).toBeGreaterThan(0)
  expect(await lossPixels(page, [.43, .47])).toBeGreaterThan(0)
})

test('drag zoom updates the rendered step domain and known missing ranges stay inspectable', async ({ page }) => {
  await page.goto('/runs/missing')
  await expect(loss(page)).toContainText('2 breaks in view')
  const over = await loss(page).locator('.u-over').boundingBox()
  if (!over) throw new Error('Loss canvas not found')
  await page.mouse.move(over.x + over.width * .15, over.y + 45)
  await page.mouse.down()
  await page.mouse.move(over.x + over.width * .42, over.y + 45)
  await page.mouse.up()
  await expect(page.getByTestId('range-loss')).not.toHaveText('Steps 10–14,100')
  await expect(page.getByTestId('range-lr')).toHaveText('Steps 10–14,100')
  await inspect(page, 'Loss', 3300)
  await expect(page.getByTestId('reading-loss')).toHaveText('Step 3,300 · Missing between steps 3,000 and 3,710')
})

test('zero remains inspectable on log scale and no-positive viewport is explicit', async ({ page }) => {
  await page.goto('/runs/zero-lr')
  const rate = page.getByRole('region', { name: 'Learning rate', exact: true })
  await expect(rate).toContainText('Full resolution · 1,200 values')
  await page.getByLabel('Learning rate scale').selectOption('log')
  await expect(rate).toContainText('480 zero or negative readings excluded on log scale')
  await expect(rate).toContainText('1 break in view')
  const plot = rate.getByRole('group', { name: 'Learning rate plot' })
  await plot.focus()
  await page.keyboard.press('End')
  await expect(page.getByTestId('reading-lr')).toHaveText('Step 1,200 · 0')
  const over = await rate.locator('.u-over').boundingBox()
  if (!over) throw new Error('Rate canvas not found')
  await rate.scrollIntoViewIfNeeded()
  const rect = (await rate.locator('.u-over').boundingBox())!
  await page.mouse.move(rect.x + rect.width * .77, rect.y + 42)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width * .96, rect.y + 42)
  await page.mouse.up()
  await expect(rate.getByText('No positive measurements in view')).toBeVisible()
  await expect(rate).toContainText('Full resolution · 0 values')
  await page.getByLabel('Learning rate scale').selectOption('linear')
  await expect(rate.getByText('No positive measurements in view')).toHaveCount(0)
  await expect(rate.locator('.chart-extrema')).toHaveText('Visible range: 0 to 0')
})

test('actual canvas axis labels and exact readout preserve tiny numbers after a locale change', async ({ page }) => {
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth?) {
      if (this.canvas.isConnected) this.canvas.dataset.labels = `${this.canvas.dataset.labels || ''}|${text}`
      if (maxWidth === undefined) return fill.call(this, text, x, y)
      return fill.call(this, text, x, y, maxWidth)
    }
  })
  await page.goto('/runs/tiny')
  const canvas = loss(page).locator('canvas')
  await expect(canvas).toHaveAttribute('data-labels', /E-1[45]/)
  const expected = generate('tiny').values.loss[0]!
  await inspect(page, 'Loss', 1)
  await expect(page.getByTestId('reading-loss')).toHaveText(`Step 1 · ${metricValue(expected, 'en-US')}`)
  await page.getByRole('button', { name: /Open workspace settings/ }).click()
  await page.getByLabel('Number format locale').selectOption('de-DE')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-labels', /\d,\d+E-1[45]/)
  await expect(page.getByTestId('reading-loss')).toHaveText(`Step 1 · ${metricValue(expected, 'de-DE')}`)
  await expect(page.getByTestId('range-loss')).toHaveText('Steps 1–1.200')
})

test('mobile layout stays within viewport and passes automated accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(catalog(page)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('link', { name: 'Cinder / duplicate steps', exact: true }).click()
  await expect(loss(page).locator('.chart-extrema')).toContainText('to 12')
  await page.getByText('Inspect discarded values').click()
  await expect(page.getByText(/Step 502 · row 502 → row 503/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('pending zoom is labelled and a late frame cannot replace a newer viewport', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker
    class GateWorker extends Original {
      override set onmessage(listener: Worker['onmessage']) {
        super.onmessage = event => {
          const root = document.documentElement
          if (root.dataset.holdFrame === 'true' && event.data?.result?.x) {
            delete root.dataset.holdFrame
            root.dataset.frameHeld = 'true'
            const onRelease = () => {
              listener?.call(this, event)
              root.dataset.frameReleased = 'true'
            }
            window.addEventListener('release-test-frame', onRelease, { once: true })
            return
          }
          listener?.call(this, event)
        }
      }
    }
    window.Worker = GateWorker
  })
  await page.goto('/runs/spike')
  await expect(page.locator('canvas')).toHaveCount(3)
  await page.evaluate(() => { document.documentElement.dataset.holdFrame = 'true' })
  await loss(page).getByRole('button', { name: 'Zoom to Loss peak' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-frame-held', 'true')
  await expect(loss(page)).toContainText('Updating chart; previous viewport is still shown.')
  await expect(page.getByTestId('range-loss')).toHaveText('Steps 1–1,200')
  await loss(page).getByRole('button', { name: 'Zoom in on Loss' }).click()
  await expect(page.getByTestId('range-loss')).toHaveText('Steps 300–901')
  await page.evaluate(() => window.dispatchEvent(new Event('release-test-frame')))
  await expect(page.locator('html')).toHaveAttribute('data-frame-released', 'true')
  await expect(page.getByTestId('range-loss')).toHaveText('Steps 300–901')
  await expect(loss(page)).not.toContainText('previous viewport')
})


test('the Pencil workspace hash route supports project filters and comparing exact run summaries', async ({ page }) => {
  await page.goto('/#runs')
  await expect(catalog(page).locator('tbody tr')).toHaveCount(20)
  await page.getByRole('navigation', { name: 'Filter by project' }).getByRole('button', { name: /Foundation models/ }).click()
  await expect(catalog(page).locator('tbody tr')).toHaveCount(5)
  await page.getByRole('checkbox', { name: 'Compare Grove / million-step', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Compare Atlas / baseline', exact: true }).check()
  await page.getByRole('button', { name: 'Compare (2)', exact: true }).click()
  const comparison = page.getByRole('dialog', { name: 'Compare runs' })
  await expect(comparison).toContainText('Grove / million-step')
  await expect(comparison).toContainText('Atlas / baseline')
  await expect(comparison.getByText('1,000', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(comparison).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Compare (2)', exact: true })).toBeFocused()
  await page.getByRole('link', { name: 'Grove / million-step', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/million$/)
  await page.getByRole('link', { name: 'All training runs' }).click()
  await expect(page).toHaveURL(/\/#runs$/)
})
