import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDropoutPeriod,
  getDropoutType,
  matchesDropoutFilters,
  normalizeDropoutBranch
} from '../src/dropout.js';

const fixtures = [
  {
    type: 'leads', sheetName: 'Leads_Dropout_List', branch: 'Ambattur',
    name: 'D.Subramaniyan', leadId: '31684', createdDate: '22-Jan-2024',
    year: '2024', month: 'January'
  },
  {
    type: 'appointment', sheetName: 'Appointment_Dropout_List', branch: 'Ambattur',
    name: '9841860305', leadId: '73969', createdDate: '01-Apr-2025',
    year: '2025', month: 'April'
  },
  {
    type: 'op', sheetName: 'OP_Dropout_List', branch: 'Ambattur',
    name: 'Ali Ahamed Khan', leadId: '82103', appointmentDate: '2025-07-31',
    createdDate: '02-Aug-2025', year: '2025', month: 'August'
  },
  {
    type: 'op', sheetName: 'OP_Dropout_List', branch: 'Ambattur',
    name: 'Anandaraj P', leadId: '89323', appointmentDate: '2026-02-17',
    createdDate: '22-Jan-2026', year: '2026', month: 'January'
  }
];

const matches = (item, type, year, month, branch = 'Ambattur') =>
  matchesDropoutFilters(item, { type, branch, year, month });

test('filters each dropout tab by branch, year, and month', () => {
  assert.equal(matches(fixtures[0], 'leads', '2024', 'January'), true);
  assert.equal(matches(fixtures[0], 'appointment', '2024', 'January'), false);
  assert.equal(matches(fixtures[1], 'appointment', '2025', 'April'), true);
});

test('explicit sheet period wins over a different appointment month', () => {
  assert.equal(matches(fixtures[2], 'op', '2025', 'August'), true);
  assert.equal(matches(fixtures[2], 'op', '2025', 'July'), false);
  assert.equal(matches(fixtures[3], 'op', '2026', 'January'), true);
  assert.equal(matches(fixtures[3], 'op', '2026', 'February'), false);
});

test('uses Created Date as a period fallback when sheet period is absent', () => {
  const item = { ...fixtures[0], year: '', month: '', createdDate: '07-Aug-2023' };
  assert.deepEqual(getDropoutPeriod(item), { year: '2023', month: 'August' });
});

test('recognizes sheet types without treating the op in dropout as OP type', () => {
  assert.equal(getDropoutType({ sheetName: 'Leads_Dropout_List' }), 'leads');
  assert.equal(getDropoutType({ sheetName: 'Appointment_Dropout_List' }), 'appointment');
  assert.equal(getDropoutType({ sheetName: 'OP_Dropout_List' }), 'op');
});

test('normalizes the known Ambathur spelling while keeping branch authoritative', () => {
  assert.equal(normalizeDropoutBranch('Ambathur'), 'ambattur');
  const item = { ...fixtures[0], branch: 'Ambattur', location: 'Chennai' };
  assert.equal(matches(item, 'leads', '2024', 'January', 'Chennai'), false);
});
