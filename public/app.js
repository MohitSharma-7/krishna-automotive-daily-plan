let state = { parts: [], lots: [], dispatches: [], history: [] };
let supervisorPin = sessionStorage.getItem('ka_sup_pin') || '';

const tabMeta = {
  'daily-plan': { crumb: 'Workspace / Daily plan', title: 'Every part. Every shift. In sync.' },
  'drawing-library': { crumb: 'Workspace / Drawing library', title: 'Control drawings & critical dimensions.' },
  'production': { crumb: 'Workspace / Production', title: 'Log finished pieces against part numbers.' },
  'quality-checks': { crumb: 'Workspace / Quality assurance', title: 'Verify Control Plan tolerances.' },
  'dispatch': { crumb: 'Workspace / Dispatch & handover', title: 'Dispatch QC-cleared stock.' }
};

// Navigation Switching
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById('breadcrumb').textContent = tabMeta[tab].crumb;
    document.getElementById('page-title').textContent = tabMeta[tab].title;
  });
});

// Role UI Update
function updateRoleUI() {
  const isSup = Boolean(supervisorPin);
  const roleBtn = document.getElementById('toggle-role-btn');
  const statusTxt = document.getElementById('role-status-text');
  const descTxt = document.getElementById('role-desc-text');

  if (isSup) {
    statusTxt.textContent = '🛡️ Supervisor Mode Active';
    descTxt.textContent = 'Full access unlocked: add drawings, log production, approve QC, and dispatch.';
    roleBtn.textContent = 'Lock Supervisor Mode';
    roleBtn.classList.add('unlocked');
  } else {
    statusTxt.textContent = '👁️ Worker View (Read-Only)';
    descTxt.textContent = 'Shop-floor staff can inspect daily targets and CAD drawings. Supervisor login required to edit.';
    roleBtn.textContent = 'Unlock Supervisor Mode';
    roleBtn.classList.remove('unlocked');
  }

  document.getElementById('add-drawing-card').style.display = isSup ? 'block' : 'none';
  document.getElementById('archive-day-btn').style.display = isSup ? 'inline-block' : 'none';
  document.getElementById('open-change-pin-btn').style.display = isSup ? 'block' : 'none';
  document.getElementById('prod-locked-notice').style.display = isSup ? 'none' : 'block';
  document.getElementById('prod-form-card').style.display = isSup ? 'block' : 'none';
  document.getElementById('dispatch-form-card').style.display = isSup ? 'block' : 'none';

  renderDailyPlan();
  renderQCLots();
}

document.getElementById('toggle-role-btn').addEventListener('click', () => {
  if (supervisorPin) {
    supervisorPin = '';
    sessionStorage.removeItem('ka_sup_pin');
    updateRoleUI();
  } else {
    document.getElementById('pin-modal').style.display = 'grid';
    document.getElementById('pin-input').focus();
  }
});

function closePinModal() {
  document.getElementById('pin-modal').style.display = 'none';
  document.getElementById('pin-input').value = '';
}

async function submitPin() {
  const pin = document.getElementById('pin-input').value;
  const res = await fetch('/api/verify-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  if (res.ok) {
    supervisorPin = pin;
    sessionStorage.setItem('ka_sup_pin', pin);
    closePinModal();
    updateRoleUI();
  } else {
    alert('Incorrect Supervisor PIN. Please try again.');
  }
}

function openChangePinModal() {
  document.getElementById('change-pin-modal').style.display = 'grid';
  document.getElementById('old-pin-input').focus();
}

function closeChangePinModal() {
  document.getElementById('change-pin-modal').style.display = 'none';
  document.getElementById('old-pin-input').value = '';
  document.getElementById('new-pin-input').value = '';
  document.getElementById('confirm-pin-input').value = '';
}

async function submitChangePin() {
  const currentPin = document.getElementById('old-pin-input').value;
  const newPin = document.getElementById('new-pin-input').value;
  const confirmPin = document.getElementById('confirm-pin-input').value;

  if (newPin.trim().length < 4) {
    return alert('New PIN must be at least 4 characters long.');
  }
  if (newPin !== confirmPin) {
    return alert('New PIN and Confirm PIN do not match.');
  }

  const res = await fetch('/api/change-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-supervisor-pin': supervisorPin },
    body: JSON.stringify({ currentPin, newPin })
  });
  const data = await res.json();

  if (res.ok) {
    supervisorPin = newPin.trim();
    sessionStorage.setItem('ka_sup_pin', supervisorPin);
    closeChangePinModal();
    alert('Supervisor PIN updated successfully!');
  } else {
    alert(data.error || 'Failed to change PIN.');
  }
}

// Fetch Dashboard Data
async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  state = await res.json();
  renderDailyPlan();
  renderHistory();
  renderDrawings();
  renderForms();
  renderQCLots();
  renderDispatches();

  // Check if opened via QR code (?part=F2FA461330)
  const params = new URLSearchParams(window.location.search);
  const qrPart = params.get('part');
  if (qrPart) {
    openDrawingByPart(qrPart);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function renderDailyPlan() {
  const filter = document.getElementById('shift-filter').value;
  const query = document.getElementById('plan-search').value.trim().toLowerCase();

  const filtered = state.parts.filter(p => {
    const matchShift = filter === 'ALL' || p.shift.includes(filter);
    const matchQuery = !query || p.part_number.toLowerCase().includes(query) || p.part_name.toLowerCase().includes(query);
    return matchShift && matchQuery;
  });

  let planned = 0, made = 0, dispatched = 0, ready = 0;
  state.parts.forEach(p => {
    planned += p.target_qty;
    made += p.made_qty;
    dispatched += p.dispatched_qty;
    ready += Math.max(0, p.qc_cleared_qty - p.dispatched_qty);
  });

  document.getElementById('kpi-planned').textContent = `${planned.toLocaleString()} pcs`;
  document.getElementById('kpi-orders').textContent = `Across ${state.parts.length} part numbers`;
  document.getElementById('kpi-made').textContent = `${made.toLocaleString()} pcs`;
  document.getElementById('kpi-balance').textContent = `${Math.max(0, planned - made).toLocaleString()} pcs`;
  document.getElementById('kpi-dispatched').textContent = `${dispatched.toLocaleString()} pcs`;
  document.getElementById('kpi-ready').textContent = `${ready.toLocaleString()} QC-cleared ready on floor`;

  const isSup = Boolean(supervisorPin);
  document.querySelectorAll('.sup-col').forEach(el => {
    el.style.display = isSup ? 'table-cell' : 'none';
  });

  const tbody = document.getElementById('daily-plan-tbody');
  tbody.innerHTML = filtered.map(p => {
    const balance = Math.max(0, p.target_qty - p.made_qty);
    const pct = p.target_qty > 0 ? Math.min(100, Math.round((p.made_qty / p.target_qty) * 100)) : 0;
    const onTrack = pct >= 65;
    return `
      <tr>
        <td><strong>${p.part_number}</strong><div class="muted">${p.part_name}</div></td>
        <td><strong>${p.target_qty}</strong></td>
        <td>
          <strong>${p.made_qty}</strong>
          <div class="prog-track"><div class="prog-fill ${onTrack ? '' : 'warn'}" style="width:${pct}%"></div></div>
        </td>
        <td>${balance}</td>
        <td>${p.dispatched_qty}</td>
        <td><strong>${p.person_in_charge}</strong><div class="muted">${p.shift}</div></td>
        <td>
          <span class="${onTrack ? 'pill-emerald' : 'pill-amber'}">${onTrack ? 'On track' : 'Needs focus'} (${pct}%)</span>
          <div class="muted">ETA: ${p.eta_time}</div>
        </td>
        <td><button class="btn-secondary" onclick="openDrawingByPart('${p.part_number}')">${p.revision} ↗</button></td>
        <td class="sup-col" style="display:${isSup ? 'table-cell' : 'none'}; white-space:nowrap;">
          <button class="btn-secondary" onclick="openEditPartModal(${p.id})">✏️ Edit</button>
          <button class="btn-danger" onclick="deletePart(${p.id}, '${p.part_number}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

document.getElementById('shift-filter').addEventListener('change', renderDailyPlan);
document.getElementById('plan-search').addEventListener('input', renderDailyPlan);

function renderHistory() {
  const tbody = document.getElementById('history-tbody');
  if (!state.history || state.history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">No archived days yet.</td></tr>';
    return;
  }
  tbody.innerHTML = state.history.map(h => `
    <tr>
      <td><strong>${h.archive_date}</strong></td>
      <td>${h.total_planned} pcs</td>
      <td><strong>${h.total_made} pcs</strong></td>
      <td style="color:var(--emerald);font-weight:700;">${h.total_qc_cleared} pcs</td>
      <td style="color:var(--red);">${h.total_rejected} pcs</td>
      <td>${h.total_dispatched} pcs</td>
      <td class="muted">${h.archived_by}</td>
    </tr>
  `).join('');
}

// Export Today's Plan to Excel (.CSV)
function exportPlanCSV() {
  const headers = ['Part Number', 'Description', 'Revision', 'Target Qty', 'Made Qty', 'Balance', 'QC Cleared', 'Dispatched', 'Shift', 'Person In-Charge', 'ETA'];
  const rows = state.parts.map(p => [
    p.part_number,
    `"${p.part_name}"`,
    p.revision,
    p.target_qty,
    p.made_qty,
    Math.max(0, p.target_qty - p.made_qty),
    p.qc_cleared_qty,
    p.dispatched_qty,
    `"${p.shift}"`,
    `"${p.person_in_charge}"`,
    `"${p.eta_time}"`
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Krishna_Automotives_Daily_Plan_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
}

// Supervisor: Archive Day & Reset Counters
async function archiveCurrentDay() {
  if (!confirm('Archive today\'s totals into Shift History and reset Made/Dispatched counters to 0 for a new day?')) return;
  const res = await fetch('/api/archive-day', {
    method: 'POST',
    headers: { 'x-supervisor-pin': supervisorPin }
  });
  if (res.ok) {
    alert('Shift archived! Daily counters reset for the new production day.');
    loadDashboard();
  }
}

function renderDrawings() {
  const query = document.getElementById('drawing-search').value.trim().toLowerCase();
  const filtered = state.parts.filter(p =>
    !query || p.part_number.toLowerCase().includes(query) || p.part_name.toLowerCase().includes(query)
  );

  const container = document.getElementById('drawing-cards-container');
  container.innerHTML = filtered.map(p => `
    <div class="drawing-card">
      <div>
        <div class="cad-thumb">📐 CAD CONTROL DRAWING • ${p.part_number}</div>
        <span class="pill-emerald">${p.revision} • Approved</span>
        <h3 style="margin: 10px 0 4px;">${p.part_number}</h3>
        <p class="muted">${p.part_name}</p>
        <p class="muted" style="margin-top:8px;"><strong>OD:</strong> ${p.od_spec} | <strong>Len:</strong> ${p.length_spec}</p>
      </div>
      <button class="btn-primary" style="margin-top:14px;" onclick="openDrawingByPart('${p.part_number}')">Open Drawing & Control Plan</button>
    </div>
  `).join('');
}

document.getElementById('drawing-search').addEventListener('input', renderDrawings);

function openDrawingByPart(partNumber) {
  const part = state.parts.find(p => p.part_number === partNumber);
  if (!part) return;

  document.querySelector('[data-tab="drawing-library"]').click();

  document.getElementById('det-rev').textContent = `${part.revision} • APPROVED`;
  document.getElementById('det-title').textContent = `${part.part_number} — ${part.part_name}`;
  document.getElementById('spec-od').textContent = part.od_spec || 'As per drawing';
  document.getElementById('spec-id').textContent = part.id_spec || 'As per drawing';
  document.getElementById('spec-length').textContent = part.length_spec || 'As per drawing';
  document.getElementById('spec-straight').textContent = part.straightness_spec || 'As per drawing';
  document.getElementById('spec-surface').textContent = part.surface_spec || 'Free from burrs & rust';
  document.getElementById('spec-bore').textContent = part.bore_depth_spec || 'As per drawing';
  document.getElementById('spec-thread').textContent = part.threading_depth_spec || 'As per drawing';

  // Generate QR code pointing directly to this part's URL
  const partUrl = `${window.location.origin}/?part=${encodeURIComponent(part.part_number)}`;
  document.getElementById('det-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(partUrl)}`;

  const fileUrl = `drawings/${part.drawing_file}`;
  document.getElementById('det-pdf-frame').src = fileUrl;
  document.getElementById('det-download-link').href = fileUrl;
  document.getElementById('drawing-detail-panel').style.display = 'block';
  document.getElementById('drawing-detail-panel').scrollIntoView({ behavior: 'smooth' });
}

function closeDrawingDetail() {
  document.getElementById('drawing-detail-panel').style.display = 'none';
}

function renderForms() {
  const prodSelect = document.getElementById('prod-part-select');
  const dispSelect = document.getElementById('dispatch-part-select');

  prodSelect.innerHTML = state.parts.map(p => `<option value="${p.part_number}">${p.part_number} — ${p.part_name} (Bal: ${Math.max(0, p.target_qty - p.made_qty)})</option>`).join('');
  dispSelect.innerHTML = state.parts.map(p => {
    const ready = Math.max(0, p.qc_cleared_qty - p.dispatched_qty);
    return `<option value="${p.part_number}">${p.part_number} — Ready Stock: ${ready} pcs</option>`;
  }).join('');
}

function renderQCLots() {
  const pending = state.lots.filter(l => l.status === 'Awaiting QC');
  document.getElementById('qc-badge').textContent = pending.length;

  // Update QC KPIs
  let totalCleared = 0, totalRejected = 0;
  state.parts.forEach(p => {
    totalCleared += p.qc_cleared_qty;
    totalRejected += (p.rejected_qty || 0);
  });
  const totalInspected = totalCleared + totalRejected;
  const rejRate = totalInspected > 0 ? ((totalRejected / totalInspected) * 100).toFixed(1) : '0.0';

  document.getElementById('qc-kpi-cleared').textContent = `${totalCleared.toLocaleString()} pcs`;
  document.getElementById('qc-kpi-rejected').textContent = `${totalRejected.toLocaleString()} pcs`;
  document.getElementById('qc-kpi-rate').textContent = `${rejRate}%`;

  const isSup = Boolean(supervisorPin);
  const container = document.getElementById('qc-lots-container');
  if (state.lots.length === 0) {
    container.innerHTML = '<p class="muted">No lots in QC queue right now.</p>';
    return;
  }

  container.innerHTML = state.lots.map(l => `
    <div class="qc-item">
      <div>
        <strong>${l.part_number} (${l.revision}) — ${l.quantity} pcs</strong>
        <div class="muted">Lead: ${l.person_in_charge} • ${l.shift} • Workstation: ${l.workstation || 'Line 1'} (${l.created_at})</div>
        <div class="muted" style="margin-top:4px;">Recorded Specs → OD: <strong>${l.od_recorded}</strong> | ID: <strong>${l.id_recorded}</strong> | Length: <strong>${l.length_recorded}</strong></div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        ${l.status === 'Awaiting QC'
          ? (isSup
              ? `<button class="btn-primary" onclick="decideQC(${l.id}, 'Passed')">✓ Approve All</button>
                 <button class="btn-secondary" onclick="openPartialQCModal(${l.id})">⚖️ Partial Split</button>
                 <button class="btn-danger" onclick="decideQC(${l.id}, 'Rejected')">✕ Reject All</button>`
              : `<span class="pill-amber">Awaiting Supervisor QC</span>`)
          : `<span class="${l.status === 'Passed' ? 'pill-emerald' : 'pill-amber'}">${l.status} • ${l.inspector}</span>`
        }
      </div>
    </div>
  `).join('');
}

async function decideQC(id, decision, passedQty = null) {
  const payload = { decision, inspector: 'Rajesh Singh (Supervisor)' };
  if (decision === 'Partial') {
    payload.passed_qty = passedQty;
  }

  const res = await fetch(`/api/qc/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-supervisor-pin': supervisorPin },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closePartialQCModal();
    loadDashboard();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to update QC status.');
  }
}

// Partial QC Split Modal Controls
function openPartialQCModal(lotId) {
  const lot = state.lots.find(l => l.id === lotId);
  if (!lot) return;

  document.getElementById('partial-qc-id').value = lot.id;
  document.getElementById('partial-qc-total').value = lot.quantity;
  document.getElementById('partial-qc-subtitle').textContent = `Lot: ${lot.part_number} • Total Inspected: ${lot.quantity} pcs`;

  const passInput = document.getElementById('partial-passed-input');
  passInput.max = lot.quantity;
  passInput.value = lot.quantity;
  updatePartialRejectPreview();

  document.getElementById('partial-qc-modal').style.display = 'grid';
  passInput.focus();
  passInput.select();
}

function closePartialQCModal() {
  document.getElementById('partial-qc-modal').style.display = 'none';
}

function updatePartialRejectPreview() {
  const total = Number(document.getElementById('partial-qc-total').value || 0);
  const passed = Number(document.getElementById('partial-passed-input').value || 0);
  const rejected = Math.max(0, total - passed);
  document.getElementById('partial-rejected-preview').value = rejected;
}

function submitPartialQC() {
  const lotId = Number(document.getElementById('partial-qc-id').value);
  const total = Number(document.getElementById('partial-qc-total').value);
  const passed = Number(document.getElementById('partial-passed-input').value);

  if (!Number.isInteger(passed) || passed < 0 || passed > total) {
    return alert(`Please enter a valid number between 0 and ${total}.`);
  }

  decideQC(lotId, 'Partial', passed);
}

function renderDispatches() {
  const tbody = document.getElementById('dispatch-tbody');
  tbody.innerHTML = state.dispatches.map(d => `
    <tr>
      <td><strong>${d.dn_number}</strong></td>
      <td>${d.part_number}</td>
      <td><strong>${d.quantity} pcs</strong></td>
      <td>${d.handed_over_by}</td>
      <td>${d.destination}</td>
      <td class="muted">${d.dispatched_at}</td>
      <td><button class="btn-secondary" onclick="printGatePass('${d.dn_number}')">🖨️ Print Gate Pass</button></td>
    </tr>
  `).join('');
}

// Printable Delivery Challan / Gate Pass Window
function printGatePass(dnNumber) {
  const d = state.dispatches.find(item => item.dn_number === dnNumber);
  if (!d) return;
  const part = state.parts.find(p => p.part_number === d.part_number);
  const partName = part ? part.part_name : 'Automotive Fork Pipe Component';
  const rev = part ? part.revision : 'Approved';

  const win = window.open('', '_blank', 'width=760,height=650');
  win.document.write(`
    <html>
    <head>
      <title>Delivery Challan - ${d.dn_number}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 36px; color: #111; }
        .box { border: 2px solid #0f6b4b; padding: 26px; border-radius: 8px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f6b4b; padding-bottom: 14px; margin-bottom: 20px; }
        h1 { margin: 0; color: #0f6b4b; font-size: 22px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ccc; padding: 12px; text-align: left; }
        th { background: #f2f7f4; }
        .sigs { display: flex; justify-content: space-between; margin-top: 50px; }
        .sig-line { border-top: 1px solid #333; width: 190px; text-align: center; padding-top: 6px; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="header">
          <div>
            <h1>KRISHNA AUTOMOTIVES</h1>
            <div>Unit 01 • Precision Fork Pipe & Suspension Manufacturing</div>
          </div>
          <div style="text-align:right;">
            <strong>DELIVERY CHALLAN / GATE PASS</strong><br/>
            Challan No: <strong>${d.dn_number}</strong><br/>
            Time: ${d.dispatched_at}
          </div>
        </div>
        <p><strong>Consignee / Destination:</strong> ${d.destination}</p>
        <p><strong>QC Clearance Status:</strong> 100% Dimensional & Visual QC Approved</p>
        <table>
          <thead>
            <tr>
              <th>Part Number</th>
              <th>Part Description</th>
              <th>Drawing Rev</th>
              <th>Dispatched Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${d.part_number}</strong></td>
              <td>${partName}</td>
              <td>${rev}</td>
              <td><strong>${d.quantity} PCS</strong></td>
            </tr>
          </tbody>
        </table>
        <div class="sigs">
          <div class="sig-line">Prepared & Handed Over By<br/>(${d.handed_over_by})</div>
          <div class="sig-line">Quality Assurance Sign-Off<br/>(QC Cleared)</div>
          <div class="sig-line">Security / Gate Receiver</div>
        </div>
      </div>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `);
  win.document.close();
}

// Supervisor: Edit & Delete Part Functions
function openEditPartModal(id) {
  const part = state.parts.find(p => p.id === id);
  if (!part) return;

  document.getElementById('edit-part-id').value = part.id;
  document.getElementById('edit-part-subtitle').textContent = `Editing Part Number: ${part.part_number}`;
  document.getElementById('edit-part-name').value = part.part_name;
  document.getElementById('edit-part-rev').value = part.revision;
  document.getElementById('edit-part-target').value = part.target_qty;
  document.getElementById('edit-part-shift').value = part.shift;
  document.getElementById('edit-part-lead').value = part.person_in_charge;
  document.getElementById('edit-part-eta').value = part.eta_time;

  document.getElementById('edit-part-modal').style.display = 'grid';
}

function closeEditPartModal() {
  document.getElementById('edit-part-modal').style.display = 'none';
}

async function submitEditPart() {
  const id = document.getElementById('edit-part-id').value;
  const payload = {
    part_name: document.getElementById('edit-part-name').value.trim(),
    revision: document.getElementById('edit-part-rev').value.trim(),
    target_qty: document.getElementById('edit-part-target').value,
    shift: document.getElementById('edit-part-shift').value,
    person_in_charge: document.getElementById('edit-part-lead').value.trim(),
    eta_time: document.getElementById('edit-part-eta').value.trim()
  };

  const res = await fetch(`/api/parts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-supervisor-pin': supervisorPin },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closeEditPartModal();
    loadDashboard();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to update part.');
  }
}

async function deletePart(id, partNumber) {
  if (!confirm(`Delete part ${partNumber} from the Daily Plan? This cannot be undone.`)) return;

  const res = await fetch(`/api/parts/${id}`, {
    method: 'DELETE',
    headers: { 'x-supervisor-pin': supervisorPin }
  });

  if (res.ok) {
    loadDashboard();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to delete part.');
  }
}

// Form Submissions
document.getElementById('add-part-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const res = await fetch('/api/parts', {
    method: 'POST',
    headers: { 'x-supervisor-pin': supervisorPin },
    body: formData
  });
  if (res.ok) {
    e.target.reset();
    alert('New Part & Control Plan added!');
    loadDashboard();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to add part.');
  }
});

document.getElementById('production-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const res = await fetch('/api/production', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-supervisor-pin': supervisorPin },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    e.target.reset();
    alert('Production entry saved and sent to Quality Check queue!');
    loadDashboard();
    document.querySelector('[data-tab="quality-checks"]').click();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to save production lot.');
  }
});

document.getElementById('dispatch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const res = await fetch('/api/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-supervisor-pin': supervisorPin },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (res.ok) {
    e.target.reset();
    alert(`Dispatch Recorded! Delivery Note: ${result.dn_number}`);
    loadDashboard();
  } else {
    alert(result.error);
  }
});

// Initialize
updateRoleUI();
loadDashboard();