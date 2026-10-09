const SPREADSHEET_ID = '1ChdbOLaJvIhDVEd4pbv89ZTeqNe3BmBp9V8Ne0Mc5xU';

// Reuse successful responses for one minute instead of reading every city on each visit.
const DASHBOARD_CACHE_KEY = 'dashboard-v2';
const DASHBOARD_CACHE_SECONDS = 60;

function doGet(event) {
  try {
    const cache = CacheService.getScriptCache();
    const forceRefresh = Boolean(event && event.parameter && event.parameter.refresh);
    if (!forceRefresh) {
      let cached;
      try { cached = cache.get(DASHBOARD_CACHE_KEY); } catch (_) { /* Cache is optional. */ }
      if (cached) return jsonText_(cached);
    }
    const payload = JSON.stringify({ ok: true, ...readDashboard_(), generatedAt: new Date().toISOString() });
    // CacheService limits each value to 100 KB. Cache failures must not hide valid data.
    try {
      if (Utilities.newBlob(payload).getBytes().length < 95000) {
        cache.put(DASHBOARD_CACHE_KEY, payload, DASHBOARD_CACHE_SECONDS);
      } else {
        cache.remove(DASHBOARD_CACHE_KEY);
      }
    } catch (_) { /* Large responses or cache outages still return the fresh data. */ }
    return jsonText_(payload);
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function json_(data) {
  return jsonText_(JSON.stringify(data));
}

function jsonText_(text) {
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

function readDashboard_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = spreadsheet.getSpreadsheetTimeZone();
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const cities = [];
  const records = [];
  const sheets = [];
  const dropoutList = [];
  const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isTotal = value => /^(total|yeartotal|grandtotal|subtotal|summary)$/.test(normalize(value));
  const names = {
    total: ['totalpatients', 'totalpatient', 'allleads', 'totalleads'],
    booked: ['bookedappointment', 'bookedappointments', 'confirmedappointments', 'confirmedappointment'],
    notBooked: ['notbooked', 'leadsdropout', 'leaddropout'],
    procedure: ['tookprocedure', 'completedprocedure', 'procedure', 'procedures', 'otprocedures', 'otprocedure'],
    pending: ['bookedbutnoprocedure', 'bookedbutnotprocedure'],
    progress: ['ofwhichinprogress', 'inprogress'],
    visited: ['opvisited', 'visited', 'opvisits', 'oppatients', 'oppatient'],
    leadsDropout: ['leadsdropout', 'leaddropout'],
    appointmentDropout: ['appointmentdropout', 'appointmentsdropout'],
    opDropout: ['opdropout'],
    icsi: ['icsi'],
    odIcsi: ['odicsi']
  };

  spreadsheet.getSheets().forEach(sheet => {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 0 || lastCol <= 0) return;

    const rawValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const values = rawValues.map(row => row.map(cell => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) {
        return Utilities.formatDate(cell, tz || 'GMT', 'dd-MMM-yyyy');
      }
      return String(cell).trim();
    }));

    if (!values.some(row => row.some(value => value.trim()))) return;
    const headerIndex = values.findIndex(row =>
      row.some(value => normalize(value) === 'year') &&
      row.some(value => normalize(value) === 'month'));

    if (headerIndex < 0) {
      // Parse detail list sheets such as Leads_Dropout_List
      const listHeaderIndex = values.findIndex(row =>
        row.some(v => ['name', 'mobile', 'remarks', 'createddate', 'branch', 'spouse'].includes(normalize(v))));

      if (listHeaderIndex >= 0) {
        const headers = values[listHeaderIndex];
        const normalized = headers.map(normalize);
        const branchCol = normalized.findIndex(h => h.includes('branch') || h.includes('location') || h.includes('city'));
        const nameCol = normalized.findIndex(h => h === 'name' || h.includes('patientname') || h.includes('leadname'));
        const spouseCol = normalized.findIndex(h => h.includes('spouse'));
        const mobileCol = normalized.findIndex(h => h.includes('mobile') || h.includes('phone') || h.includes('contact'));
        const locationCol = normalized.findIndex(h => h.includes('location'));
        const leadTypeCol = normalized.findIndex(h => h.includes('leadtype') || h.includes('type'));
        const sourceCol = normalized.findIndex(h => h.includes('source'));
        const statusCol = normalized.findIndex(h => h.includes('status'));
        const remarksCol = normalized.findIndex(h => h.includes('remark') || h.includes('reason'));
        const leadIdCol = normalized.findIndex(h => h.includes('leadid') || h.includes('id'));
        const createdDateCol = normalized.findIndex(h => h.includes('created') || h.includes('date'));

        values.slice(listHeaderIndex + 1).forEach(row => {
          if (!row.some(value => value.trim())) return;
          const name = nameCol >= 0 ? String(row[nameCol] ?? '').trim() : '';
          const mobile = mobileCol >= 0 ? String(row[mobileCol] ?? '').trim() : '';
          const remarks = remarksCol >= 0 ? String(row[remarksCol] ?? '').trim() : '';
          const createdDate = createdDateCol >= 0 ? String(row[createdDateCol] ?? '').trim() : '';

          if (!name && !mobile && !remarks) return;

          dropoutList.push({
            branch: branchCol >= 0 ? String(row[branchCol] ?? '').trim() : sheet.getName(),
            name,
            spouseName: spouseCol >= 0 ? String(row[spouseCol] ?? '').trim() : '',
            mobile,
            location: locationCol >= 0 ? String(row[locationCol] ?? '').trim() : (branchCol >= 0 ? String(row[branchCol] ?? '').trim() : ''),
            leadType: leadTypeCol >= 0 ? String(row[leadTypeCol] ?? '').trim() : '',
            source: sourceCol >= 0 ? String(row[sourceCol] ?? '').trim() : '',
            status: statusCol >= 0 ? String(row[statusCol] ?? '').trim() : '',
            remarks,
            leadId: leadIdCol >= 0 ? String(row[leadIdCol] ?? '').trim() : '',
            createdDate
          });
        });
      }
      return;
    }

    const headers = values[headerIndex];
    const normalized = headers.map(normalize);
    const schema = normalized.includes('allleads') || normalized.includes('totalleads') ? 'leads' : 'patients';
    const required = ['total', 'booked', 'procedure'];
    const yearColumn = normalized.indexOf('year');
    const monthColumn = normalized.indexOf('month');
    const columns = {};
    Object.keys(names).forEach(key => {
      columns[key] = normalized.findIndex(header => names[key].includes(header));
      if (columns[key] < 0 && required.includes(key)) {
        throw new Error(sheet.getName() + ': missing ' + names[key][0] + ' column.');
      }
    });
    const cityRows = [];
    values.slice(headerIndex + 1).forEach((row, offset) => {
      if (!row.some(value => value.trim()) || !String(row[yearColumn] ?? '').trim() || isTotal(row[yearColumn]) || isTotal(row[monthColumn])) return;
      const location = sheet.getName() + ', row ' + (headerIndex + offset + 2);
      const year = String(row[yearColumn]).trim().replace(/[–—]/g, '-').replace(/\s+/g, '');
      if (!/^\d{4}(-\d{4})?$/.test(year)) throw new Error(location + ': invalid Year.');
      const rawMonth = String(row[monthColumn]).trim();
      const monthNumber = Number(rawMonth);
      const month = !rawMonth || normalize(rawMonth) === 'all' ? 'All' :
        Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12 ? months[monthNumber - 1] :
        months.find(name => normalize(name) === normalize(rawMonth) || normalize(name.slice(0, 3)) === normalize(rawMonth));
      if (!month) throw new Error(location + ': invalid Month.');
      const record = { city: sheet.getName(), year, period: year, month, schema };
      Object.keys(columns).forEach(key => {
        if (columns[key] < 0) { record[key] = null; return; }
        const text = String(row[columns[key]] ?? '').trim();
        const value = !text || text === '-' ? 0 : Number(text.replace(/,/g, ''));
        if (!Number.isInteger(value) || value < 0) throw new Error(location + ': invalid ' + key + ' count.');
        record[key] = value;
      });
      records.push(record);
      cityRows.push(row);
    });
    if (!cityRows.length) throw new Error(sheet.getName() + ': no monthly data found.');
    cities.push(sheet.getName());
    // Preserve additional source columns (including percentages) as displayed.
    sheets.push({ city: sheet.getName(), schema, headers, rows: cityRows });
  });
  if (!records.length) throw new Error('No city data found.');
  cities.forEach(city => {
    const rows = records.filter(record => record.city === city);
    [...new Set(rows.map(record => record.year))].forEach(year => {
      const periodRows = rows.filter(record => record.year === year);
      const hasMonthly = periodRows.some(record => record.month !== 'All');
      const hasAll = periodRows.some(record => record.month === 'All');
      if (hasMonthly && hasAll) {
        // Automatically drop summary 'All' rows for this year so individual monthly rows are used cleanly without double counting
        for (let i = records.length - 1; i >= 0; i--) {
          if (records[i].city === city && records[i].year === year && records[i].month === 'All') {
            records.splice(i, 1);
          }
        }
        const sheetObj = sheets.find(s => s.city === city);
        if (sheetObj) {
          const yearCol = sheetObj.headers.map(normalize).indexOf('year');
          const monthCol = sheetObj.headers.map(normalize).indexOf('month');
          if (yearCol >= 0 && monthCol >= 0) {
            sheetObj.rows = sheetObj.rows.filter(row => {
              const rYear = String(row[yearCol] ?? '').trim().replace(/[–—]/g, '-').replace(/\s+/g, '');
              const rMonth = String(row[monthCol] ?? '').trim();
              const isAllMonth = !rMonth || normalize(rMonth) === 'all';
              return !(rYear === year && isAllMonth);
            });
          }
        }
      }
    });
  });
  return { sourceName: spreadsheet.getName(), cities,
    years: [...new Set(records.map(record => record.year))].sort(), records, sheets, dropoutList };
}
