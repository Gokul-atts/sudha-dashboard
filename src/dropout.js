import { months } from './api.js';

const monthNames = new Map(months.flatMap((month, index) => [
  [month.toLowerCase(), month],
  [month.slice(0, 3).toLowerCase(), month],
  [String(index + 1), month]
]));

const normalizeText = value => String(value ?? '').trim();

export function normalizeDropoutMonth(value) {
  const text = normalizeText(value).toLowerCase();
  return monthNames.get(text) || monthNames.get(text.slice(0, 3)) || '';
}

function normalizeYear(value) {
  const text = normalizeText(value);
  if (!/^\d{2}(?:\d{2})?$/.test(text)) return '';
  if (text.length === 4) return text;
  const year = Number(text);
  return year <= 50 ? `20${text}` : `19${text}`;
}

export function parseDropoutDate(value) {
  const text = normalizeText(value);
  if (!text) return { year: '', month: '' };

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}/);
  if (match) {
    return { year: match[1], month: normalizeDropoutMonth(match[2]) };
  }

  match = text.match(/^\d{1,2}[-/\s]+([A-Za-z]{3,9})[-/\s]+(\d{2,4})/);
  if (match) {
    return { year: normalizeYear(match[2]), month: normalizeDropoutMonth(match[1]) };
  }

  match = text.match(/^([A-Za-z]{3,9})[-/\s]+\d{1,2}(?:,|[-/\s])+\s*(\d{2,4})/);
  if (match) {
    return { year: normalizeYear(match[2]), month: normalizeDropoutMonth(match[1]) };
  }

  match = text.match(/^\d{1,2}[-/](\d{1,2})[-/](\d{2,4})/);
  if (match) {
    return { year: normalizeYear(match[2]), month: normalizeDropoutMonth(match[1]) };
  }

  const yearMatch = text.match(/\b(?:19|20)\d{2}\b/);
  const monthMatch = text.match(/\b([A-Za-z]{3,9})\b/);
  return {
    year: yearMatch ? yearMatch[0] : '',
    month: monthMatch ? normalizeDropoutMonth(monthMatch[1]) : ''
  };
}

export function getDropoutPeriod(item) {
  const explicitYear = normalizeText(item?.year);
  const explicitMonth = normalizeDropoutMonth(item?.month);
  const fallbackDates = [item?.createdDate, item?.date, item?.appointmentDate]
    .map(parseDropoutDate);

  return {
    year: explicitYear || fallbackDates.find(period => period.year)?.year || '',
    month: explicitMonth || fallbackDates.find(period => period.month)?.month || ''
  };
}

export function getDropoutType(item) {
  const explicitType = normalizeText(item?.type).toLowerCase();
  if (explicitType === 'lead' || explicitType === 'leads') return 'leads';
  if (explicitType === 'appointment' || explicitType === 'appointments') return 'appointment';
  if (explicitType === 'op') return 'op';

  const sheetName = normalizeText(item?.sheetName).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^appointments?dropoutlist$/.test(sheetName)) return 'appointment';
  if (/^opdropoutlist$/.test(sheetName)) return 'op';
  if (/^leads?dropoutlist$/.test(sheetName)) return 'leads';
  return '';
}

export function normalizeDropoutBranch(value) {
  const branch = normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/^branch/, '').replace(/branch$/, '');
  return branch === 'ambathur' ? 'ambattur' : branch;
}

function yearMatches(itemYear, selectedYear) {
  if (!selectedYear || selectedYear === 'All') return true;
  if (!itemYear) return false;
  if (itemYear === selectedYear) return true;
  const selectedYears = String(selectedYear).match(/(?:19|20)\d{2}/g) || [];
  return selectedYears.includes(itemYear);
}

export function matchesDropoutFilters(item, filters) {
  const { type, branch, year, month, search = '' } = filters;
  if (type && getDropoutType(item) !== type) return false;

  if (branch && branch !== 'All' && branch !== 'All Locations') {
    const target = normalizeDropoutBranch(branch);
    const itemBranch = normalizeDropoutBranch(item?.branch || item?.location);
    if (!itemBranch || !(itemBranch.includes(target) || target.includes(itemBranch))) return false;
  }

  const period = getDropoutPeriod(item);

  if (year && year !== 'All') {
    if (!period.year) return false; // Skip document if year is missing
    if (!yearMatches(period.year, String(year))) return false;
  }

  if (month && month !== 'All') {
    if (!period.month) return false; // Skip document if month is missing
    const selectedMonth = normalizeDropoutMonth(month);
    if (period.month !== selectedMonth) return false;
  }

  const query = normalizeText(search).toLowerCase();
  if (!query) return true;

  return [
    item?.name, item?.spouseName, item?.mobile, item?.leadId, item?.remarks,
    item?.createdDate, item?.appointmentDate, item?.branch, item?.location,
    item?.leadType, item?.source, item?.missed, item?.appointmentSource,
    item?.telecallingSourceFile
  ].some(value => String(value ?? '').toLowerCase().includes(query));
}
