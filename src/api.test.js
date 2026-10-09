import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset, getSelection, sumAvailableCounts, fetchDashboard } from './api.js';

function dataset() {
  return {
    cities: ['City'], years: ['2026'],
    records: [{ city: 'City', period: '2026', month: 'January', total: 10, booked: 5, procedure: 1 }],
    sheets: [{ city: 'City', headers: ['Year', 'Month', 'ICSI', 'OD-ICSI'], rows: [['2026', 'January', '1,200', '-']] }]
  };
}

test('rejects empty reporting records and cities without records', () => {
  const data = dataset();
  data.records = [];
  assert.throws(() => validateDataset(data), /missing city, year, or sheet data/);
  const other = dataset();
  other.cities.push('Empty city');
  other.sheets.push({ city: 'Empty city', headers: ['Year', 'Month'], rows: [] });
  assert.throws(() => validateDataset(other), /No reporting data found for Empty city/);
});

test('validates both procedure counts in API records', () => {
  for (const key of ['icsi', 'odIcsi']) {
    for (const value of [-20, 1.5, Infinity, 'bad']) {
      const data = dataset();
      data.records[0][key] = value;
      assert.throws(() => validateDataset(data), /Invalid .* count/);
    }
  }
});

test('rejects invalid displayed procedure counts before selection', () => {
  for (const column of [2, 3]) {
    for (const value of ['-20', '1.5', 'Infinity', 'bad']) {
      const data = dataset();
      data.sheets[0].rows[0][column] = value;
      assert.throws(() => validateDataset(data), /Invalid .* count/);
    }
  }
});

test('keeps comma formatted counts and blank or dash counts supported', () => {
  const data = validateDataset(dataset());
  assert.equal(getSelection(data, 'City', '2026', 'All').totals.icsi, 1200);
  assert.equal(getSelection(data, 'City', '2026', 'All').totals.odIcsi, 0);
  data.sheets[0].rows[0][2] = '';
  assert.equal(getSelection(validateDataset(data), 'City', '2026', 'All').totals.icsi, 0);
});

test('missing dropout counts stay unavailable, including partial months', () => {
  assert.equal(sumAvailableCounts([], 'opDropout'), null);
  assert.equal(sumAvailableCounts([{}], 'opDropout'), null);
  assert.equal(sumAvailableCounts([{ opDropout: 3 }, { opDropout: null }], 'opDropout'), null);
});

test('actual zero dropout counts remain available', () => {
  assert.equal(sumAvailableCounts([{ opDropout: 0 }], 'opDropout'), 0);
  assert.equal(sumAvailableCounts([{ opDropout: 2 }, { opDropout: 3 }], 'opDropout'), 5);
});

test('initial fetch permits server cache, manual refresh bypasses it, and cancellation is forwarded', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ ok: true, ...dataset() }) };
  };
  try {
    const controller = new AbortController();
    await fetchDashboard(controller.signal);
    await fetchDashboard(controller.signal, { forceRefresh: true });
    assert.equal(calls[0].url.searchParams.has('refresh'), false);
    assert.equal(calls[1].url.searchParams.has('refresh'), true);
    assert.equal(calls[0].options.signal, controller.signal);
  } finally { globalThis.fetch = originalFetch; }
});
