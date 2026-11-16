const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SUPERVISOR_PIN = '1234'; // Supervisor PIN for demo (easy to share with professor)

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'drawings');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure file upload for new CAD drawings
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite Database
const db = new sqlite3.Database(path.join(__dirname, 'krishna_automotive.db'));

db.serialize(() => {
  // 1. Parts & Drawings Table (Control Plan + Daily Targets)
  db.run(`CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_number TEXT UNIQUE NOT NULL,
    part_name TEXT NOT NULL,
    revision TEXT NOT NULL,
    target_qty INTEGER NOT NULL,
    made_qty INTEGER DEFAULT 0,
    qc_cleared_qty INTEGER DEFAULT 0,
    dispatched_qty INTEGER DEFAULT 0,
    shift TEXT NOT NULL,
    person_in_charge TEXT NOT NULL,
    eta_time TEXT NOT NULL,
    od_spec TEXT,
    id_spec TEXT,
    length_spec TEXT,
    straightness_spec TEXT,
    surface_spec TEXT,
    bore_depth_spec TEXT,
    threading_depth_spec TEXT,
    drawing_file TEXT,
    updated_at TEXT
  )`);

  // 2. Production & QC Lots Table
  db.run(`CREATE TABLE IF NOT EXISTS qc_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_number TEXT NOT NULL,
    revision TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    shift TEXT NOT NULL,
    person_in_charge TEXT NOT NULL,
    workstation TEXT,
    od_recorded TEXT,
    id_recorded TEXT,
    length_recorded TEXT,
    status TEXT DEFAULT 'Awaiting QC',
    inspector TEXT,
    created_at TEXT
  )`);

  // 3. Dispatch Register Table
  db.run(`CREATE TABLE IF NOT EXISTS dispatches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dn_number TEXT NOT NULL,
    part_number TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    handed_over_by TEXT NOT NULL,
    destination TEXT NOT NULL,
    dispatched_at TEXT
  )`);

  // Seed initial realistic data from your CAD drawings if empty
  db.get('SELECT COUNT(*) AS count FROM parts', (err, row) => {
    if (row && row.count === 0) {
      const insertPart = db.prepare(`INSERT INTO parts (
        part_number, part_name, revision, target_qty, made_qty, qc_cleared_qty, dispatched_qty,
        shift, person_in_charge, eta_time,
        od_spec, id_spec, length_spec, straightness_spec, surface_spec, bore_depth_spec, threading_depth_spec,
        drawing_file, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      insertPart.run(
        'F2FA461330', 'Fork Pipe (K405)', 'Rev XD', 1200, 960, 840, 600,
        'Morning Shift (08:00 - 17:00)', 'Suresh Patel', '16:30 Today',
        '29.0 +0.05 / 0 mm', '24.0 mm (Bore 25 +0.12/+0.08)', '597.0 ± 0.2 mm',
        '0.05 mm Max', 'No burr, rust, dents or scratches', '46.1 +0.1 / 0 mm', 'M26x1-6H (Depth 27 mm)',
        'F2FA461330.pdf', '16 Nov 2026'
      );

      insertPart.run(
        'F2FA070330', 'Fork Pipe Machined (B104E)', 'Rev XB', 1000, 780, 720, 500,
        'Morning Shift (08:00 - 17:00)', 'Amit Sharma', '16:45 Today',
        '28.5 mm / 26.05 +0.05 mm', '25.0 +0.12/+0.08 mm', '524.3 ± 0.2 mm',
        '0.05 mm Max', 'No dent/scratch marks after plating', '46.1 +0.1 / 0 mm', 'M26x1-6H (Depth 30 mm)',
        'F2FA070330.pdf', '16 Nov 2026'
      );

      insertPart.run(
        'F2FA449330', 'Fork Inner Tube Assembly', 'Rev XA', 800, 640, 600, 450,
        'Evening Shift (17:00 - 01:00)', 'Vikram Singh', '23:30 Today',
        '30.0 ± 0.1 mm', '24.5 ± 0.08 mm', '580.0 ± 0.2 mm',
        '0.04 mm Max', 'Chrome finish Ra 0.2 max', '44.0 ± 0.1 mm', 'M26x1-6H (Depth 26 mm)',
        'F2FA461330.pdf', '15 Nov 2026'
      );

      insertPart.run(
        'F2FA445330', 'Suspension Damper Rod', 'Rev XC', 600, 300, 260, 200,
        'Evening Shift (17:00 - 01:00)', 'Manoj Yadav', '00:30 Tomorrow',
        '26.3 +0.1 / 0 mm', '20.0 ± 0.05 mm', '495.0 ± 0.15 mm',
        '0.05 mm Max', 'Free from burrs at ID & OD', '38.5 ± 0.1 mm', 'M22x1-6H (Depth 22 mm)',
        'F2FA070330.pdf', '14 Nov 2026'
      );

      insertPart.finalize();

      // Seed initial pending QC lots
      const insertLot = db.prepare(`INSERT INTO qc_lots (
        part_number, revision, quantity, shift, person_in_charge, workstation,
        od_recorded, id_recorded, length_recorded, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      insertLot.run('F2FA461330', 'Rev XD', 120, 'Morning Shift', 'Suresh Patel', 'CNC Line 01', '29.02 mm', '24.01 mm', '597.05 mm', 'Awaiting QC', '14:20 Today');
      insertLot.run('F2FA070330', 'Rev XB', 60, 'Morning Shift', 'Amit Sharma', 'CNC Line 02', '28.51 mm', '25.04 mm', '524.25 mm', 'Awaiting QC', '14:45 Today');
      insertLot.finalize();

      // Seed initial Dispatch register
      const insertDispatch = db.prepare(`INSERT INTO dispatches (
        dn_number, part_number, quantity, handed_over_by, destination, dispatched_at
      ) VALUES (?, ?, ?, ?, ?, ?)`);

      insertDispatch.run('DN-060', 'F2FA461330', 600, 'Suresh Patel', 'Endurance Suspension Bay 1', '13:30 Today');
      insertDispatch.run('DN-059', 'F2FA070330', 500, 'Amit Sharma', 'Endurance Suspension Bay 2', '12:15 Today');
      insertDispatch.finalize();
    }
  });
});

// Middleware to verify Supervisor PIN
function requireSupervisor(req, res, next) {
  const pin = req.headers['x-supervisor-pin'];
  if (pin !== SUPERVISOR_PIN) {
    return res.status(403).json({ error: 'Unauthorized: Supervisor PIN required.' });
  }
  next();
}

// API: Verify Supervisor PIN
app.post('/api/verify-pin', (req, res) => {
  const { pin } = req.body;
  if (pin === SUPERVISOR_PIN) {
    return res.json({ valid: true });
  }
  return res.status(401).json({ valid: false, error: 'Invalid Supervisor PIN' });
});

// API: Get Complete Dashboard State
app.get('/api/dashboard', (req, res) => {
  db.all('SELECT * FROM parts ORDER BY id ASC', (err, parts) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM qc_lots ORDER BY id DESC', (err2, lots) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.all('SELECT * FROM dispatches ORDER BY id DESC', (err3, dispatches) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ parts, lots, dispatches });
      });
    });
  });
});

// API: Supervisor - Add New Part & Drawing
app.post('/api/parts', requireSupervisor, upload.single('drawingFile'), (req, res) => {
  const {
    part_number, part_name, revision, target_qty, shift, person_in_charge, eta_time,
    od_spec, id_spec, length_spec, straightness_spec, surface_spec, bore_depth_spec, threading_depth_spec
  } = req.body;

  const drawing_file = req.file ? req.file.filename : 'F2FA461330.pdf';
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  db.run(
    `INSERT INTO parts (
      part_number, part_name, revision, target_qty, made_qty, qc_cleared_qty, dispatched_qty,
      shift, person_in_charge, eta_time,
      od_spec, id_spec, length_spec, straightness_spec, surface_spec, bore_depth_spec, threading_depth_spec,
      drawing_file, updated_at
    ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      part_number, part_name, revision, Number(target_qty), shift, person_in_charge, eta_time,
      od_spec, id_spec, length_spec, straightness_spec, surface_spec, bore_depth_spec, threading_depth_spec,
      drawing_file, today
    ],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// API: Supervisor - Log Production Entry (Adds to Made Qty + Creates QC Lot)
app.post('/api/production', requireSupervisor, (req, res) => {
  const { part_number, quantity, shift, person_in_charge, workstation, od_recorded, id_recorded, length_recorded } = req.body;
  const qty = Number(quantity);

  db.get('SELECT * FROM parts WHERE part_number = ?', [part_number], (err, part) => {
    if (err || !part) return res.status(404).json({ error: 'Part not found' });

    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' Today';

    db.run('UPDATE parts SET made_qty = made_qty + ? WHERE part_number = ?', [qty, part_number], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.run(
        `INSERT INTO qc_lots (
          part_number, revision, quantity, shift, person_in_charge, workstation,
          od_recorded, id_recorded, length_recorded, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Awaiting QC', ?)`,
        [part_number, part.revision, qty, shift, person_in_charge, workstation, od_recorded, id_recorded, length_recorded, timeNow],
        function (err3) {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ success: true });
        }
      );
    });
  });
});

// API: Supervisor - Approve or Reject QC Lot
app.post('/api/qc/:id', requireSupervisor, (req, res) => {
  const { decision, inspector } = req.body; // 'Passed' or 'Rejected'
  const lotId = req.params.id;

  db.get('SELECT * FROM qc_lots WHERE id = ?', [lotId], (err, lot) => {
    if (err || !lot) return res.status(404).json({ error: 'QC Lot not found' });

    db.run('UPDATE qc_lots SET status = ?, inspector = ? WHERE id = ?', [decision, inspector || 'QC Supervisor', lotId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      if (decision === 'Passed') {
        db.run('UPDATE parts SET qc_cleared_qty = qc_cleared_qty + ? WHERE part_number = ?', [lot.quantity, lot.part_number]);
      } else if (decision === 'Rejected') {
        db.run('UPDATE parts SET made_qty = MAX(0, made_qty - ?) WHERE part_number = ?', [lot.quantity, lot.part_number]);
      }
      res.json({ success: true });
    });
  });
});

// API: Supervisor - Record Dispatch (Only from QC-Cleared Ready Stock)
app.post('/api/dispatch', requireSupervisor, (req, res) => {
  const { part_number, quantity, handed_over_by, destination } = req.body;
  const qty = Number(quantity);

  db.get('SELECT * FROM parts WHERE part_number = ?', [part_number], (err, part) => {
    if (err || !part) return res.status(404).json({ error: 'Part not found' });

    const readyStock = part.qc_cleared_qty - part.dispatched_qty;
    if (qty > readyStock) {
      return res.status(400).json({ error: `Only ${readyStock} QC-cleared pieces are ready for dispatch.` });
    }

    const dnNumber = 'DN-' + Math.floor(100 + Math.random() * 900);
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' Today';

    db.run('UPDATE parts SET dispatched_qty = dispatched_qty + ? WHERE part_number = ?', [qty, part_number], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.run(
        'INSERT INTO dispatches (dn_number, part_number, quantity, handed_over_by, destination, dispatched_at) VALUES (?, ?, ?, ?, ?, ?)',
        [dnNumber, part_number, qty, handed_over_by, destination, timeNow],
        (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ success: true, dn_number: dnNumber });
        }
      );
    });
  });
});

app.listen(PORT, () => {
  console.log(`Krishna Automotives Daily Plan running at http://localhost:${PORT}`);
});