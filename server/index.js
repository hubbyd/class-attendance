import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SECTION_TIMES,
  classes,
  sessions,
  seed,
  createClass,
  createSession,
  deleteClass,
  getTimetable,
  passcodeFor,
  secondsToRotate,
  now,
  hydrate,
  persistRecord,
  persistSessionStatus,
  persistRecordStatus,
  setStudentStatus,
  studentById,
  faceEnrolled,
  setStudentFace,
} from './store.js';
import { verify, review } from './anticheat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// 学委口令：可用环境变量 TEACHER_CODE 覆盖，默认 2402（软件2402班）
const TEACHER_CODE = process.env.TEACHER_CODE || '2402';
const teacherAuthed = (req) => String(req.headers['x-teacher-code'] || '') === TEACHER_CODE;

// 先从 SQLite 水化历史数据，再按需播种演示班级
hydrate();
seed();

/* ---------------- helpers ---------------- */

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,x-teacher-code',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 20 * 1024 * 1024) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const classSummary = (c) => ({
  id: c.id,
  name: c.name,
  roomName: c.roomName,
  lat: c.lat,
  lng: c.lng,
  radiusMeters: c.radiusMeters,
  studentCount: c.studentIds.length,
  timetableCount: (c.timetable || []).length,
});

function studentStatus(session, sid) {
  // 以“最近一次签到尝试”的结果为准（保留历史记录用于审计/复核）
  let latest = null;
  for (const r of session.records) {
    if (r.studentId === sid && (!latest || r.createdAt >= latest.createdAt)) latest = r;
  }
  return latest ? latest.status : 'absent';
}

function sessionDTO(s) {
  const cls = classes.find((c) => c.id === s.classId);
  const ended = s.status !== 'active' || now() > s.endAt;
  const roster = cls
    ? cls.studentIds.map((sid) => {
        const st = studentById(sid);
        return {
          id: sid,
          name: st ? st.name : sid,
          studentNo: st ? st.studentNo : '',
          status: studentStatus(s, sid),
          faceEnrolled: faceEnrolled(sid),
        };
      })
    : [];
  return {
    id: s.id,
    classId: s.classId,
    className: cls ? cls.name : '',
    title: s.title,
    course: s.course || '',
    building: s.building || '',
    roomName: s.roomName,
    center: s.center,
    radiusMeters: s.radiusMeters,
    startAt: s.startAt,
    endAt: s.endAt,
    status: ended ? 'ended' : 'active',
    remainingMs: Math.max(0, s.endAt - now()),
    passcode: ended ? null : passcodeFor(s),
    secondsToRotate: ended ? 0 : secondsToRotate(),
    records: s.records.map((r) => ({ ...r })),
    roster,
  };
}

// 历史记录列表用的轻量摘要（不含照片等大字段），附带各项状态计数
const SUMMARY_STATUSES = ['present', 'late', 'leave', 'absent', 'proxy', 'flagged', 'rejected'];
function sessionSummary(s) {
  const cls = classes.find((c) => c.id === s.classId);
  const counts = {};
  SUMMARY_STATUSES.forEach((k) => (counts[k] = 0));
  const statuses = {};
  let total = 0;
  if (cls) {
    total = cls.studentIds.length;
    for (const sid of cls.studentIds) {
      const st = studentStatus(s, sid);
      statuses[sid] = st;
      counts[st] = (counts[st] || 0) + 1;
    }
  }
  const ended = s.status !== 'active' || now() > s.endAt;
  return {
    id: s.id,
    classId: s.classId,
    title: s.title,
    course: s.course || '',
    building: s.building || '',
    roomName: s.roomName,
    startAt: s.startAt,
    endAt: s.endAt,
    status: ended ? 'ended' : 'active',
    counts,
    statuses,
    total,
  };
}

/* ---------------- router ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const m = req.method;

  if (m === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,x-teacher-code',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    });
    return res.end();
  }

  try {
    // 公网配置：优先 PUBLIC_URL，兼容主流 PaaS（Render/Railway/Fly），否则根据请求头推断
    if (m === 'GET' && p === '/api/config') {
      let pub = process.env.PUBLIC_URL
        || process.env.RENDER_EXTERNAL_URL
        || process.env.RAILWAY_STATIC_URL
        || process.env.RAILWAY_PUBLIC_DOMAIN
        || process.env.FLY_APP_HOST && `https://${process.env.FLY_APP_HOST}.fly.dev`;
      if (!pub) {
        const proto = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        pub = `${proto}://${host}`;
      }
      return send(res, 200, { publicUrl: String(pub).replace(/\/$/, '') });
    }

    // 课表：按班级返回其导入的课表 + 节次时间 + 楼宇列表
    // 由前端按浏览器本地时间匹配（服务端在云端通常为 UTC，时区会不一致）
    if (m === 'GET' && p === '/api/timetable') {
      const cid = url.searchParams.get('class') || '';
      const tt = cid ? getTimetable(cid) : [];
      return send(res, 200, {
        timetable: tt,
        sections: SECTION_TIMES,
        buildingPresets: [...new Set(tt.map((x) => x.building).filter(Boolean))],
      });
    }

    // 初始化数据（不含学生名单，避免跨班级泄露）
    if (m === 'GET' && p === '/api/bootstrap') {
      return send(res, 200, {
        classes: classes.map(classSummary),
        sessions: sessions.map((s) => ({ id: s.id, classId: s.classId, title: s.title, status: s.status })),
      });
    }

    // 校验学委口令（学委端进入前调用）
    if (m === 'POST' && p === '/api/teacher/verify') {
      const body = await readBody(req);
      if (String(body.code || '') !== TEACHER_CODE) return send(res, 401, { error: '口令不正确' });
      return send(res, 200, { ok: true });
    }

    // 学生人脸底照：查询是否已采集 / 采集（再次采集即覆盖，用于签到时的 1:1 比对）
    let sm = p.match(/^\/api\/students\/([^/]+)$/);
    if (m === 'GET' && sm) {
      const stu = studentById(sm[1]);
      if (!stu) return send(res, 404, { error: '学生不存在' });
      return send(res, 200, {
        id: stu.id,
        name: stu.name,
        studentNo: stu.studentNo,
        faceEnrolled: faceEnrolled(stu.id),
      });
    }
    sm = p.match(/^\/api\/students\/([^/]+)\/face$/);
    if (m === 'POST' && sm) {
      const stu = studentById(sm[1]);
      if (!stu) return send(res, 404, { error: '学生不存在' });
      const body = await readBody(req);
      const d = body.descriptor;
      if (!Array.isArray(d) || d.length !== 128 || d.some((v) => typeof v !== 'number' || !isFinite(v))) {
        return send(res, 400, { error: '人脸特征格式不正确（需 128 维数值向量）' });
      }
      setStudentFace(stu.id, d);
      return send(res, 200, { ok: true, faceEnrolled: true });
    }

    // 新建班级（可同时导入班级人员与班级课表）
    if (m === 'POST' && p === '/api/classes') {
      if (!teacherAuthed(req)) return send(res, 401, { error: '需要学委口令' });
      const body = await readBody(req);
      if (!body.name || !body.roomName || body.lat == null || body.lng == null) {
        return send(res, 400, { error: '缺少必要字段（name/roomName/lat/lng）' });
      }
      // 人员导入：学号 + 姓名，按学号去重
      const seen = new Set();
      const roster = [];
      for (const it of Array.isArray(body.students) ? body.students : []) {
        const studentNo = String(it.studentNo || '').trim();
        const name = String(it.name || '').trim();
        if (!studentNo || !name || seen.has(studentNo)) continue;
        seen.add(studentNo);
        roster.push({ studentNo, name });
      }
      if (!roster.length) return send(res, 400, { error: '请至少导入 1 名学生（学号 + 姓名）' });
      const timetable = Array.isArray(body.timetable) ? body.timetable : [];
      return send(res, 200, classSummary(createClass({ ...body, students: roster, timetable })));
    }

    // 班级详情 / 删除班级
    let mm = p.match(/^\/api\/classes\/([^/]+)$/);
    if (m === 'DELETE' && mm) {
      if (!teacherAuthed(req)) return send(res, 401, { error: '需要学委口令' });
      if (!deleteClass(mm[1])) return send(res, 404, { error: '班级不存在' });
      return send(res, 200, { ok: true });
    }
    if (m === 'GET' && mm) {
      const c = classes.find((x) => x.id === mm[1]);
      if (!c) return send(res, 404, { error: '班级不存在' });
      return send(res, 200, {
        ...classSummary(c),
        timetable: c.timetable || [],
        roster: c.studentIds
          .map((sid) => studentById(sid))
          .filter(Boolean)
          .map((st) => ({
            id: st.id,
            name: st.name,
            studentNo: st.studentNo,
            faceEnrolled: faceEnrolled(st.id),
          })),
      });
    }

    // 班级固定入口：查询该班「当前进行中」的签到（学生点固定链接时自动解析）
    mm = p.match(/^\/api\/classes\/([^/]+)\/active$/);
    if (m === 'GET' && mm) {
      const c = classes.find((x) => x.id === mm[1]);
      if (!c) return send(res, 404, { error: '班级不存在' });
      const active = [...sessions].reverse().find(
        (x) => x.classId === c.id && x.status === 'active' && now() <= x.endAt,
      );
      if (!active) {
        return send(res, 200, { active: false, classId: c.id, className: c.name, roomName: c.roomName });
      }
      return send(res, 200, { active: true, classId: c.id, session: sessionDTO(active) });
    }

    // 班级签到历史（每次签到的记录与统计数据，仅学委可见）
    mm = p.match(/^\/api\/classes\/([^/]+)\/history$/);
    if (m === 'GET' && mm) {
      if (!teacherAuthed(req)) return send(res, 401, { error: '需要学委口令' });
      const c = classes.find((x) => x.id === mm[1]);
      if (!c) return send(res, 404, { error: '班级不存在' });
      const list = sessions
        .filter((s) => s.classId === c.id)
        .sort((a, b) => b.startAt - a.startAt)
        .map(sessionSummary);
      const students = c.studentIds.map((sid) => {
        const stu = studentById(sid);
        return stu ? { id: stu.id, name: stu.name, studentNo: stu.studentNo } : { id: sid, name: sid, studentNo: '' };
      });
      return send(res, 200, { classId: c.id, className: c.name, students, sessions: list });
    }

    // 发起签到（创建场次）
    mm = p.match(/^\/api\/classes\/([^/]+)\/sessions$/);
    if (m === 'POST' && mm) {
      if (!teacherAuthed(req)) return send(res, 401, { error: '需要学委口令' });
      const body = await readBody(req);
      try {
        const s = createSession(mm[1], body);
        return send(res, 200, sessionDTO(s));
      } catch (e) {
        return send(res, 404, { error: e.message });
      }
    }

    // 场次实时详情（教师看板 / 学生端共用）
    mm = p.match(/^\/api\/sessions\/([^/]+)$/);
    if (m === 'GET' && mm) {
      const s = sessions.find((x) => x.id === mm[1]);
      if (!s) return send(res, 404, { error: '签到场次不存在' });
      return send(res, 200, sessionDTO(s));
    }

    // 结束签到
    mm = p.match(/^\/api\/sessions\/([^/]+)\/end$/);
    if (m === 'POST' && mm) {
      if (!teacherAuthed(req)) return send(res, 401, { error: '需要学委口令' });
      const s = sessions.find((x) => x.id === mm[1]);
      if (!s) return send(res, 404, { error: '签到场次不存在' });
      s.status = 'ended';
      s.endAt = now();
      persistSessionStatus(s);
      return send(res, 200, sessionDTO(s));
    }

    // 学生签到（含四类防作弊校验；已签到的学生不再接受二次提交）
    mm = p.match(/^\/api\/sessions\/([^/]+)\/checkin$/);
    if (m === 'POST' && mm) {
      const s = sessions.find((x) => x.id === mm[1]);
      if (!s) return send(res, 404, { error: '签到场次不存在' });
      const body = await readBody(req);
      const student = studentById(body.studentId);
      if (!student) return send(res, 400, { error: '请选择正确的学生身份' });
      // 必须是本场次所属班级名册内的学生（多班级互不串签）
      const cls = classes.find((c) => c.id === s.classId);
      if (cls && !cls.studentIds.includes(student.id)) {
        return send(res, 403, { error: '你不在本次签到的班级名册中' });
      }
      const payload = {
        studentId: student.id,
        name: student.name,
        studentNo: student.studentNo,
        ...body,
      };
      const { already, record, distance } = verify(s, payload);
      // 已签到 / 已提交待复核：直接返回原记录，不落新记录
      if (already) {
        return send(res, 200, {
          ok: true,
          already: true,
          status: record.status,
          flags: record.flags,
          distance: distance == null ? null : Math.round(distance),
          message: record.status === 'present' ? '你已签到，无需重复签到' : '你已提交，正在等待学委复核',
          record,
        });
      }
      // 持久化签到记录到 SQLite
      persistRecord(s.id, record);
      const ok = record.status === 'present';
      const messages = {
        present: '签到成功，已计入出勤',
        flagged: '已提交，存在可疑项，等待教师复核',
        rejected: '签到被拒绝：' + record.flags.join('、'),
      };
      return send(res, 200, {
        ok,
        status: record.status,
        flags: record.flags,
        distance: distance == null ? null : Math.round(distance),
        message: messages[record.status],
        record,
      });
    }

    // 教师复核
    mm = p.match(/^\/api\/sessions\/([^/]+)\/records\/([^/]+)\/review$/);
    if (m === 'POST' && mm) {
      if (!teacherAuthed(req)) return send(res, 401, { error: '需要学委口令' });
      const s = sessions.find((x) => x.id === mm[1]);
      if (!s) return send(res, 404, { error: '签到场次不存在' });
      const body = await readBody(req);
      const r = review(s, mm[2], body.action);
      if (!r) return send(res, 404, { error: '记录不存在' });
      persistRecordStatus(r);
      return send(res, 200, { record: r });
    }

    // 学委手动设置某生状态（出勤/迟到/请假/缺勤/代签）
    mm = p.match(/^\/api\/sessions\/([^/]+)\/records\/status$/);
    if (m === 'POST' && mm) {
      if (!teacherAuthed(req)) return send(res, 401, { error: '需要学委口令' });
      const s = sessions.find((x) => x.id === mm[1]);
      if (!s) return send(res, 404, { error: '签到场次不存在' });
      const body = await readBody(req);
      try {
        const rec = setStudentStatus(s.id, body.studentId, body.status);
        if (!rec) return send(res, 400, { error: '学生不存在' });
        return send(res, 200, sessionDTO(s));
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // 静态资源（若已构建 client/dist）
    const distDir = path.join(__dirname, '..', 'client', 'dist');
    if (m === 'GET' && fs.existsSync(distDir)) {
      let fp = p === '/' ? '/index.html' : p;
      let file = path.join(distDir, fp);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
      const ext = path.extname(file);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: e.message || 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`[attendance-server] API listening on http://localhost:${PORT}`);
});
