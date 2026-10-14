import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { navigate } from '../App.jsx';

export default function Teacher() {
  const [classes, setClasses] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', roomName: '', lat: '31.23037', lng: '121.47370', radiusMeters: '120' });
  const [showNew, setShowNew] = useState(false);
  const [publicUrl, setPublicUrl] = useState(window.location.origin);
  const [qr, setQr] = useState({});
  const [copied, setCopied] = useState('');

  useEffect(() => {
    load();
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => c.publicUrl && setPublicUrl(c.publicUrl))
      .catch(() => {});
  }, []);

  // 固定入口链接（永久不变，形如 https://host/#/student?class=xxx）
  const linkOf = (c) => `${publicUrl.replace(/\/$/, '')}/#/student?class=${c.id}`;

  // 为每个班级生成固定入口的二维码（永久不变，可打印张贴）
  useEffect(() => {
    classes.forEach((c) => {
      QRCode.toDataURL(linkOf(c), { width: 160, margin: 1 })
        .then((d) => setQr((m) => ({ ...m, [c.id]: d })))
        .catch(() => {});
    });
  }, [classes, publicUrl]);

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

  async function copyLink(c) {
    const link = linkOf(c);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(c.id);
    setTimeout(() => setCopied(''), 2500);
  }

  async function startSession(c) {
    setErr('');
    try {
      // 已有进行中的签到则直接进入，避免重复发起
      const a = await api.activeSession(c.id);
      if (a.active) {
        navigate('/session?id=' + a.session.id);
        return;
      }
      const s = await api.createSession(c.id, { title: c.name + ' 课堂签到', durationMin: 15 });
      navigate('/session?id=' + s.id);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="wrap">
      {err && <div className="banner bad" style={{ marginTop: 16 }}>{err}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="banner ok">
          使用方法：把班级的“固定签到入口”发到班级群<b>一次即可</b>（链接和二维码永久不变）。每次上课只需点「发起本次签到」，同学点开原链接就能签到，无需重新发链接，也无需一直挂着屏幕。
        </div>
      </div>

      <div className="card">
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

            <div className="hint" style={{ marginTop: 14, fontWeight: 700, color: 'var(--brand)' }}>
              固定签到入口（长期有效）
            </div>
            <div className="link-box" style={{ marginTop: 6 }}>
              <span className="mono link-text">{linkOf(c)}</span>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => copyLink(c)} style={{ flex: 1 }}>
                📋 复制固定签到链接
              </button>
            </div>
            {copied === c.id && (
              <div className="banner ok" style={{ marginTop: 10 }}>
                已复制，粘贴到班级群即可，长期有效
              </div>
            )}

            <div className="row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
              {qr[c.id] && <img className="qr" src={qr[c.id]} width={140} height={140} alt="签到二维码" />}
              <div className="hint" style={{ flex: 1 }}>
                也可打印这张二维码贴在教室，同学扫码进入。链接和二维码永久不变，发一次即可。
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <button className="btn primary block" onClick={() => startSession(c)}>
                ▶ 发起本次签到
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
