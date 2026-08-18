import { describe, expect, it } from 'vitest'
import { calculatePercentile } from './usePerformanceTest'

describe('performance calculations', () => {
  it('calculates a median percentile from raw samples', () => {
    expect(calculatePercentile([10, 20, 30, 40, 50], 50)).toBe(30)
  })

  it('calculates a higher percentile from unsorted samples', () => {
    const values = [100, 200, 50, 400, 300, 150]
    expect(calculatePercentile(values, 90)).toBeGreaterThan(300)
    expect(calculatePercentile(values, 90)).toBeLessThanOrEqual(400)
  })
})
