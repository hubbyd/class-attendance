const BASE = '/api';

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
  return data;
}

export const api = {
  bootstrap: () => req('/bootstrap'),
  createClass: (b) => req('/classes', { method: 'POST', body: JSON.stringify(b) }),
  classDetail: (id) => req('/classes/' + id),
  createSession: (cid, b) => req(`/classes/${cid}/sessions`, { method: 'POST', body: JSON.stringify(b) }),
  session: (id) => req('/sessions/' + id),
  endSession: (id) => req(`/sessions/${id}/end`, { method: 'POST', body: '{}' }),
  checkin: (id, b) => req(`/sessions/${id}/checkin`, { method: 'POST', body: JSON.stringify(b) }),
  review: (sid, rid, action) =>
    req(`/sessions/${sid}/records/${rid}/review`, { method: 'POST', body: JSON.stringify({ action }) }),
};
