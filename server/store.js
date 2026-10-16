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

// 软件2402班学生名册（学号 + 姓名；不含手机号等隐私信息）
export const STUDENTS = [
  { id: 's2431081147', name: '许东宁', studentNo: '2431081147' },
  { id: 's2431211144', name: '刘思甜', studentNo: '2431211144' },
  { id: 's2431241108', name: '郝钰东', studentNo: '2431241108' },
  { id: 's2431271201', name: '邓博瀚', studentNo: '2431271201' },
  { id: 's2431271202', name: '王佳鹏', studentNo: '2431271202' },
  { id: 's2431271203', name: '杨军军', studentNo: '2431271203' },
  { id: 's2431271204', name: '姚元乐', studentNo: '2431271204' },
  { id: 's2431271205', name: '向一鸣', studentNo: '2431271205' },
  { id: 's2431271206', name: '赵一龙', studentNo: '2431271206' },
  { id: 's2431271207', name: '王羿博', studentNo: '2431271207' },
  { id: 's2431271208', name: '赵文卓', studentNo: '2431271208' },
  { id: 's2431271209', name: '丁一凡', studentNo: '2431271209' },
  { id: 's2431271210', name: '高铭启', studentNo: '2431271210' },
  { id: 's2431271211', name: '张润新', studentNo: '2431271211' },
  { id: 's2431271212', name: '刘奕恒', studentNo: '2431271212' },
  { id: 's2431271213', name: '贾景顺', studentNo: '2431271213' },
  { id: 's2431271215', name: '路琰', studentNo: '2431271215' },
  { id: 's2431271216', name: '刘佳奇', studentNo: '2431271216' },
  { id: 's2431271217', name: '郭昊同', studentNo: '2431271217' },
  { id: 's2431271218', name: '姚佳坤', studentNo: '2431271218' },
  { id: 's2431271219', name: '薛浩晨', studentNo: '2431271219' },
  { id: 's2431271220', name: '朱海瑞', studentNo: '2431271220' },
  { id: 's2431271221', name: '张和浩', studentNo: '2431271221' },
  { id: 's2431271222', name: '蒋籽航', studentNo: '2431271222' },
  { id: 's2431271223', name: '郝瑞星', studentNo: '2431271223' },
  { id: 's2431271224', name: '王涛', studentNo: '2431271224' },
  { id: 's2431271225', name: '史志成', studentNo: '2431271225' },
  { id: 's2431271226', name: '付文强', studentNo: '2431271226' },
  { id: 's2431271227', name: '李鑫', studentNo: '2431271227' },
  { id: 's2431271228', name: '李柏龙', studentNo: '2431271228' },
  { id: 's2431271230', name: '杨凤仪', studentNo: '2431271230' },
  { id: 's2431271231', name: '龚洁雅', studentNo: '2431271231' },
  { id: 's2431271232', name: '董美妙', studentNo: '2431271232' },
  { id: 's2431271233', name: '冯佳源', studentNo: '2431271233' },
  { id: 's2431271234', name: '赵欣宇', studentNo: '2431271234' },
  { id: 's2431271235', name: '姚一晨', studentNo: '2431271235' },
  { id: 's2431271236', name: '周星怡', studentNo: '2431271236' },
  { id: 's2431271237', name: '董涵瑾', studentNo: '2431271237' },
  { id: 's2431271238', name: '王怡欣', studentNo: '2431271238' },
  { id: 's2431271239', name: '王张敏', studentNo: '2431271239' },
  { id: 's2431271240', name: '赵怡欣', studentNo: '2431271240' },
  { id: 's2431271241', name: '孙景怡', studentNo: '2431271241' },
  { id: 's2431271242', name: '肖羽彤', studentNo: '2431271242' },
  { id: 's2431271244', name: '张梓烨', studentNo: '2431271244' },
  { id: 's2431271245', name: '王沛茹', studentNo: '2431271245' },
  { id: 's2431271246', name: '郭嘉睿', studentNo: '2431271246' },
  { id: 's2431271247', name: '孙琦', studentNo: '2431271247' },
  { id: 's2431271248', name: '张玉茹', studentNo: '2431271248' },
  { id: 's2431271249', name: '胡漠雪', studentNo: '2431271249' },
  { id: 's2431271250', name: '沙莹莹', studentNo: '2431271250' },
];

// 软件2402班课程表（来自班级课表；day: 1=周一…7=周日）
// 用于「按当天课程」自动带出本节次的上课教室
export const TIMETABLE = [
  { day: 3, section: '1-2', course: '操作系统', room: '2号教学楼403', building: '2号教学楼', teacher: '李建廷', weeks: '1-15周(单)' },
  { day: 4, section: '1-2', course: '互联网+创业', room: '1号教学楼101', building: '1号教学楼', teacher: '谢晶', weeks: '1-16周' },
  { day: 5, section: '1-2', course: '软件工程', room: '实验楼401', building: '实验楼', teacher: '史西兵', weeks: '1-15周(单)' },
  { day: 2, section: '3-4', course: '软件项目管理', room: '实验楼316', building: '实验楼', teacher: '查欣洁', weeks: '9-16周' },
  { day: 3, section: '3-4', course: '软件工程', room: '实验楼402', building: '实验楼', teacher: '史西兵', weeks: '1-16周' },
  { day: 4, section: '3-4', course: '软件项目管理', room: '实验楼316', building: '实验楼', teacher: '查欣洁', weeks: '9-16周' },
  { day: 5, section: '3-4', course: '编译原理', room: '实验楼502', building: '实验楼', teacher: '李梦阁', weeks: '1-16周' },
  { day: 1, section: '5-6', course: '大学英语听说', room: '实验楼204', building: '实验楼', teacher: '张稚敏', weeks: '1-16周' },
  { day: 2, section: '5-6', course: '习近平新时代中国特色社会主义思想概论', room: '2号教学楼302', building: '2号教学楼', teacher: '杨璐静', weeks: '1-16周' },
  { day: 5, section: '5-6', course: 'Java Web 开发技术', room: '实验楼407', building: '实验楼', teacher: '刘通', weeks: '1-15周(单)' },
  { day: 1, section: '7-8', course: '操作系统', room: '2号教学楼109', building: '2号教学楼', teacher: '李建廷', weeks: '1-16周' },
  { day: 2, section: '7-8', course: 'Java Web 开发技术', room: '实验楼408', building: '实验楼', teacher: '刘通', weeks: '1-16周' },
  { day: 4, section: '7-8', course: '习近平新时代中国特色社会主义思想概论', room: '2号教学楼109', building: '2号教学楼', teacher: '杨璐静', weeks: '2-16周(双)' },
];

// 节次对应的上课时间（供前端按浏览器本地时间匹配本节次课程）
export const SECTION_TIMES = {
  '1-2': { start: '08:00', end: '09:40' },
  '3-4': { start: '10:00', end: '11:40' },
  '5-6': { start: '14:00', end: '15:40' },
  '7-8': { start: '16:00', end: '17:40' },
};

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
    // 手动标记（请假/缺勤/代签等）没有设备指纹，跳过，避免污染设备占用表
    if (!r.deviceFingerprint) continue;
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
  // 围栏中心：优先学委在教室现场取的坐标，精确到本栋楼；未取点时回退班级默认坐标
  const hasPoint = input.lat != null && input.lng != null && input.lat !== '' && input.lng !== '';
  const s = {
    id: uid('cs_'),
    classId,
    title: input.title || '课堂签到',
    course: input.course || '',
    building: input.building || '',
    center: hasPoint ? { lat: Number(input.lat), lng: Number(input.lng) } : { lat: cls.lat, lng: cls.lng },
    radiusMeters: Number(input.radiusMeters) || cls.radiusMeters,
    roomName: input.roomName || cls.roomName,
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

// 学委可手动设置的状态（用于请假、迟到、缺勤、代签等人工标记）
export const MANUAL_STATUSES = ['present', 'late', 'leave', 'absent', 'proxy'];

/**
 * 手动设置某学生在一场签到中的状态。
 * - 若该生已有记录（签到或人工），直接改写其状态；
 * - 若没有记录，则补一条人工记录，保证该生的状态可被持久化与统计。
 */
export function setStudentStatus(sessionId, studentId, status) {
  if (!MANUAL_STATUSES.includes(status)) throw new Error('不支持的状态');
  const s = sessions.find((x) => x.id === sessionId);
  if (!s) return null;
  const stu = STUDENTS.find((x) => x.id === studentId);
  if (!stu) return null;

  let latest = null;
  for (const r of s.records) {
    if (r.studentId !== studentId) continue;
    if (!latest || r.createdAt >= latest.createdAt) latest = r;
  }
  if (latest) {
    latest.status = status;
    latest.reviewedAt = now();
    persistRecordStatus(latest);
    return latest;
  }

  const rec = {
    id: uid('r_'),
    studentId,
    name: stu.name,
    studentNo: stu.studentNo,
    checkinType: 'manual',
    status,
    flags: [],
    distance: null,
    location: null,
    deviceFingerprint: null,
    photo: null,
    motionScore: null,
    createdAt: now(),
    reviewedAt: now(),
  };
  s.records.push(rec);
  persistRecord(sessionId, rec);
  return rec;
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
