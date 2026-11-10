const cache = new Map<string, Intl.NumberFormat>()
function numberFormat(locale: string, notation: 'standard' | 'scientific', digits: number) {
  const key = [locale, notation, digits].join(':')
  let formatter = cache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { notation, maximumSignificantDigits: digits, useGrouping: notation === 'standard' })
    cache.set(key, formatter)
  }
  return formatter
}

export function metricValue(value: number, locale = 'en-US', exact = true) {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const notation = abs !== 0 && (abs < .001 || abs >= 1e7) ? 'scientific' : 'standard'
  return numberFormat(locale, notation, exact ? 21 : 6).format(value === 0 ? 0 : value)
}

export function countValue(value: number, locale = 'en-US') {
  return numberFormat(locale, 'standard', 21).format(value)
}
