const SPREADSHEET_ID = '1ChdbOLaJvIhDVEd4pbv89ZTeqNe3BmBp9V8Ne0Mc5xU';

function doGet(e) {
  try {
    const parameters = e && e.parameter ? e.parameter : {};
    const action = String(parameters.action || 'summary').toLowerCase();
    const forceRefresh = parameters.force === 'true' || parameters.nocache === 'true';

    // 1. Return cached response if available and not forced
    if (!forceRefresh) {
      const cachedData = getCachedData_();
      if (cachedData) {
        return json_(cachedData);
      }
    }

    if (action === 'dropout-details' || action === 'dropouts') {
      const data = { ok: true, ...readDropoutDetails_(parameters) };
      return json_(data);
    }

    const data = { ok: true, ...readDashboard_() };

    // 2. Cache response in Apps Script CacheService for 10 minutes (600s)
    setCachedData_(data, 600);

    return json_(data);
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- Chunked Cache Implementation for Apps Script (100KB per key limit) ---
const CACHE_KEY_PREFIX = 'SUDHA_DASHBOARD_CHUNK_';
const CACHE_COUNT_KEY = 'SUDHA_DASHBOARD_CHUNK_COUNT';
const CHUNK_SIZE = 90000;

function getCachedData_() {
  try {
    const cache = CacheService.getScriptCache();
    const countStr = cache.get(CACHE_COUNT_KEY);
    if (!countStr) return null;
    const count = parseInt(countStr, 10);
    if (isNaN(count) || count <= 0) return null;

    const keys = [];
    for (let i = 0; i < count; i++) {
      keys.push(CACHE_KEY_PREFIX + i);
    }
    const chunks = cache.getAll(keys);
    let fullJson = '';
    for (let i = 0; i < count; i++) {
      const chunk = chunks[CACHE_KEY_PREFIX + i];
      if (!chunk) return null;
      fullJson += chunk;
    }
    return JSON.parse(fullJson);
  } catch (err) {
    return null;
  }
}

function setCachedData_(data, expirationInSeconds) {
  try {
    const jsonStr = JSON.stringify(data);
    const cache = CacheService.getScriptCache();
    const chunks = {};
    let index = 0;
    let i = 0;
    while (i < jsonStr.length) {
      chunks[CACHE_KEY_PREFIX + index] = jsonStr.substring(i, i + CHUNK_SIZE);
      index++;
      i += CHUNK_SIZE;
    }
    chunks[CACHE_COUNT_KEY] = String(index);
    cache.putAll(chunks, expirationInSeconds || 600);
  } catch (err) {
    // Ignore cache put errors
  }
}

function readDropoutDetails_(parameters) {
  const dash = readDashboard_();
  let list = dash.dropoutList || [];
  if (parameters && parameters.type) {
    const targetType = String(parameters.type).toLowerCase();
    list = list.filter(item => item.type === targetType);
  }
  if (parameters && (parameters.branch || parameters.city)) {
    const targetBranch = normalizeKey_(parameters.branch || parameters.city);
    list = list.filter(item => normalizeKey_(item.branch).includes(targetBranch) || normalizeKey_(item.location).includes(targetBranch));
  }
  return { dropoutList: list };
}

function cellToStr_(cell) {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    const mShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return String(cell.getDate()).padStart(2, '0') + '-' + mShort[cell.getMonth()] + '-' + cell.getFullYear();
  }
  return String(cell).trim();
}

function normalizeKey_(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dropoutListType_(sheetName) {
  const normalized = normalizeKey_(sheetName);
  if (/^appointments?dropoutlist$/.test(normalized)) return 'appointment';
  if (/^opdropoutlist$/.test(normalized)) return 'op';
  if (/^leads?dropoutlist$/.test(normalized)) return 'leads';
  return '';
}

function readDashboard_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const cities = [];
  const records = [];
  const sheets = [];
  const dropoutList = [];
  const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizeMonthName_ = val => {
    if (!val) return '';
    const str = String(val).trim();
    if (!str) return '';
    const num = Number(str);
    if (Number.isInteger(num) && num >= 1 && num <= 12) return months[num - 1];
    const lower = str.toLowerCase();
    const found = months.find(m => m.toLowerCase() === lower || m.toLowerCase().slice(0, 3) === lower.slice(0, 3));
    return found || str;
  };
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
    const sName = sheet.getName();
    const sNorm = normalize(sName);

    if (sNorm.includes('test') || sNorm.includes('temp') || sNorm.includes('draft') || sNorm.includes('copy') || sNorm.includes('sample')) {
      return;
    }

    // Optimization: Single API call for grid data instead of getLastRow + getLastColumn + getRange
    const rawValues = sheet.getDataRange().getValues();
    if (!rawValues || !rawValues.length || !rawValues[0].length) return;

    const searchHeaderSlice = rawValues.slice(0, Math.min(20, rawValues.length));
    const listType = /^appointments?dropoutlist$/.test(sNorm) ? 'appointment' :
      /^opdropoutlist$/.test(sNorm) ? 'op' :
      /^leads?dropoutlist$/.test(sNorm) ? 'leads' : '';

    if (listType) {
      const listHeaderIndex = searchHeaderSlice.findIndex(row =>
        row.some(v => ['name', 'mobile', 'remarks', 'createddate', 'branch', 'spouse'].includes(normalize(v))));

      if (listHeaderIndex >= 0) {
        const headers = rawValues[listHeaderIndex].map(cellToStr_);
        const normalized = headers.map(normalize);
        const branchCol = normalized.findIndex(h => h === 'branch' || h.includes('branch'));
        const nameCol = normalized.findIndex(h => h === 'name' || h.includes('patientname') || h.includes('leadname'));
        const spouseCol = normalized.findIndex(h => h.includes('spouse'));
        const mobileCol = normalized.findIndex(h => h.includes('mobile') || h.includes('phone') || h.includes('contact'));
        const locationCol = normalized.findIndex(h => h.includes('location'));
        const leadTypeCol = normalized.findIndex(h => h.includes('leadtype') || (h.includes('type') && !h.includes('sheet')));
        const sourceCol = normalized.findIndex(h => h === 'source' || (h.includes('source') && !h.includes('appointment') && !h.includes('telecalling')));
        const statusCol = normalized.findIndex(h => h.includes('status'));
        const remarksCol = normalized.findIndex(h => h.includes('remark') || h.includes('reason'));
        const leadIdCol = normalized.findIndex(h => h.includes('leadid') || h.includes('id'));
        const createdDateCol = normalized.findIndex(h => h.includes('createddate') || h.includes('created_date') || h === 'created');
        const appointmentDateCol = normalized.findIndex(h => h.includes('appointmentdate') || h.includes('appointment_date') || h.includes('opdate') || h.includes('apptdate'));
        const missedCol = normalized.findIndex(h => h.includes('missed'));
        const apptSourceCol = normalized.findIndex(h => h.includes('appointmentsource'));
        const telecallingCol = normalized.findIndex(h => h.includes('telecallingsource') || h.includes('telecalling'));
        const fallbackDateCol = normalized.findIndex(h => h.includes('date'));
        const yearCol = normalized.findIndex(h => h === 'year');
        const monthCol = normalized.findIndex(h => h === 'month');

        let consecutiveEmpty = 0;
        for (let i = listHeaderIndex + 1; i < rawValues.length; i++) {
          const row = rawValues[i];
          const hasValue = row.some(cell => cell !== '' && cell !== null && cell !== undefined);
          if (!hasValue) {
            consecutiveEmpty++;
            if (consecutiveEmpty > 15) break; // Break out on trailing blank rows
            continue;
          }
          consecutiveEmpty = 0;

          const name = nameCol >= 0 ? cellToStr_(row[nameCol]) : '';
          const mobile = mobileCol >= 0 ? cellToStr_(row[mobileCol]) : '';
          const remarks = remarksCol >= 0 ? cellToStr_(row[remarksCol]) : '';

          let createdDate = createdDateCol >= 0 ? cellToStr_(row[createdDateCol]) : '';
          let appointmentDate = appointmentDateCol >= 0 ? cellToStr_(row[appointmentDateCol]) : '';
          if (!createdDate && !appointmentDate && fallbackDateCol >= 0) {
            createdDate = cellToStr_(row[fallbackDateCol]);
          }

          const rawYear = yearCol >= 0 ? cellToStr_(row[yearCol]).replace(/[–—]/g, '-').replace(/\s+/g, '') : '';
          const rawMonth = monthCol >= 0 ? cellToStr_(row[monthCol]) : '';
          const normalizedMonth = normalizeMonthName_(rawMonth);

          if (!name && !mobile && !remarks && !createdDate && !appointmentDate && !rawYear) continue;

          dropoutList.push({
            type: listType,
            sheetName: sName,
            branch: branchCol >= 0 ? cellToStr_(row[branchCol]) : sName,
            name,
            spouseName: spouseCol >= 0 ? cellToStr_(row[spouseCol]) : '',
            mobile,
            location: locationCol >= 0 ? cellToStr_(row[locationCol]) : (branchCol >= 0 ? cellToStr_(row[branchCol]) : ''),
            leadType: leadTypeCol >= 0 ? cellToStr_(row[leadTypeCol]) : '',
            source: sourceCol >= 0 ? cellToStr_(row[sourceCol]) : '',
            status: statusCol >= 0 ? cellToStr_(row[statusCol]) : '',
            remarks,
            leadId: leadIdCol >= 0 ? cellToStr_(row[leadIdCol]) : '',
            createdDate,
            appointmentDate,
            missed: missedCol >= 0 ? cellToStr_(row[missedCol]) : '',
            appointmentSource: apptSourceCol >= 0 ? cellToStr_(row[apptSourceCol]) : '',
            telecallingSourceFile: telecallingCol >= 0 ? cellToStr_(row[telecallingCol]) : '',
            date: createdDate || appointmentDate || '',
            year: rawYear,
            month: normalizedMonth
          });
        }
      }
      return;
    }

    const headerIndex = searchHeaderSlice.findIndex(row =>
      row.some(cell => normalize(cell) === 'year') &&
      row.some(cell => normalize(cell) === 'month'));
    if (headerIndex < 0) return;

    const headers = rawValues[headerIndex].map(cellToStr_);
    const normalized = headers.map(normalize);
    const schema = normalized.includes('allleads') || normalized.includes('totalleads') ? 'leads' : 'patients';
    const required = ['total', 'booked', 'procedure'];
    const yearColumn = normalized.indexOf('year');
    const monthColumn = normalized.indexOf('month');
    const columns = {};
    let hasMissingRequired = false;
    Object.keys(names).forEach(key => {
      columns[key] = normalized.findIndex(header => names[key].includes(header));
      if (columns[key] < 0 && required.includes(key)) {
        hasMissingRequired = true;
      }
    });

    if (hasMissingRequired) return;

    const cityRows = [];
    let consecutiveEmpty = 0;
    for (let i = headerIndex + 1; i < rawValues.length; i++) {
      const row = rawValues[i];
      const rowStr = row.map(cellToStr_);
      if (!rowStr.some(v => v)) {
        consecutiveEmpty++;
        if (consecutiveEmpty > 10) break; // Break out on trailing blank rows
        continue;
      }
      consecutiveEmpty = 0;

      if (!rowStr[yearColumn] || isTotal(rowStr[yearColumn]) || isTotal(rowStr[monthColumn])) continue;

      const year = rowStr[yearColumn].replace(/[–—]/g, '-').replace(/\s+/g, '');
      if (!/^\d{4}(-\d{4})?$/.test(year)) continue;
      const rawMonth = rowStr[monthColumn];
      const monthNumber = Number(rawMonth);
      const month = !rawMonth || normalize(rawMonth) === 'all' ? 'All' :
        Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12 ? months[monthNumber - 1] :
        months.find(name => normalize(name) === normalize(rawMonth) || normalize(name.slice(0, 3)) === normalize(rawMonth));

      if (!month) continue;

      const record = { city: sName, year, period: year, month, schema };
      Object.keys(columns).forEach(key => {
        if (columns[key] < 0) { record[key] = null; return; }
        const text = rowStr[columns[key]];
        const value = !text || text === '-' ? 0 : Number(text.replace(/,/g, ''));
        record[key] = isNaN(value) ? 0 : value;
      });
      records.push(record);
      cityRows.push(rowStr);
    }

    if (!cityRows.length) return;
    cities.push(sName);
    sheets.push({ city: sName, schema, headers, rows: cityRows });
  });

  if (!records.length) throw new Error('No city data found.');
  cities.forEach(city => {
    const rows = records.filter(record => record.city === city);
    [...new Set(rows.map(record => record.year))].forEach(year => {
      const periodRows = rows.filter(record => record.year === year);
      const hasMonthly = periodRows.some(record => record.month !== 'All');
      const hasAll = periodRows.some(record => record.month === 'All');
      if (hasMonthly && hasAll) {
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

