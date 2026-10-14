import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';

export default function Teacher() {
  const [classes, setClasses] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', roomName: '', lat: '31.23037', lng: '121.47370', radiusMeters: '120' });
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const b = await api.bootstrap();
      setClasses(b.classes);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function createClass() {
    setErr('');
    try {
      await api.createClass({
        name: form.name,
        roomName: form.roomName,
        lat: Number(form.lat),
        lng: Number(form.lng),
        radiusMeters: Number(form.radiusMeters),
      });
      setShowNew(false);
      setForm({ ...form, name: '', roomName: '' });
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function startSession(c) {
    setErr('');
    try {
      const s = await api.createSession(c.id, { title: c.name + ' 课堂签到', durationMin: 10 });
      navigate('/session?id=' + s.id);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="wrap">
      {err && <div className="banner bad" style={{ marginTop: 16 }}>{err}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 style={{ flex: 1 }}>我的班级</h2>
          <button className="btn primary" onClick={() => setShowNew((v) => !v)}>
            {showNew ? '收起' : '+ 新建班级'}
          </button>
        </div>

        {showNew && (
          <div className="grid c2" style={{ marginTop: 14 }}>
            <label className="field">
              <span>班级名称</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：软件工程 2023-1 班" />
            </label>
            <label className="field">
              <span>教室名称</span>
              <input value={form.roomName} onChange={(e) => setForm({ ...form, roomName: e.target.value })} placeholder="如：教学楼 A-302" />
            </label>
            <label className="field">
              <span>围栏中心纬度 (lat)</span>
              <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            </label>
            <label className="field">
              <span>围栏中心经度 (lng)</span>
              <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </label>
            <label className="field">
              <span>围栏半径（米）</span>
              <input value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} />
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn primary block" onClick={createClass} disabled={!form.name || !form.roomName}>
                保存班级
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid c2">
        {classes.map((c) => (
          <div className="card" key={c.id}>
            <h2>{c.name}</h2>
            <div className="muted small" style={{ marginTop: 4 }}>
              🏫 {c.roomName} · 围栏半径 {c.radiusMeters}m · 学生 {c.studentCount} 人
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              中心坐标 {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn primary block" onClick={() => startSession(c)}>
                发起签到
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
