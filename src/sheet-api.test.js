import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function server({ oversized = false, failRead = false, failCache = false } = {}) {
  let cached = null, reads = 0;
  const context = vm.createContext({
    CacheService: { getScriptCache: () => ({
      get: () => cached,
      put: (key, text, ttl) => { assert.equal(ttl, 60); if (failCache) throw new Error('cache unavailable'); cached = text; },
      remove: () => { cached = null; }
    }) },
    Utilities: { newBlob: text => ({ getBytes: () => Buffer.from(text) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) }
  });
  vm.runInContext(readFileSync(new URL('../Google-Sheet-API.gs', import.meta.url), 'utf8'), context);
  context.readDashboard_ = () => {
    reads++;
    if (failRead) throw new Error('sheet unavailable');
    return { sequence: reads, sourceName: oversized ? 'x'.repeat(100000) : 'Sheet' };
  };
  return { get: event => JSON.parse(context.doGet(event)), reads: () => reads };
}

test('repeat visits reuse successful response; manual refresh reads sheet again', () => {
  const api = server();
  const first = api.get();
  assert.equal(first.ok, true);
  assert.ok(first.generatedAt);
  assert.deepEqual(api.get(), first);
  assert.equal(api.reads(), 1);
  assert.equal(api.get({ parameter: { refresh: '123' } }).sequence, 2);
  assert.equal(api.get().sequence, 2);
});

test('oversized payloads and cache write failures still return fresh sheet data', () => {
  for (const config of [{ oversized: true }, { failCache: true }]) {
    const api = server(config);
    assert.equal(api.get().ok, true);
    assert.equal(api.get().sequence, 2);
  }
});

test('sheet errors are returned without caching the failure', () => {
  const api = server({ failRead: true });
  assert.deepEqual(api.get(), { ok: false, error: 'sheet unavailable' });
  api.get();
  assert.equal(api.reads(), 2);
});

test('actual script retains dropout details alongside monthly summary records', () => {
  const monthlyHeaders = ['Year', 'Month', 'Total Patients', 'Booked Appointments', 'OT Procedures'];
  const listHeaders = ['Branch', 'Name', 'Mobile', 'Remarks', 'Created Date'];
  const fakeSheet = (name, values) => ({
    getName: () => name, getLastRow: () => values.length, getLastColumn: () => values[0].length,
    getRange: () => ({ getValues: () => values })
  });
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => ({
      getSpreadsheetTimeZone: () => 'Asia/Kolkata', getName: () => 'Dashboard',
      getSheets: () => [
        fakeSheet('City', [monthlyHeaders, ['2026', 'January', 10, 5, 1]]),
        fakeSheet('Leads_Dropout_List', [listHeaders, ['City', 'Sample', '0123456789', 'Follow up', '09-Oct-2026']])
      ]
    }) }
  });
  vm.runInContext(readFileSync(new URL('../Google-Sheet-API.gs', import.meta.url), 'utf8'), context);
  const data = context.readDashboard_();
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].total, 10);
  assert.equal(data.dropoutList.length, 1);
  assert.equal(data.dropoutList[0].mobile, '0123456789');
  assert.equal(data.dropoutList[0].createdDate, '09-Oct-2026');
});
