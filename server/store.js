import crypto from 'node:crypto';
import {
  ensureStudents,
  allStudents,
  allClasses,
  insertClass,
  allSessions,
  insertSession,
  updateSessionStatus,
  insertRecord,
  updateRecordStatus,
} from './db.js';

export const now = () => Date.now();
export const uid = (p = 'id_') => p + crypto.randomBytes(6).toString('hex');

// 动态口令/二维码轮换周期（毫秒）
export const PASSCODE_PERIOD_MS = 15000;

// 演示用学生名册
export const STUDENTS = [
  { id: 's01', name: '张三', studentNo: '20210101' },
  { id: 's02', name: '李四', studentNo: '20210102' },
  { id: 's03', name: '王五', studentNo: '20210103' },
  { id: 's04', name: '赵六', studentNo: '20210104' },
  { id: 's05', name: '钱七', studentNo: '20210105' },
  { id: 's06', name: '孙八', studentNo: '20210106' },
];

// 内存态（启动时从 SQLite 水化）
export const classes = [];
export const sessions = [];
// 全局设备指纹索引：deviceId -> Set(studentId)，跨场次识别“同设备多签到”
export const deviceIndex = new Map();

const newSecret = () => crypto.randomBytes(16);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// 由会话密钥 + 时间窗派生动态口令（HMAC），教师端与学生端共用
export function passcodeFor(session, t = now()) {
  const win = Math.floor(t / PASSCODE_PERIOD_MS);
  const h = crypto.createHmac('sha256', session.secret).update(String(win)).digest();
  return String(h.readUInt32BE(0) % 1000000).padStart(6, '0');
}

export function secondsToRotate(t = now()) {
  return Math.ceil((PASSCODE_PERIOD_MS - (t % PASSCODE_PERIOD_MS)) / 1000);
}

// 允许当前窗口与上一个窗口（30s 内）的口令，过期即失效
export function checkPasscode(session, code, t = now()) {
  if (!code) return false;
  const win = Math.floor(t / PASSCODE_PERIOD_MS);
  for (let w = win; w >= win - 1; w--) {
    const h = crypto.createHmac('sha256', session.secret).update(String(w)).digest();
    const c = String(h.readUInt32BE(0) % 1000000).padStart(6, '0');
    if (c === String(code).trim()) return true;
  }
  return false;
}

// 按场次已确认的记录（非 rejected）重建：设备占用表、照片复用表
export function rebuildSessionIndexes(session) {
  session.deviceMap = new Map();
  session.photoHashes = new Map();
  for (const r of session.records) {
    if (r.status === 'rejected') continue;
    session.deviceMap.set(r.deviceFingerprint, r.studentId);
    if (r.photo) session.photoHashes.set(sha(r.photo), r.studentId);
    if (!deviceIndex.has(r.deviceFingerprint)) deviceIndex.set(r.deviceFingerprint, new Set());
    deviceIndex.get(r.deviceFingerprint).add(r.studentId);
  }
}

export function createClass(input) {
  const cls = {
    id: input.id || uid('c_'),
    name: input.name,
    roomName: input.roomName,
    lat: Number(input.lat),
    lng: Number(input.lng),
    radiusMeters: Number(input.radiusMeters) || 100,
    studentIds: input.studentIds && input.studentIds.length ? input.studentIds : STUDENTS.map((s) => s.id),
    createdAt: now(),
  };
  insertClass(cls);
  classes.push(cls);
  return cls;
}

export function createSession(classId, input = {}) {
  const cls = classes.find((c) => c.id === classId);
  if (!cls) throw new Error('班级不存在');
  const durationMin = Number(input.durationMin) || 10;
  const s = {
    id: uid('cs_'),
    classId,
    title: input.title || '课堂签到',
    center: { lat: cls.lat, lng: cls.lng },
    radiusMeters: cls.radiusMeters,
    roomName: cls.roomName,
    startAt: now(),
    endAt: now() + durationMin * 60000,
    status: 'active',
    secret: newSecret(),
    records: [],
    deviceMap: new Map(),
    photoHashes: new Map(),
  };
  insertSession(s);
  sessions.push(s);
  return s;
}

export function persistSessionStatus(session) {
  updateSessionStatus(session.id, session.status, session.endAt);
}

// 签到记录落库（含 sessionId）
export function persistRecord(sessionId, record) {
  insertRecord({ ...record, sessionId });
}

export function persistRecordStatus(record) {
  updateRecordStatus(record.id, record.status, record.reviewedAt ?? null);
}

// 从 SQLite 启动时水化内存态
export function hydrate() {
  ensureStudents(STUDENTS);
  classes.push(...allClasses());
  sessions.push(...allSessions());
  for (const s of sessions) rebuildSessionIndexes(s);
}

export function seed() {
  // 仅当库内尚无班级时播种：西安财经大学 长安校区 · 软件2402班
  if (classes.length === 0) {
    createClass({
      // 固定班级 id：保证固定签到入口链接在每次重新部署后依然不变
      id: 'c_soft2402',
      name: '软件2402班',
      roomName: '西安财经大学·长安校区',
      // 长安校区坐标（WGS-84，与手机浏览器定位一致）：西安市长安区常宁大街360号
      lat: 34.116844,
      lng: 108.929497,
      // 课表涉及 1号教学楼 / 2号教学楼 / 实验楼 等多个楼宇，
      // 故围栏覆盖整个校区核心区（可按需收窄）
      radiusMeters: 800,
    });
  }
  return classes[0];
}

// 重新加载学生名单（若库中已被扩充）
export function reloadStudents() {
  return allStudents();
}
