let state = { parts: [], lots: [], dispatches: [] };
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
  document.getElementById('prod-locked-notice').style.display = isSup ? 'none' : 'block';
  document.getElementById('prod-form-card').style.display = isSup ? 'block' : 'none';
  document.getElementById('dispatch-form-card').style.display = isSup ? 'block' : 'none';
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
    alert('Incorrect PIN. Use 1234 for Supervisor access.');
  }
}

// Fetch Dashboard Data
async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  state = await res.json();
  renderDailyPlan();
  renderDrawings();
  renderForms();
  renderQCLots();
  renderDispatches();
}

function renderDailyPlan() {
  const filter = document.getElementById('shift-filter').value;
  const filtered = state.parts.filter(p => filter === 'ALL' || p.shift.includes(filter));

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

  const tbody = document.getElementById('daily-plan-tbody');
  tbody.innerHTML = filtered.map(p => {
    const balance = Math.max(0, p.target_qty - p.made_qty);
    const pct = Math.round((p.made_qty / p.target_qty) * 100);
    const onTrack = pct >= 65;
    return `
      <tr>
        <td><strong>${p.part_number}</strong><div class="muted">${p.part_name}</div></td>
        <td><strong>${p.target_qty}</strong></td>
        <td>${p.made_qty}</td>
        <td>${balance}</td>
        <td>${p.dispatched_qty}</td>
        <td><strong>${p.person_in_charge}</strong><div class="muted">${p.shift}</div></td>
        <td>
          <span class="${onTrack ? 'pill-emerald' : 'pill-amber'}">${onTrack ? 'On track' : 'Needs focus'} (${pct}%)</span>
          <div class="muted">ETA: ${p.eta_time}</div>
        </td>
        <td><button class="btn-secondary" onclick="openDrawingByPart('${p.part_number}')">${p.revision} ↗</button></td>
      </tr>
    `;
  }).join('');
}

document.getElementById('shift-filter').addEventListener('change', renderDailyPlan);

function renderDrawings() {
  const container = document.getElementById('drawing-cards-container');
  container.innerHTML = state.parts.map(p => `
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

function openDrawingByPart(partNumber) {
  const part = state.parts.find(p => p.part_number === partNumber);
  if (!part) return;

  // Switch to Drawing Library tab
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

  const isSup = Boolean(supervisorPin);
  const container = document.getElementById('qc-lots-container');
  if (state.lots.length === 0) {
    container.innerHTML = '<p class="muted">No lots logged yet.</p>';
    return;
  }

  container.innerHTML = state.lots.map(l => `
    <div class="qc-item">
      <div>
        <strong>${l.part_number} (${l.revision}) — ${l.quantity} pcs</strong>
        <div class="muted">Lead: ${l.person_in_charge} • ${l.shift} • Workstation: ${l.workstation || 'Line 1'} (${l.created_at})</div>
        <div class="muted" style="margin-top:4px;">Recorded Specs → OD: <strong>${l.od_recorded}</strong> | ID: <strong>${l.id_recorded}</strong> | Length: <strong>${l.length_recorded}</strong></div>
      </div>
      <div>
        ${l.status === 'Awaiting QC'
          ? (isSup
              ? `<button class="btn-primary" onclick="decideQC(${l.id}, 'Passed')">✓ Approve Lot</button>
                 <button class="btn-danger" onclick="decideQC(${l.id}, 'Rejected')">✕ Reject</button>`
              : `<span class="pill-amber">Awaiting Supervisor QC</span>`)
          : `<span class="${l.status === 'Passed' ? 'pill-emerald' : 'pill-amber'}">${l.status} (${l.inspector})</span>`
        }
      </div>
    </div>
  `).join('');
}

async function decideQC(id, decision) {
  const res = await fetch(`/api/qc/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-supervisor-pin': supervisorPin },
    body: JSON.stringify({ decision, inspector: 'Rajesh Kumar (Supervisor)' })
  });
  if (res.ok) loadDashboard();
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
    </tr>
  `).join('');
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