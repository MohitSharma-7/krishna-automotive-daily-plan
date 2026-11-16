const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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
  // 0. Settings Table (Stores Supervisor PIN)
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('supervisor_pin', '1234')`);

  // 1. Parts & Drawings Table
  db.run(`CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_number TEXT UNIQUE NOT NULL,
    part_name TEXT NOT NULL,
    revision TEXT NOT NULL,
    target_qty INTEGER NOT NULL,
    made_qty INTEGER DEFAULT 0,
    qc_cleared_qty INTEGER DEFAULT 0,
    rejected_qty INTEGER DEFAULT 0,
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

  db.run(`ALTER TABLE parts ADD COLUMN rejected_qty INTEGER DEFAULT 0`, () => {});

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

  // 4. Shift / Daily Archive History Table
  db.run(`CREATE TABLE IF NOT EXISTS shift_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,
    total_planned INTEGER NOT NULL,
    total_made INTEGER NOT NULL,
    total_qc_cleared INTEGER NOT NULL,
    total_rejected INTEGER NOT NULL,
    total_dispatched INTEGER NOT NULL,
    archived_by TEXT NOT NULL
  )`);

  // Seed initial realistic data if empty
  db.get('SELECT COUNT(*) AS count FROM parts', (err, row) => {
    if (row && row.count === 0) {
      const insertPart = db.prepare(`INSERT INTO parts (
        part_number, part_name, revision, target_qty, made_qty, qc_cleared_qty, rejected_qty, dispatched_qty,
        shift, person_in_charge, eta_time,
        od_spec, id_spec, length_spec, straightness_spec, surface_spec, bore_depth_spec, threading_depth_spec,
        drawing_file, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      insertPart.run(
        'F2FA461330', 'Fork Pipe (K405)', 'Rev XD', 1200, 960, 840, 15, 600,
        'Morning Shift (08:00 - 17:00)', 'Suresh Patel', '16:30 Today',
        '29.0 +0.05 / 0 mm', '24.0 mm (Bore 25 +0.12/+0.08)', '597.0 ± 0.2 mm',
        '0.05 mm Max', 'No burr, rust, dents or scratches', '46.1 +0.1 / 0 mm', 'M26x1-6H (Depth 27 mm)',
        'F2FA461330.pdf', '17 Nov 2026'
      );

      insertPart.run(
        'F2FA070330', 'Fork Pipe Machined (B104E)', 'Rev XB', 1000, 780, 720, 10, 500,
        'Morning Shift (08:00 - 17:00)', 'Amit Sharma', '16:45 Today',
        '28.5 mm / 26.05 +0.05 mm', '25.0 +0.12/+0.08 mm', '524.3 ± 0.2 mm',
        '0.05 mm Max', 'No dent/scratch marks after plating', '46.1 +0.1 / 0 mm', 'M26x1-6H (Depth 30 mm)',
        'F2FA070330.pdf', '17 Nov 2026'
      );

      insertPart.run(
        'F2FA449330', 'Fork Inner Tube Assembly', 'Rev XA', 800, 640, 600, 8, 450,
        'Evening Shift (17:00 - 01:00)', 'Vikram Singh', '23:30 Today',
        '30.0 ± 0.1 mm', '24.5 ± 0.08 mm', '580.0 ± 0.2 mm',
        '0.04 mm Max', 'Chrome finish Ra 0.2 max', '44.0 ± 0.1 mm', 'M26x1-6H (Depth 26 mm)',
        'F2FA461330.pdf', '16 Nov 2026'
      );

      insertPart.run(
        'F2FA445330', 'Suspension Damper Rod', 'Rev XC', 600, 300, 260, 12, 200,
        'Evening Shift (17:00 - 01:00)', 'Manoj Yadav', '00:30 Tomorrow',
        '26.3 +0.1 / 0 mm', '20.0 ± 0.05 mm', '495.0 ± 0.15 mm',
        '0.05 mm Max', 'Free from burrs at ID & OD', '38.5 ± 0.1 mm', 'M22x1-6H (Depth 22 mm)',
        'F2FA070330.pdf', '15 Nov 2026'
      );

      insertPart.finalize();

      const insertLot = db.prepare(`INSERT INTO qc_lots (
        part_number, revision, quantity, shift, person_in_charge, workstation,
        od_recorded, id_recorded, length_recorded, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      insertLot.run('F2FA461330', 'Rev XD', 120, 'Morning Shift', 'Suresh Patel', 'CNC Line 01', '29.02 mm', '24.01 mm', '597.05 mm', 'Awaiting QC', '14:20 Today');
      insertLot.run('F2FA070330', 'Rev XB', 60, 'Morning Shift', 'Amit Sharma', 'CNC Line 02', '28.51 mm', '25.04 mm', '524.25 mm', 'Awaiting QC', '14:45 Today');
      insertLot.finalize();

      const insertDispatch = db.prepare(`INSERT INTO dispatches (
        dn_number, part_number, quantity, handed_over_by, destination, dispatched_at
      ) VALUES (?, ?, ?, ?, ?, ?)`);

      insertDispatch.run('DN-060', 'F2FA461330', 600, 'Suresh Patel', 'Endurance Suspension Bay 1', '13:30 Today');
      insertDispatch.run('DN-059', 'F2FA070330', 500, 'Amit Sharma', 'Endurance Suspension Bay 2', '12:15 Today');
      insertDispatch.finalize();

      db.run(
        `INSERT INTO shift_history (archive_date, total_planned, total_made, total_qc_cleared, total_rejected, total_dispatched, archived_by)
         VALUES ('16 Nov 2026', 3600, 3480, 3410, 42, 3300, 'Rajesh Singh (Supervisor)')`
      );
    }
  });
});

// Middleware to verify Supervisor PIN from DB
function requireSupervisor(req, res, next) {
  const pin = req.headers['x-supervisor-pin'];
  if (!pin) return res.status(403).json({ error: 'Unauthorized: Supervisor PIN required.' });

  db.get("SELECT value FROM settings WHERE key = 'supervisor_pin'", (err, row) => {
    const currentPin = row ? row.value : '1234';
    if (pin !== currentPin) {
      return res.status(403).json({ error: 'Unauthorized: Invalid Supervisor PIN.' });
    }
    next();
  });
}

// Verify Supervisor PIN
app.post('/api/verify-pin', (req, res) => {
  const { pin } = req.body;
  db.get("SELECT value FROM settings WHERE key = 'supervisor_pin'", (err, row) => {
    const currentPin = row ? row.value : '1234';
    if (pin === currentPin) return res.json({ valid: true });
    return res.status(401).json({ valid: false, error: 'Invalid Supervisor PIN' });
  });
});

// Change Supervisor PIN
app.post('/api/change-pin', requireSupervisor, (req, res) => {
  const { currentPin, newPin } = req.body;
  if (!newPin || newPin.trim().length < 4) {
    return res.status(400).json({ error: 'New PIN must be at least 4 characters long.' });
  }

  db.get("SELECT value FROM settings WHERE key = 'supervisor_pin'", (err, row) => {
    const savedPin = row ? row.value : '1234';
    if (currentPin !== savedPin) {
      return res.status(401).json({ error: 'Current PIN is incorrect.' });
    }

    db.run("UPDATE settings SET value = ? WHERE key = 'supervisor_pin'", [newPin.trim()], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true });
    });
  });
});

app.get('/api/dashboard', (req, res) => {
  db.all('SELECT * FROM parts ORDER BY id ASC', (err, parts) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM qc_lots ORDER BY id DESC', (err2, lots) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.all('SELECT * FROM dispatches ORDER BY id DESC', (err3, dispatches) => {
        if (err3) return res.status(500).json({ error: err3.message });
        db.all('SELECT * FROM shift_history ORDER BY id DESC', (err4, history) => {
          if (err4) return res.status(500).json({ error: err4.message });
          res.json({ parts, lots, dispatches, history: history || [] });
        });
      });
    });
  });
});

app.post('/api/parts', requireSupervisor, upload.single('drawingFile'), (req, res) => {
  const {
    part_number, part_name, revision, target_qty, shift, person_in_charge, eta_time,
    od_spec, id_spec, length_spec, straightness_spec, surface_spec, bore_depth_spec, threading_depth_spec
  } = req.body;

  const drawing_file = req.file ? req.file.filename : 'F2FA461330.pdf';
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  db.run(
    `INSERT INTO parts (
      part_number, part_name, revision, target_qty, made_qty, qc_cleared_qty, rejected_qty, dispatched_qty,
      shift, person_in_charge, eta_time,
      od_spec, id_spec, length_spec, straightness_spec, surface_spec, bore_depth_spec, threading_depth_spec,
      drawing_file, updated_at
    ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

// Supervisor: Edit Part Target, Shift, In-Charge, or ETA
app.put('/api/parts/:id', requireSupervisor, (req, res) => {
  const { part_name, revision, target_qty, shift, person_in_charge, eta_time } = req.body;
  const partId = req.params.id;

  db.run(
    `UPDATE parts
     SET part_name = ?, revision = ?, target_qty = ?, shift = ?, person_in_charge = ?, eta_time = ?
     WHERE id = ?`,
    [part_name, revision, Number(target_qty), shift, person_in_charge, eta_time, partId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Part not found' });
      res.json({ success: true });
    }
  );
});

// Supervisor: Delete Part from Daily Plan
app.delete('/api/parts/:id', requireSupervisor, (req, res) => {
  const partId = req.params.id;

  db.get('SELECT part_number FROM parts WHERE id = ?', [partId], (err, part) => {
    if (err || !part) return res.status(404).json({ error: 'Part not found' });

    db.run('DELETE FROM parts WHERE id = ?', [partId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.run('DELETE FROM qc_lots WHERE part_number = ?', [part.part_number]);
      res.json({ success: true });
    });
  });
});

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

app.post('/api/qc/:id', requireSupervisor, (req, res) => {
  const { decision, inspector } = req.body;
  const lotId = req.params.id;

  db.get('SELECT * FROM qc_lots WHERE id = ?', [lotId], (err, lot) => {
    if (err || !lot) return res.status(404).json({ error: 'QC Lot not found' });

    db.run('UPDATE qc_lots SET status = ?, inspector = ? WHERE id = ?', [decision, inspector || 'QC Supervisor', lotId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      if (decision === 'Passed') {
        db.run('UPDATE parts SET qc_cleared_qty = qc_cleared_qty + ? WHERE part_number = ?', [lot.quantity, lot.part_number]);
      } else if (decision === 'Rejected') {
        db.run(
          'UPDATE parts SET made_qty = MAX(0, made_qty - ?), rejected_qty = COALESCE(rejected_qty, 0) + ? WHERE part_number = ?',
          [lot.quantity, lot.quantity, lot.part_number]
        );
      }
      res.json({ success: true });
    });
  });
});

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

app.post('/api/archive-day', requireSupervisor, (req, res) => {
  const archiveDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  db.all('SELECT * FROM parts', (err, parts) => {
    if (err) return res.status(500).json({ error: err.message });

    let planned = 0, made = 0, cleared = 0, rejected = 0, dispatched = 0;
    parts.forEach(p => {
      planned += p.target_qty;
      made += p.made_qty;
      cleared += p.qc_cleared_qty;
      rejected += (p.rejected_qty || 0);
      dispatched += p.dispatched_qty;
    });

    db.run(
      `INSERT INTO shift_history (archive_date, total_planned, total_made, total_qc_cleared, total_rejected, total_dispatched, archived_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Rajesh Singh (Supervisor)')`,
      [archiveDate, planned, made, cleared, rejected, dispatched],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.run('UPDATE parts SET made_qty = 0, qc_cleared_qty = 0, rejected_qty = 0, dispatched_qty = 0', () => {
          db.run('DELETE FROM qc_lots', () => {
            db.run('DELETE FROM dispatches', () => {
              res.json({ success: true });
            });
          });
        });
      }
    );
  });
});

app.listen(PORT, () => {
  console.log(`Krishna Automotives Daily Plan running at http://localhost:${PORT}`);
});