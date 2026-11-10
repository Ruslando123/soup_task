import { writeFileSync } from 'node:fs'
import { RUNS, VERSION } from '../src/data/generate.ts'
import { makeCatalogRow } from '../src/data/catalogFixture.ts'
const runs = RUNS.map(makeCatalogRow)
writeFileSync(new URL('../public/catalog.json', import.meta.url), JSON.stringify({ version: VERSION, runs }) + '\n')
