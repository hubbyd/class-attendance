// SQLite 持久化层：使用 Node 内置 node:sqlite，零原生依赖
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 允许通过 DATA_DIR 指定数据目录（云平台可挂载持久磁盘到该目录）
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'attendance.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

/* ---------------- 建表（幂等） ---------------- */

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, studentNo TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, roomName TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, radiusMeters REAL NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS class_students (
  classId TEXT NOT NULL, studentId TEXT NOT NULL,
  PRIMARY KEY (classId, studentId)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, classId TEXT NOT NULL, title TEXT NOT NULL, roomName TEXT,
  lat REAL NOT NULL, lng REAL NOT NULL, radiusMeters REAL NOT NULL,
  startAt INTEGER NOT NULL, endAt INTEGER NOT NULL,
  status TEXT NOT NULL, secret TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, studentId TEXT NOT NULL,
  name TEXT NOT NULL, studentNo TEXT NOT NULL, checkinType TEXT NOT NULL,
  status TEXT NOT NULL, flags TEXT, distance INTEGER,
  locationLat REAL, locationLng REAL, accuracy REAL,
  deviceFingerprint TEXT, photo TEXT, motionScore REAL,
  createdAt INTEGER NOT NULL, reviewedAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_records_session ON records(sessionId);
CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(classId);
`);

export { db };

/* ---------------- students ---------------- */

export function ensureStudents(students) {
  const stmt = db.prepare('INSERT OR IGNORE INTO students (id, name, studentNo) VALUES (?, ?, ?)');
  students.forEach((s) => stmt.run(s.id, s.name, s.studentNo));
}

export function allStudents() {
  return db.prepare('SELECT id, name, studentNo FROM students').all();
}

/* ---------------- classes ---------------- */

export function insertClass(c) {
  db.prepare(
    `INSERT INTO classes (id, name, roomName, lat, lng, radiusMeters, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(c.id, c.name, c.roomName, c.lat, c.lng, c.radiusMeters, c.createdAt);
  const cs = db.prepare('INSERT INTO class_students (classId, studentId) VALUES (?, ?)');
  c.studentIds.forEach((sid) => cs.run(c.id, sid));
}

export function allClasses() {
  const classes = db.prepare('SELECT * FROM classes ORDER BY createdAt').all();
  const cs = db.prepare('SELECT studentId FROM class_students WHERE classId = ?');
  return classes.map((c) => ({ ...c, studentIds: cs.all(c.id).map((r) => r.studentId) }));
}

/* ---------------- sessions ---------------- */

export function insertSession(s) {
  db.prepare(
    `INSERT INTO sessions (id, classId, title, roomName, lat, lng, radiusMeters, startAt, endAt, status, secret)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    s.id, s.classId, s.title, s.roomName,
    s.center.lat, s.center.lng, s.radiusMeters,
    s.startAt, s.endAt, s.status,
    s.secret.toString('hex'),
  );
}

export function allSessions() {
  const sessions = db.prepare('SELECT * FROM sessions').all();
  const recStmt = db.prepare('SELECT * FROM records WHERE sessionId = ? ORDER BY createdAt');
  return sessions.map((s) => ({
    ...s,
    center: { lat: s.lat, lng: s.lng },
    secret: Buffer.from(s.secret, 'hex'),
    records: recStmt.all(s.id).map((r) => ({
      ...r,
      flags: r.flags ? JSON.parse(r.flags) : [],
      location:
        r.locationLat != null
          ? { lat: r.locationLat, lng: r.locationLng, accuracy: r.accuracy }
          : null,
    })),
  }));
}

export function updateSessionStatus(id, status, endAt) {
  db.prepare('UPDATE sessions SET status = ?, endAt = ? WHERE id = ?').run(status, endAt, id);
}

/* ---------------- records ---------------- */

export function insertRecord(r) {
  db.prepare(
    `INSERT INTO records
       (id, sessionId, studentId, name, studentNo, checkinType, status, flags, distance,
        locationLat, locationLng, accuracy, deviceFingerprint, photo, motionScore, createdAt, reviewedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    r.id, r.sessionId, r.studentId, r.name, r.studentNo, r.checkinType, r.status,
    JSON.stringify(r.flags || []),
    r.distance,
    r.location ? r.location.lat : null,
    r.location ? r.location.lng : null,
    r.location ? r.location.accuracy : null,
    r.deviceFingerprint,
    r.photo,
    r.motionScore,
    r.createdAt,
    r.reviewedAt ?? null,
  );
}

export function updateRecordStatus(id, status, reviewedAt) {
  db.prepare('UPDATE records SET status = ?, reviewedAt = ? WHERE id = ?').run(status, reviewedAt, id);
}
