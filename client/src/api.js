const BASE = '/api';

// 学委口令：验证通过后存在本机，后续所有请求自动带上，学委无需重复输入
export function savedTeacherCode() {
  try {
    return localStorage.getItem('teacherCode') || '';
  } catch {
    return '';
  }
}

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', 'x-teacher-code': savedTeacherCode() },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
  return data;
}

export const api = {
  bootstrap: () => req('/bootstrap'),
  timetable: (classId) => req('/timetable' + (classId ? '?class=' + encodeURIComponent(classId) : '')),
  teacherVerify: (code) => req('/teacher/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  createClass: (b) => req('/classes', { method: 'POST', body: JSON.stringify(b) }),
  deleteClass: (id) => req('/classes/' + id, { method: 'DELETE' }),
  classDetail: (id) => req('/classes/' + id),
  activeSession: (cid) => req('/classes/' + cid + '/active'),
  createSession: (cid, b) => req(`/classes/${cid}/sessions`, { method: 'POST', body: JSON.stringify(b) }),
  session: (id) => req('/sessions/' + id),
  endSession: (id) => req(`/sessions/${id}/end`, { method: 'POST', body: '{}' }),
  checkin: (id, b) => req(`/sessions/${id}/checkin`, { method: 'POST', body: JSON.stringify(b) }),
  review: (sid, rid, action) =>
    req(`/sessions/${sid}/records/${rid}/review`, { method: 'POST', body: JSON.stringify({ action }) }),
  setStudentStatus: (sid, b) =>
    req(`/sessions/${sid}/records/status`, { method: 'POST', body: JSON.stringify(b) }),
  history: (cid) => req('/classes/' + cid + '/history'),
  student: (id) => req('/students/' + id),
  enrollFace: (id, descriptor) =>
    req(`/students/${id}/face`, { method: 'POST', body: JSON.stringify({ descriptor }) }),
};
