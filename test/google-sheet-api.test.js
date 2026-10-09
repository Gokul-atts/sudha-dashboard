import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function makeSheet(name, rows) {
  return {
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(...rows.map(row => row.length)),
    getRange: () => ({ getValues: () => rows })
  };
}

function readDashboard(sheets) {
  const source = readFileSync(new URL('../Google-Sheet-API.gs', import.meta.url), 'utf8');
  const context = {
    SpreadsheetApp: {
      openById: () => ({
        getName: () => 'Test dashboard',
        getSheets: () => sheets
      })
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: () => ({ setMimeType() { return this; } })
    }
  };
  vm.runInNewContext(source, context);
  return context.readDashboard_();
}

test('parses dropout list sheets that also contain Year and Month headers', () => {
  const summary = makeSheet('Ambattur', [
    ['Year', 'Month', 'All Leads', 'Confirmed Appointment', 'OT Procedures', 'Leads Dropout', 'Appointment Dropout', 'OP Dropout'],
    ['2025', 'August', '20', '10', '4', '6', '3', '2']
  ]);
  const leads = makeSheet('Leads_Dropout_List', [
    ['Branch', 'Name', 'Spouse Name', 'Mobile', 'Location', 'Lead Type', 'Source', 'Status', 'Remarks', 'Lead ID', 'Created Date', 'Year', 'month'],
    ['Ambattur', 'D.Subramaniyan', '', '9965231391', 'Thiruvarur', 'Camp', 'Facebook', 'Dropout', 'HAVE KIDS', '31684', '22-Jan-2024', '2024', 'January']
  ]);
  const appointments = makeSheet('Appointment_Dropout_List', [
    ['Branch', 'Name', 'Mobile', 'Lead Type', 'Source', 'Status', 'Missed', 'Appointment Date', 'Appointment Source', 'Telecalling Source File', 'Lead ID', 'Created Date', 'Year', 'Month'],
    ['Ambattur', '9841860305', '9841860305', 'Camp', 'Facebook', 'Dropout', 'No', '', 'Telecalling', 'Facebook Leads 2025', '73969', '01-Apr-2025', '2025', 'April']
  ]);
  const ops = makeSheet('OP_Dropout_List', [
    ['Branch', 'Name', 'Spouse Name', 'Mobile', 'Location', 'Lead Type', 'Source', 'Appointment Date', 'Lead ID', 'Created Date', 'Year', 'Month'],
    ['Ambattur', 'Ali Ahamed Khan', 'SAMAIYABANU', '8825795076', 'Ambathur', 'Tele Caller', 'Facebook', '2025-07-31', '82103', '02-Aug-2025', '2025', 'August']
  ]);

  const result = readDashboard([summary, leads, appointments, ops]);

  assert.equal(result.dropoutList.length, 3);
  assert.deepEqual(Array.from(result.dropoutList, item => item.type), ['leads', 'appointment', 'op']);
  assert.equal(result.dropoutList[0].leadId, '31684');
  assert.equal(result.dropoutList[1].telecallingSourceFile, 'Facebook Leads 2025');
  assert.equal(result.dropoutList[2].appointmentDate, '2025-07-31');
  assert.deepEqual(Array.from(result.cities), ['Ambattur']);
});
