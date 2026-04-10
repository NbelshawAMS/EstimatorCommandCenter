const state = {
  apiBase: 'https://script.google.com/macros/s/AKfycbxRMGwrl4OT2etkTQI7RumgopaNCTGXsJmPu8dZS0vO9pzBZZEyiK7D8UIGQDc6-lIg/exec',
  discountRange: 'yd',
  discountEstimator: '',
  size: localStorage.getItem('ecc_size') || 'standard'
};

const $ = (sel) => document.querySelector(sel);

document.addEventListener('DOMContentLoaded', () => {
  document.body.setAttribute('data-size', state.size);
  bindUi();
  loadOverview();
});

function bindUi() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchView(btn.dataset.view);
    });
  });

  document.querySelectorAll('.size-btn').forEach(btn => {
    if (btn.dataset.size === state.size) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.size = btn.dataset.size;
      localStorage.setItem('ecc_size', state.size);
      document.body.setAttribute('data-size', state.size);
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  $('#createDiscountDrafts').addEventListener('click', async () => {
    $('#draftStatus').textContent = 'Creating drafts...';
    try {
      const data = await fetchJson('sendDiscountEmails');
      $('#draftStatus').textContent = `${data.results.length} draft actions created.`;
    } catch (err) {
      $('#draftStatus').textContent = err.message;
    }
  });
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');

  const titles = {
    overview: ['Overview', 'Snapshot of estimator performance and follow-up'],
    discounts: ['Discounts', 'Yesterday and month-to-date discount usage'],
    rom: ['High ROM', 'Moves over local and interstate thresholds'],
    appointments: ['Appointments', 'Central time coverage, confirmation quality, and scorecards']
  };

  $('#pageTitle').textContent = titles[view][0];
  $('#pageSubtitle').textContent = titles[view][1];

  if (view === 'overview') loadOverview();
  if (view === 'discounts') loadDiscounts();
  if (view === 'rom') loadRom();
  if (view === 'appointments') loadAppointments();
}

async function fetchJson(action, params = {}) {
  const url = new URL(state.apiBase);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return await res.json();
}

function updateStamp(data) {
  const ts = data.generatedAt || new Date().toISOString();
  $('#lastUpdated').textContent = `Last updated ${new Date(ts).toLocaleString()}`;
}

function kpi(label, value, sub = '') {
  return `<div class="card kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}

function renderTable(headers, rowsHtml) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml.length ? rowsHtml.join('') : `<tr><td colspan="${headers.length}" class="empty">No data found.</td></tr>`}</tbody></table></div>`;
}

function badge(text, tone = 'green') {
  return `<span class="badge ${tone}">${text}</span>`;
}

function barRows(items) {
  if (!items || !items.length) return `<div class="empty">No hourly data yet.</div>`;
  return `<div class="bar-list">${items.map(item => `<div class="bar-row"><div>${item.hour}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(item.appointmentPct, 100)}%"></div></div><div>${item.appointmentPct}%</div><div>${item.availabilityPct}% free</div></div>`).join('')}</div>`;
}

async function loadOverview() {
  const view = $('#view-overview');
  view.innerHTML = `<div class="card">Loading...</div>`;
  try {
    const data = await fetchJson('overview');
    updateStamp(data);

    const lowRows = (data.lowConfirmed || []).slice(0, 12).map(r => `<tr><td>${escapeHtml(r.estimator)}</td><td>${r.totalAppointments}</td><td>${r.confirmedPct}%</td><td>${badge('Under 50%', 'red')}</td></tr>`);
    const romRows = (data.romTop || []).slice(0, 10).map(r => `<tr><td>${escapeHtml(r.estimator)}</td><td>${r.customerId}</td><td>${escapeHtml(r.moveType)}</td><td>${Number(r.weight || 0).toLocaleString()}</td><td>${r.rom}</td></tr>`);

    view.innerHTML = `
      <div class="grid">
        ${kpi('Yesterday Discount Leads', data.overview.totalDiscountLeadsYd)}
        ${kpi('Estimators Tracked', data.overview.estimatorsTracked)}
        ${kpi('High ROM Flags', data.overview.romFlags)}
        ${kpi('Under 50% Confirmed', data.overview.underConfirmedFlags)}
        <div class="card half"><h3>Hourly Appointment Mix</h3>${barRows(data.hourBuckets || [])}</div>
        <div class="card half"><h3>Priority Watchlist</h3><div class="stat-list"><div class="stat"><div class="stat-label">Lowest confirmed estimators</div><div class="stat-value">${data.lowConfirmed.length}</div></div><div class="stat"><div class="stat-label">High ROM jobs in queue</div><div class="stat-value">${data.romTop.length}</div></div><div class="stat"><div class="stat-label">Top discount rows loaded</div><div class="stat-value">${data.discountsTop.length}</div></div></div></div>
        <div class="card half"><h3>Lowest Confirmed Estimators</h3>${renderTable(['Estimator','Appointments','Confirmed %','Status'], lowRows)}</div>
        <div class="card half"><h3>Top High ROM Jobs</h3>${renderTable(['Estimator','CID','Move Type','Weight','ROM'], romRows)}</div>
      </div>
    `;
  } catch (err) {
    view.innerHTML = `<div class="card"><h3>Load failed</h3><div class="empty">${escapeHtml(err.message)}</div></div>`;
  }
}

async function loadDiscounts() {
  const view = $('#view-discounts');
  view.innerHTML = `<div class="card">Loading...</div>`;
  try {
    const data = await fetchJson('discounts', { range: state.discountRange });
    updateStamp(data);

    if (!state.discountEstimator && data.summary[0]) state.discountEstimator = data.summary[0].estimator;
    const estimatorData = await fetchJson('discountEstimator', { estimator: state.discountEstimator, range: state.discountRange });

    const estimatorOptions = data.summary.map(s => `<option value="${escapeHtml(s.estimator)}">${escapeHtml(s.estimator)}</option>`).join('');
    const headers = ['Estimator', 'Total Leads'].concat(data.discountTypes.map(t => `${t} %`));
    const summaryRows = data.summary.map(r => {
      const cells = [escapeHtml(r.estimator), r.totalLeads].concat(data.discountTypes.map(t => `${r.discountPercentages[t] || 0}%`));
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    });

    const detailRows = Object.entries(estimatorData.leadsByDiscount || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, leads]) => `<tr><td>${escapeHtml(bucket)}</td><td>${leads.length}</td><td>${estimatorData.percentages[bucket] || 0}%</td><td>${leads.slice(0, 12).map(l => l.customerId).join(', ')}${leads.length > 12 ? '…' : ''}</td></tr>`);

    view.innerHTML = `
      <div class="filters">
        <div><label for="discountEstimatorSelect">Estimator</label><select id="discountEstimatorSelect">${estimatorOptions}</select></div>
        <div><label for="discountRangeSelect">Range</label><select id="discountRangeSelect"><option value="yd" ${state.discountRange === 'yd' ? 'selected' : ''}>Yesterday</option><option value="mtd" ${state.discountRange === 'mtd' ? 'selected' : ''}>MTD</option></select></div>
      </div>
      <div class="grid">
        ${kpi('Total Leads', data.totalLeads)}
        ${kpi('Discount Types', data.discountTypes.length)}
        ${kpi('Selected Estimator', escapeHtml(estimatorData.estimator || ''))}
        ${kpi('Estimator Leads', estimatorData.totalLeads)}
        <div class="card full"><h3>Discount Summary by Estimator</h3>${renderTable(headers, summaryRows)}</div>
        <div class="card full"><h3>${escapeHtml(estimatorData.estimator || '')} CID Breakdown</h3>${renderTable(['Discount Bucket','Lead Count','Share','Sample CIDs'], detailRows)}</div>
      </div>
    `;

    $('#discountEstimatorSelect').value = state.discountEstimator;
    $('#discountEstimatorSelect').addEventListener('change', (e) => { state.discountEstimator = e.target.value; loadDiscounts(); });
    $('#discountRangeSelect').addEventListener('change', (e) => { state.discountRange = e.target.value; loadDiscounts(); });
  } catch (err) {
    view.innerHTML = `<div class="card"><h3>Load failed</h3><div class="empty">${escapeHtml(err.message)}</div></div>`;
  }
}

async function loadRom() {
  const view = $('#view-rom');
  view.innerHTML = `<div class="card">Loading...</div>`;
  try {
    const data = await fetchJson('romAlerts');
    updateStamp(data);

    const summaryRows = data.summary.map(r => `<tr><td>${escapeHtml(r.estimator)}</td><td>${r.flaggedJobs}</td><td>${r.avgRom}</td><td>${Number(r.avgWeight || 0).toLocaleString()}</td></tr>`);
    const allRows = data.flags.map(r => `<tr><td>${escapeHtml(r.estimator)}</td><td>${r.customerId}</td><td>${escapeHtml(r.moveType)}</td><td>${Number(r.weight || 0).toLocaleString()}</td><td>${r.rom}</td><td>${r.threshold}</td></tr>`);

    view.innerHTML = `
      <div class="grid">
        ${kpi('Flagged Jobs', data.totalFlags)}
        <div class="card half"><h3>Flag Summary by Estimator</h3>${renderTable(['Estimator','Flagged Jobs','Avg ROM','Avg Weight'], summaryRows)}</div>
        <div class="card half"><h3>Rules</h3><div class="stat-list"><div class="stat"><div class="stat-label">Local move threshold</div><div class="stat-value">ROM ≥ 275</div></div><div class="stat"><div class="stat-label">Interstate threshold</div><div class="stat-value">ROM ≥ 251</div></div><div class="stat"><div class="stat-label">Weight shown</div><div class="stat-value">Yes</div></div></div></div>
        <div class="card full"><h3>All High ROM Jobs</h3>${renderTable(['Estimator','CID','Move Type','Weight','ROM','Threshold'], allRows)}</div>
      </div>
    `;
  } catch (err) {
    view.innerHTML = `<div class="card"><h3>Load failed</h3><div class="empty">${escapeHtml(err.message)}</div></div>`;
  }
}

async function loadAppointments() {
  const view = $('#view-appointments');
  view.innerHTML = `<div class="card">Loading...</div>`;
  try {
    const data = await fetchJson('appointments');
    updateStamp(data);

    const rows = data.estimators.map(r => `<tr><td>${escapeHtml(r.estimator)}</td><td>${r.totalAppointments}</td><td>${r.confirmedPct}%</td><td>${r.apptSetWithNotePct}%</td><td>${r.apptSetNoNotePct}%</td><td>${r.flaggedLowConfirmed ? badge('Under 50%', 'red') : badge('OK', 'green')}</td></tr>`);

    view.innerHTML = `
      <div class="grid">
        ${kpi('Appointments', data.overall.totalAppointments)}
        ${kpi('Confirmed %', `${data.overall.confirmedPct}%`)}
        ${kpi('Appt Set w/ Note %', `${data.overall.apptSetWithNotePct}%`)}
        ${kpi('Appt Set No Note %', `${data.overall.apptSetNoNotePct}%`)}
        <div class="card half"><h3>Hourly Coverage (Central)</h3>${barRows(data.hourly || [])}</div>
        <div class="card half"><h3>Current Rules</h3><div class="stat-list"><div class="stat"><div class="stat-label">Rows ignored</div><div class="stat-value">CustomerID = 0</div></div><div class="stat"><div class="stat-label">Time display</div><div class="stat-value">7 AM - 7 PM Central</div></div><div class="stat"><div class="stat-label">Flag threshold</div><div class="stat-value">Under 50% confirmed</div></div></div></div>
        <div class="card full"><h3>Estimator Scorecard</h3>${renderTable(['Estimator','Appointments','Confirmed %','Appt Set w/ Note %','Appt Set No Note %','Status'], rows)}</div>
      </div>
    `;
  } catch (err) {
    view.innerHTML = `<div class="card"><h3>Load failed</h3><div class="empty">${escapeHtml(err.message)}</div></div>`;
  }
}

function escapeHtml(str) {
  return String(str || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
