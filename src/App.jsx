import React, { useEffect, useRef, useState } from 'react';
import { DASHBOARD_TIMEOUT_MS, fetchDashboard, getSelection, months, sumAvailableCounts } from './api.js';

const number = new Intl.NumberFormat('en-IN');
const format = value => value === null || value === undefined ? '—' : number.format(value);
function Icon({ name, size = 20, ...props }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18m-13 5 2 2 4-4" /></>,
    pulse: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.5 6.5a8 8 0 0 1 13 2M17.5 17.5a8 8 0 0 1-13-2" /></>,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    sheet: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 9v12" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.grid}</svg>;
}
function Brand() {
  return <div className="brand"><img className="brand-logo" src="/sudha-logo.svg" alt="Sudha Fertility Centre" width="900" height="300" /></div>;
}

function BookingChart({ totals, isLeads }) {
  if (totals.notBooked === null) return <div className="chart-empty">{isLeads ? 'Leads dropout' : 'Not booked'} column is not available for this city.</div>;
  const sum = totals.booked + totals.notBooked;
  const percentage = sum ? totals.booked / sum * 100 : 0;
  const circumference = 2 * Math.PI * 78;
  const confirmedLabel = isLeads ? 'Confirmed appointments' : 'Booked appointments';
  const otherLabel = isLeads ? 'Leads dropout' : 'Not booked';
  return <div className="booking-content"><div className="donut-wrap"><svg className="donut" viewBox="0 0 220 220" role="img" aria-label={`${confirmedLabel}: ${format(totals.booked)}; ${otherLabel}: ${format(totals.notBooked)}`}>
    <circle cx="110" cy="110" r="78" fill="none" stroke="#e7eefb" strokeWidth="22" />
    {!!sum && <circle cx="110" cy="110" r="78" fill="none" stroke="#2563eb" strokeWidth="22" strokeDasharray={`${circumference * percentage / 100} ${circumference}`} transform="rotate(-90 110 110)"><title>{confirmedLabel}: {format(totals.booked)} · {percentage.toFixed(1)}% of displayed statuses</title></circle>}
    <text x="110" y="106" textAnchor="middle" className="donut-value">{sum ? `${percentage.toFixed(1)}%` : '—'}</text><text x="110" y="130" textAnchor="middle" className="donut-caption">{isLeads ? 'confirmed' : 'booked'}</text>
  </svg></div><div className="booking-legend">{[[confirmedLabel, totals.booked, 'dark'], [otherLabel, totals.notBooked, 'light']].map(([label, count, color]) => <div className="legend-line" key={label}><span><i className={color} />{label}</span><strong>{format(count)}</strong></div>)}<div className="legend-total"><span>{isLeads ? 'Total displayed lead statuses' : 'Total booking statuses'}</span><strong>{format(sum)}</strong></div></div></div>;
}

function TrendChart({ records, activeMonth, isLeads }) {
  const points = months.map(month => {
    const rows = records.filter(record => record.month === month);
    return {
      month,
      rows,
      leadsDropout: sumAvailableCounts(rows, isLeads ? 'leadsDropout' : 'notBooked'),
      appointmentDropout: sumAvailableCounts(rows, isLeads ? 'appointmentDropout' : 'pending'),
      opDropout: sumAvailableCounts(rows, 'opDropout')
    };
  }).filter(point => point.rows.length && (activeMonth === 'All' || point.month === activeMonth));
  const max = Math.max(1, ...points.map(point => Math.max(point.leadsDropout, point.appointmentDropout, point.opDropout)));
  const step = Math.max(1, Math.ceil(max / 4)), ceiling = step * 4;
  const left = 42, top = 20, width = 560, height = 175;
  const groupWidth = width / Math.max(points.length, 1), barWidth = Math.min(18, groupWidth * 0.19);
  const series = isLeads ? [
    { key: 'leadsDropout', label: 'Leads Dropout', color: '#f59e0b' },
    { key: 'appointmentDropout', label: 'Appt Dropout', color: '#8b5cf6' },
    { key: 'opDropout', label: 'OP Dropout', color: '#ef4444' }
  ] : [
    { key: 'leadsDropout', label: 'Not Booked', color: '#f59e0b' },
    { key: 'appointmentDropout', label: 'Pending Procedure', color: '#8b5cf6' },
    { key: 'opDropout', label: 'OP Dropout', color: '#ef4444' }
  ];
  if (!points.length) return <div className="chart-empty">{records.some(row => row.month === 'All') ? 'Monthly detail is not available for this year.' : 'No monthly data for this selection.'}</div>;
  const availableSeries = series.filter(item => points.some(point => point[item.key] !== null));
  const unavailableSeries = series.filter(item => points.some(point => point[item.key] === null));
  if (!availableSeries.length) return <div className="chart-empty">Dropout counts are not available for this selection.</div>;
  return <div className="trend-content"><svg className="trend" viewBox="0 0 622 237" role="img" aria-label="Monthly dropout activity breakdown">
    {[0, 1, 2, 3, 4].map(tick => { const y = top + height - height * tick / 4; return <g key={tick}><line x1={left} x2={left + width} y1={y} y2={y} stroke="#ededf1" strokeDasharray={tick ? '3 4' : undefined} /><text x={left - 10} y={y + 4} textAnchor="end" className="axis-label">{format(tick * step)}</text></g>; })}
    {points.map((point, index) => { const x = left + groupWidth * (index + .5); return <g key={point.month}>{availableSeries.map((item, i) => { if (point[item.key] === null) return null; const barHeight = point[item.key] / ceiling * height; return <rect key={item.key} x={x + (i - availableSeries.length / 2) * (barWidth + 2)} y={top + height - barHeight} width={barWidth} height={barHeight} rx="3" fill={item.color} tabIndex="0" aria-label={`${point.month} ${item.label}: ${point[item.key]}`}><title>{point.month} · {item.label}: {format(point[item.key])}</title></rect>; })}<text x={x} y={top + height + 23} textAnchor="middle" className="axis-label">{point.month.slice(0, 3)}</text></g>; })}
  </svg><div className="trend-legend">{availableSeries.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>{unavailableSeries.length > 0 && <p className="trend-legend" role="status">Missing counts: {unavailableSeries.map(item => item.label).join(', ')} (one or more months).</p>}</div>;
}

export default function App() {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [slowLoading, setSlowLoading] = useState(false);
  const [city, setCity] = useState(''), [year, setYear] = useState(''), [mode, setMode] = useState('Year'), [month, setMonth] = useState('All'), [updated, setUpdated] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const request = useRef(null);
  const cityScrollRef = useRef(null);
  const scrollCities = (direction) => {
    if (cityScrollRef.current) {
      cityScrollRef.current.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
    }
  };

  const isNavigating = useRef(false);

  const handleNavClick = (sectionId) => (e) => {
    e.preventDefault();
    setActiveSection(sectionId);
    isNavigating.current = true;
    const target = document.getElementById(sectionId);
    if (target) {
      const topOffset = sectionId === 'overview' ? 0 : target.getBoundingClientRect().top + window.pageYOffset - 16;
      window.scrollTo({ top: topOffset, behavior: 'smooth' });
    }
    setTimeout(() => {
      isNavigating.current = false;
    }, 800);
  };

  useEffect(() => {
    const handleScroll = () => {
      if (isNavigating.current) return;
      const reportEl = document.getElementById('monthly-report');
      if (reportEl) {
        const rect = reportEl.getBoundingClientRect();
        if (rect.top <= window.innerHeight * 0.45) {
          setActiveSection('monthly-report');
        } else {
          setActiveSection('overview');
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  async function refresh(forceRefresh = false) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), DASHBOARD_TIMEOUT_MS);
    const slowTimer = setTimeout(() => { if (request.current === controller) setSlowLoading(true); }, 15000);
    setLoading(true); setSlowLoading(false); setError('');
    try {
      const next = await fetchDashboard(controller.signal, { forceRefresh });
      if (controller.signal.aborted) return;
      setData(next); setCity(previous => next.cities.includes(previous) ? previous : next.cities[0]);
      setYear(previous => next.years.includes(previous) ? previous : next.years[0]);
      const fetchedAt = new Date(next.generatedAt || Date.now());
      setUpdated((Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (cause) {
      if (request.current === controller && (!controller.signal.aborted || controller.signal.reason === 'timeout')) setError(controller.signal.reason === 'timeout' ? 'Google Sheet did not respond within 90 seconds. Please try again.' : cause.message);
    } finally { clearTimeout(timeout); clearTimeout(slowTimer); if (request.current === controller) { setLoading(false); setSlowLoading(false); } }
  }
  useEffect(() => { refresh(); return () => request.current?.abort(); }, []);
  if (!data) return <div className="initial-state"><Brand /><div className="initial-card"><div className="initial-icon"><Icon name="sheet" size={30} /></div><h1>Patient overview</h1><p role={error ? 'alert' : 'status'}>{error || (slowLoading ? 'Google Sheet is still responding. The first load may take up to 90 seconds…' : 'Connecting to your Google Sheet…')}</p>{error ? <button className="primary-button" disabled={loading} onClick={() => refresh()}>Try again</button> : <div className="loading-line" />}</div></div>;
  const availableYears = data.years.filter(value => data.records.some(record => record.city === city && record.period === value));
  const activeYear = availableYears.includes(year) ? year : availableYears[0];
  const activeMonth = mode === 'Month' ? month : 'All';
  const selected = getSelection(data, city, activeYear, activeMonth);
  const isLeads = selected.schema === 'leads';
  const yearRecords = data.records.filter(record => record.city === city && record.period === activeYear);
  const availableMonths = months.filter(value => yearRecords.some(record => record.month === value));
  const bookingRate = selected.totals.total ? `${(selected.totals.booked / selected.totals.total * 100).toFixed(1)}%` : '—';
  const mainCards = [
    { label: isLeads ? 'All leads' : 'Total patients', value: format(selected.totals.total), icon: 'users', featured: true },
    { label: isLeads ? 'Confirmed appointments' : 'Booked appointments', value: format(selected.totals.booked), icon: 'calendar' },
    { label: 'OP (Patients)', value: format(selected.totals.visited), icon: 'users' },
    { label: 'ICSI', value: format(selected.totals.icsi), icon: 'pulse' },
    { label: 'OD-ICSI', value: format(selected.totals.odIcsi), icon: 'pulse' },
    { label: 'OT Procedures', value: format(selected.totals.procedure), icon: 'pulse' },
  ];

  const dropoutCards = isLeads ? [
    { label: 'Leads dropout', value: format(selected.totals.leadsDropout), icon: 'arrow', isDropout: true },
    { label: 'Appointment dropout', value: format(selected.totals.appointmentDropout), icon: 'arrow', isDropout: true },
    { label: 'OP dropout', value: format(selected.totals.opDropout), icon: 'arrow', isDropout: true },
  ] : [
    { label: 'Patients not booked', value: format(selected.totals.notBooked), icon: 'arrow', isDropout: true },
    { label: 'Booked w/o procedure', value: format(selected.totals.pending), icon: 'arrow', isDropout: true },
    { label: 'Booking rate', value: bookingRate, icon: 'arrow' },
  ];

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Workspace"><Brand /><div className="sidebar-label">WORKSPACE</div><a className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`} href="#overview" onClick={handleNavClick('overview')}><Icon name="grid" />Overview{activeSection === 'overview' && <span className="nav-dot" />}</a><a className={`nav-item ${activeSection === 'monthly-report' ? 'active' : ''}`} href="#monthly-report" onClick={handleNavClick('monthly-report')}><Icon name="sheet" />Monthly report{activeSection === 'monthly-report' && <span className="nav-dot" />}</a><div className="sidebar-bottom"><div className="source-icon"><Icon name="sheet" /></div><strong>Connected to Sheets</strong><p>Your reporting source</p><span className="source-status"><i />Live connection</span></div></aside>
    <div className="workspace"><header className="topbar"><div className="mobile-brand"><Brand /></div><div className="breadcrumb">Workspace<Icon name="chevron" size={14} /><strong>{activeSection === 'monthly-report' ? 'Monthly report' : 'Patient overview'}</strong></div><div className="topbar-end"><span className="online-dot" />{error ? 'Connection issue' : 'Google Sheet connected'}<div className="avatar" aria-label="Sudha workspace">S</div></div></header>
      <main className="dashboard" id="overview"><div className="page-heading"><div><p className="eyebrow">PATIENT ANALYTICS</p><h1>Patient overview<span className="heading-dot">.</span></h1><p className="page-description">A clear view of your appointments and care activity.</p></div><button className="refresh-button" disabled={loading} onClick={() => refresh(true)}><Icon name="refresh" size={17} className={loading ? 'spin' : ''} />{loading ? 'Refreshing' : 'Refresh data'}</button></div>
        {loading && slowLoading && <p className="page-description" role="status">Google Sheet is still responding. Showing the previous data while it loads.</p>}
        {error && <p className="error-banner" role="alert">{error} Showing the last successful sheet response.</p>}
        <section className="filter-bar" aria-label="Date filters"><div className="location"><Icon name="pin" size={18} /><strong>{city}</strong><span className="location-divider" /><span>{activeYear}{activeMonth !== 'All' ? ` · ${activeMonth}` : ' · All months'}</span></div><div className="date-controls"><div className="mode-switch" role="group" aria-label="Filter mode">{['Year', 'Month'].map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>{value}</button>)}</div><label className="select-label"><span className="sr-only">Year</span><select aria-label="Year" value={activeYear} onChange={event => { setYear(event.target.value); setMonth('All'); }}>{availableYears.map(value => <option key={value}>{value}</option>)}</select></label>{mode === 'Month' && <label className="select-label"><span className="sr-only">Month</span><select aria-label="Month" value={month} onChange={event => setMonth(event.target.value)}><option value="All">All months</option>{availableMonths.map(value => <option key={value}>{value}</option>)}</select></label>}</div></section>
        <section className="metrics-section" aria-label="Patient summary" aria-live="polite">
          <div className="metrics-group main-metrics-group">
            <div className="metrics-group-title"><Icon name="pulse" size={14} /><span>COUNTS & PROCEDURES</span></div>
            <div className="metrics-grid main-grid">
              {mainCards.map(card => (
                <article className={`metric-card ${card.featured ? 'featured' : ''}`} key={card.label}>
                  <div className="metric-top"><span>{card.label}</span><div className="metric-icon"><Icon name={card.icon} size={18} /></div></div>
                  <strong className="metric-value">{card.value}</strong>
                </article>
              ))}
            </div>
          </div>
          <div className="metrics-group dropout-metrics-group">
            <div className="metrics-group-title dropout-title"><Icon name="arrow" size={14} /><span>DROPOUT ANALYTICS</span></div>
            <div className="metrics-grid dropout-grid">
              {dropoutCards.map(card => (
                <article className={`metric-card ${card.isDropout ? 'dropout-card' : ''}`} key={card.label}>
                  <div className="metric-top"><span>{card.label}</span><div className="metric-icon"><Icon name={card.icon} size={18} /></div></div>
                  <strong className="metric-value">{card.value}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="charts-grid" aria-label="Patient charts"><article className="panel trend-panel"><div className="panel-heading"><div><h2>Monthly dropout activity</h2><p>Monthly breakdown of lead, appointment, and OP dropouts</p></div><span className="subtle-badge">{activeMonth === 'All' ? 'Full year' : activeMonth}</span></div><TrendChart records={yearRecords} activeMonth={activeMonth} isLeads={isLeads} /></article></section>
        <section className="panel report-panel" id="monthly-report" aria-label="Monthly sheet report"><div className="panel-heading"><div><h2>Monthly report<span className="row-count">{selected.rows.length} rows</span></h2><p>Original values from your {city} sheet</p></div><span className="period-label"><Icon name="calendar" size={15} />{activeYear}</span></div><div className="table-scroll"><table><thead><tr>{selected.headers.map((header, index) => <th scope="col" key={index}>{header || `Column ${index + 1}`}</th>)}</tr></thead><tbody>{selected.rows.map((row, index) => <tr key={index}>{selected.headers.map((_, column) => <td key={column}>{row[column] ?? ''}</td>)}</tr>)}{!selected.rows.length && <tr><td colSpan={selected.headers.length} className="empty-cell">No sheet data for this selection.</td></tr>}</tbody></table></div><div className="report-footer"><span>Monthly records only · Year totals excluded</span><span>Updated {updated}</span></div></section>
        <footer className="workspace-footer"><span>{data.sourceName || 'Patient details'}</span><span>Powered by your Google Sheet</span></footer>
      </main><nav className="city-dock" aria-label="City filter"><div className="city-dock-label"><Icon name="pin" size={17} /><span>LOCATIONS</span></div><div className="city-dock-nav"><button className="city-scroll-btn" onClick={() => scrollCities('left')} aria-label="Scroll left"><Icon name="chevronLeft" size={16} /></button><div className="city-buttons" ref={cityScrollRef}>{data.cities.map(value => <button key={value} className={city === value ? 'active' : ''} aria-pressed={city === value} onClick={() => { setCity(value); setMonth('All'); }}><span className="city-indicator" />{value}{city === value && <span className="city-check">✓</span>}</button>)}</div><button className="city-scroll-btn" onClick={() => scrollCities('right')} aria-label="Scroll right"><Icon name="chevronRight" size={16} /></button></div><span className="city-dock-count">{data.cities.length} locations</span></nav>
    </div>
  </div>;
}
