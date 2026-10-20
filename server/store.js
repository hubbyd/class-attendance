import crypto from 'node:crypto';
import {
  ensureStudents,
  insertStudentsFull,
  clearAll,
  allStudents,
  allClasses,
  insertClass,
  deleteClass as deleteClassRow,
  allSessions,
  insertSession,
  updateSessionStatus,
  insertRecord,
  updateRecordStatus,
  setFaceDescriptor as setFaceDescriptorRow,
} from './db.js';

export const now = () => Date.now();
export const uid = (p = 'id_') => p + crypto.randomBytes(6).toString('hex');

// 数据版本号：任何写操作后自增。学委端据此判断本地备份是否过期（免费云部署重启会清库）
let revision = 0;
export const getRevision = () => revision;
const touch = () => {
  revision += 1;
};

// 动态口令/二维码轮换周期（毫秒）
export const PASSCODE_PERIOD_MS = 15000;

// 软件2402班初始名册（学号 + 姓名；不含手机号等隐私信息）
// 仅用于首次启动时播种演示班级；其他班级的名册由学委导入
export const SEED_ROSTER = [
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
// 用作演示班级的初始课表；其他班级的课表由学委在新建班级时导入
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
export const STUDENTS = []; // 全局学生注册表：启动时水化 + 导入班级人员时追加
export const classes = [];
export const sessions = [];
// 全局设备指纹索引：deviceId -> Set(studentId)，跨场次识别“同设备多签到”
export const deviceIndex = new Map();

const studentMap = new Map(); // id -> student，加速查找

// 由学号派生稳定的学生 id：同一个人在多个班级中共用同一条学生记录
export const studentIdOf = (studentNo) => 's' + String(studentNo).trim();

export function studentById(id) {
  return studentMap.get(id) || null;
}

/**
 * 登记一批学生（导入班级人员时调用）：写入学生主表并加入全局注册表。
 * 已存在的学号保留原有姓名，避免覆盖其他班级已录入的信息。
 */
export function addStudents(list) {
  const fresh = [];
  for (const it of list || []) {
    const studentNo = String(it.studentNo || '').trim();
    const name = String(it.name || '').trim();
    if (!studentNo || !name) continue;
    const id = studentIdOf(studentNo);
    if (studentMap.has(id)) continue;
    const stu = { id, name, studentNo };
    fresh.push(stu);
    STUDENTS.push(stu);
    studentMap.set(id, stu);
  }
  if (fresh.length) ensureStudents(fresh);
  // 返回本次导入班级所需的全量 id（含此前已存在的）
  return (list || [])
    .map((it) => studentIdOf(String(it.studentNo || '').trim()))
    .filter((id) => studentMap.has(id));
}

export function getTimetable(classId) {
  const c = classes.find((x) => x.id === classId);
  return c && Array.isArray(c.timetable) ? c.timetable : [];
}

// 是否已采集人脸底照（用于前端提示与签到核验）
export const faceEnrolled = (studentId) => {
  const s = studentById(studentId);
  return !!(s && Array.isArray(s.faceDescriptor) && s.faceDescriptor.length);
};

// 采集/更新某人的人脸底照特征（再次采集即覆盖）
export function setStudentFace(studentId, descriptor) {
  const s = studentById(studentId);
  if (!s) return null;
  s.faceDescriptor = Array.isArray(descriptor) && descriptor.length ? descriptor : null;
  setFaceDescriptorRow(studentId, s.faceDescriptor);
  touch();
  return s;
}

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
  // 支持两种入参：students（导入的 {studentNo,name} 列表，自动登记学生）或 studentIds（已存在的 id）
  let studentIds = [];
  if (Array.isArray(input.students) && input.students.length) {
    studentIds = addStudents(input.students);
  } else if (Array.isArray(input.studentIds)) {
    studentIds = input.studentIds.filter((id) => studentById(id));
  }
  studentIds = [...new Set(studentIds)];

  const cls = {
    id: input.id || uid('c_'),
    name: input.name,
    roomName: input.roomName,
    lat: Number(input.lat),
    lng: Number(input.lng),
    radiusMeters: Number(input.radiusMeters) || 100,
    timetable: Array.isArray(input.timetable) ? input.timetable : [],
    studentIds,
    createdAt: now(),
  };
  insertClass(cls);
  classes.push(cls);
  touch();
  return cls;
}

// 删除班级：连同其全部签到场次与记录一起删除（学生主表保留）
export function deleteClass(classId) {
  const i = classes.findIndex((c) => c.id === classId);
  if (i < 0) return false;
  for (let j = sessions.length - 1; j >= 0; j--) {
    if (sessions[j].classId === classId) sessions.splice(j, 1);
  }
  deleteClassRow(classId);
  classes.splice(i, 1);
  touch();
  return true;
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
  touch();
  return s;
}

export function persistSessionStatus(session) {
  updateSessionStatus(session.id, session.status, session.endAt);
  touch();
}

// 签到记录落库（含 sessionId）
export function persistRecord(sessionId, record) {
  insertRecord({ ...record, sessionId });
  touch();
}

export function persistRecordStatus(record) {
  updateRecordStatus(record.id, record.status, record.reviewedAt ?? null);
  touch();
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
  const stu = studentById(studentId);
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

// 从 SQLite 读取并填充内存态
function populate() {
  for (const s of allStudents()) {
    STUDENTS.push(s);
    studentMap.set(s.id, s);
  }
  classes.push(...allClasses());
  sessions.push(...allSessions());
  for (const s of sessions) rebuildSessionIndexes(s);
}

export function hydrate() {
  ensureStudents(SEED_ROSTER);
  populate();
}

// 清空内存态后重新水化（从备份整库恢复后调用）
export function reloadFromDb() {
  STUDENTS.length = 0;
  studentMap.clear();
  classes.length = 0;
  sessions.length = 0;
  deviceIndex.clear();
  populate();
}

// 导出全量数据（班级/课表/名册/场次/记录/人脸底照），供学委端在本机留一份备份
export function exportState() {
  return {
    version: 1,
    exportedAt: now(),
    rev: revision,
    students: STUDENTS.map((s) => ({
      id: s.id,
      name: s.name,
      studentNo: s.studentNo,
      faceDescriptor: s.faceDescriptor || null,
    })),
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      roomName: c.roomName,
      lat: c.lat,
      lng: c.lng,
      radiusMeters: c.radiusMeters,
      createdAt: c.createdAt,
      timetable: c.timetable || [],
      studentIds: [...c.studentIds],
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      classId: s.classId,
      title: s.title,
      course: s.course || '',
      building: s.building || '',
      roomName: s.roomName,
      center: { lat: s.center.lat, lng: s.center.lng },
      radiusMeters: s.radiusMeters,
      startAt: s.startAt,
      endAt: s.endAt,
      status: s.status,
      secret: Buffer.from(s.secret).toString('hex'),
      records: s.records.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        name: r.name,
        studentNo: r.studentNo,
        checkinType: r.checkinType,
        status: r.status,
        flags: r.flags || [],
        distance: r.distance ?? null,
        location: r.location || null,
        deviceFingerprint: r.deviceFingerprint || null,
        photo: r.photo || null,
        motionScore: r.motionScore ?? null,
        faceDistance: r.faceDistance ?? null,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt ?? null,
      })),
    })),
  };
}

/**
 * 从备份整库恢复：清空现有数据后按备份重建（含班级、课表、名册、场次、记录、人脸底照）。
 * 用于免费云部署重启清库后，把学委本机的备份一键放回服务端。
 */
export function importState(state) {
  if (!state || typeof state !== 'object') throw new Error('备份数据无效');
  const stus = Array.isArray(state.students) ? state.students : [];
  const cls = Array.isArray(state.classes) ? state.classes : [];
  const sess = Array.isArray(state.sessions) ? state.sessions : [];
  if (!cls.length && !sess.length) throw new Error('备份内容为空，未执行恢复');

  clearAll();

  insertStudentsFull(
    stus.map((s) => ({
      id: String(s.id),
      name: String(s.name || ''),
      studentNo: String(s.studentNo || ''),
      faceDescriptor: Array.isArray(s.faceDescriptor) && s.faceDescriptor.length ? s.faceDescriptor : null,
    })),
  );

  for (const c of cls) {
    insertClass({
      id: String(c.id),
      name: String(c.name || ''),
      roomName: String(c.roomName || ''),
      lat: Number(c.lat),
      lng: Number(c.lng),
      radiusMeters: Number(c.radiusMeters) || 100,
      createdAt: Number(c.createdAt) || now(),
      timetable: Array.isArray(c.timetable) ? c.timetable : [],
      studentIds: Array.isArray(c.studentIds) ? c.studentIds.map(String) : [],
    });
  }

  for (const s of sess) {
    insertSession({
      id: String(s.id),
      classId: String(s.classId),
      title: String(s.title || '课堂签到'),
      course: s.course || '',
      building: s.building || '',
      roomName: s.roomName,
      center: { lat: Number(s.center && s.center.lat), lng: Number(s.center && s.center.lng) },
      radiusMeters: Number(s.radiusMeters) || 100,
      startAt: Number(s.startAt) || now(),
      endAt: Number(s.endAt) || now(),
      status: s.status === 'ended' ? 'ended' : 'active',
      secret: Buffer.from(String(s.secret || ''), 'hex'),
    });
    for (const r of s.records || []) {
      insertRecord({
        id: String(r.id),
        sessionId: String(s.id),
        studentId: String(r.studentId),
        name: String(r.name || ''),
        studentNo: String(r.studentNo || ''),
        checkinType: r.checkinType || 'photo',
        status: r.status || 'absent',
        flags: Array.isArray(r.flags) ? r.flags : [],
        distance: r.distance ?? null,
        location: r.location || null,
        deviceFingerprint: r.deviceFingerprint || null,
        photo: r.photo || null,
        motionScore: r.motionScore ?? null,
        faceDistance: r.faceDistance ?? null,
        createdAt: Number(r.createdAt) || now(),
        reviewedAt: r.reviewedAt ?? null,
      });
    }
  }

  reloadFromDb();
  touch();
  return { classes: classes.length, students: STUDENTS.length, sessions: sessions.length };
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
      timetable: TIMETABLE,
      students: SEED_ROSTER.map((s) => ({ name: s.name, studentNo: s.studentNo })),
    });
  }
  return classes[0];
}

// 重新加载学生名单（若库中已被扩充）
export function reloadStudents() {
  return allStudents();
}
