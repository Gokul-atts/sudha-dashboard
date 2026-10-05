export const API_URL = 'https://script.google.com/macros/s/AKfycbwNITAkLpM2MkhTCi0GlDTJzrR9S0lkKoYH99hE7YzDEkppNlDvvSdK9y7EVZhAFyv3/exec';

export async function fetchDashboard(signal) {
  // A plain GET follows Google's redirect without requiring a CORS preflight.
  const url = new URL(API_URL);
  url.searchParams.set('refresh', String(Date.now()));
  const response = await fetch(url, { signal, redirect: 'follow', credentials: 'omit' });
  if (!response.ok) throw new Error(`Google Sheet request failed (${response.status}).`);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error('The API did not return JSON. Check that the web app is deployed with access set to Anyone.');
  }
  if (data.ok !== true) throw new Error(data.error || 'Unable to read the Google Sheet.');
  return validateDataset(data);
}

export function validateDataset(data) {
  if (!Array.isArray(data.cities) || !data.cities.length || !Array.isArray(data.records) ||
      !Array.isArray(data.sheets) || !Array.isArray(data.years) || !data.years.length) {
    throw new Error('The API response is missing city, year, or sheet data.');
  }
  for (const record of data.records) {
    if (!data.cities.includes(record.city) || !data.years.includes(record.period) || typeof record.month !== 'string') {
      throw new Error('The API contains an invalid city or period.');
    }
    const required = ['total', 'booked', 'procedure'];
    const keys = [...required, 'notBooked', 'pending', 'progress', 'visited', 'leadsDropout', 'appointmentDropout', 'opDropout'];
    for (const key of keys) {
      if (!required.includes(key) && (record[key] === null || record[key] === undefined)) continue;
      if (!Number.isInteger(record[key]) || record[key] < 0) throw new Error(`Invalid ${key} count in ${record.city}.`);
    }
  }
  for (const city of data.cities) {
    const sheet = data.sheets.find(item => item.city === city);
    if (!sheet || !Array.isArray(sheet.headers) || !Array.isArray(sheet.rows)) throw new Error(`Sheet rows missing for ${city}.`);
    const headers = sheet.headers.map(normalize);
    if (!headers.includes('year') || !headers.includes('month')) throw new Error(`Year or Month column missing for ${city}.`);
  }
  return data;
}

export const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const normalizeYear = value => String(value ?? '').trim().replace(/[–—]/g, '-').replace(/\s+/g, '');
export function normalizeMonth(value) {
  const text = String(value ?? '').trim();
  if (!text || normalize(text) === 'all') return 'All';
  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return months[numeric - 1];
  return months.find(month => normalize(month) === normalize(text) || normalize(month.slice(0, 3)) === normalize(text));
}

export function getSelection(data, city, year, month) {
  const records = data.records.filter(record => record.city === city && record.period === year &&
    (month === 'All' || record.month === month));
  const totals = records.reduce((sum, record) => {
    for (const key of Object.keys(sum)) {
      if (typeof record[key] === 'number') sum[key] = (sum[key] ?? 0) + record[key];
    }
    return sum;
  }, { total: 0, booked: 0, notBooked: null, procedure: 0, pending: null, progress: null,
    visited: null, leadsDropout: null, appointmentDropout: null, opDropout: null });
  const sheet = data.sheets.find(item => item.city === city);
  const headers = sheet.headers.map(normalize);
  const yearColumn = headers.indexOf('year');
  const monthColumn = headers.indexOf('month');
  const rows = sheet.rows.filter(row => normalizeYear(row[yearColumn]) === year &&
    (month === 'All' || normalizeMonth(row[monthColumn]) === month));
  return { records, totals, headers: sheet.headers, rows, schema: sheet.schema ||
    (headers.includes('allleads') || headers.includes('totalleads') ? 'leads' : 'patients') };
}
