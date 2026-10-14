import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { deviceFingerprint } from '../fingerprint.js';
import { FLAG_LABEL } from '../flags.js';

export default function Student({ sid }) {
  const [sessionId, setSessionId] = useState(sid || '');
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');

  const [studentId, setStudentId] = useState('');
  const [method, setMethod] = useState('gps');
  const [loc, setLoc] = useState(null);
  const [locMsg, setLocMsg] = useState('');
  const [photo, setPhoto] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fp = useRef(deviceFingerprint());

  useEffect(() => {
    if (!sid) return;
    api.session(sid).then(setS).catch((e) => setErr(e.message));
  }, [sid]);

  // 轮询场次：既用于刷新状态，也用于自动带入当前动态口令
  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => api.session(s.id).then(setS).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [s && s.id]);

  async function loadSession() {
    setErr('');
    try {
      setS(await api.session(sessionId.trim()));
    } catch (e) {
      setErr(e.message);
    }
  }

  function getRealLocation() {
    setLocMsg('正在获取定位…');
    if (!navigator.geolocation) {
      setLocMsg('当前环境不支持定位，请在手机系统设置里允许“位置”权限后重试。');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLocMsg('已获取定位，精度约 ' + Math.round(pos.coords.accuracy) + 'm');
      },
      (e) => setLocMsg('定位失败：' + e.message + '。请检查是否已允许定位权限，然后重试。'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // 调用系统相机拍照（微信内置浏览器兼容），再压缩为较小的 JPEG
  function onPickPhoto(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 640 / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        setPhoto(c.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  }

  async function submit() {
    setErr('');
    setResult(null);
    if (!s) return setErr('请先进入签到场次');
    if (s.status !== 'active') return setErr('该签到场次已结束');
    if (!studentId) return setErr('请选择你的身份');
    if (!loc) return setErr('请先获取定位');
    if (method === 'photo' && !photo) return setErr('请先拍照');
    setSubmitting(true);
    try {
      const r = await api.checkin(s.id, {
        studentId,
        passcode: s.passcode, // 自动带入当前动态口令，学生无需手动输入
        deviceFingerprint: fp.current,
        location: { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy },
        checkinType: method,
        photo: method === 'photo' ? photo : undefined,
      });
      setResult(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------- 未进入场次：引导从群里链接进入 ---------- */
  if (!s) {
    return (
      <div className="wrap narrow">
        <div className="card" style={{ marginTop: 20 }}>
          <h2>进入签到</h2>
          <p className="muted small" style={{ marginTop: 6 }}>
            请在班级群里点开学委发的签到链接进入。若链接打开异常，也可手动输入下方的签到场次编号。
          </p>
          {err && <div className="banner bad" style={{ margin: '12px 0' }}>{err}</div>}
          <label className="field" style={{ marginTop: 12 }}>
            <span>签到场次编号</span>
            <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="cs_xxxxxxxx" />
          </label>
          <button className="btn primary block" onClick={loadSession} disabled={!sessionId.trim()}>进入签到</button>
        </div>
      </div>
    );
  }

  const bannerClass = result?.status === 'present' ? 'ok' : result?.status === 'flagged' ? 'warn' : 'bad';

  return (
    <div className="wrap narrow">
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 style={{ flex: 1 }}>{s.title}</h2>
          {s.status === 'active' ? <span className="pill present">进行中</span> : <span className="pill absent">已结束</span>}
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          {s.className} · 🏫 {s.roomName} · 需在 {s.radiusMeters}m 围栏内
        </div>
      </div>

      {err && <div className="banner bad" style={{ marginTop: 12 }}>{err}</div>}

      {result && (
        <div className={`banner ${bannerClass}`} style={{ marginTop: 12 }}>
          <div>{result.status === 'present' ? '✅ ' : result.status === 'flagged' ? '⚠️ ' : '⛔ '}{result.message}</div>
          {result.distance != null && <div className="hint" style={{ marginTop: 4 }}>与教室中心距离：{result.distance}m</div>}
          {result.flags?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {result.flags.map((f) => (
                <span key={f} className="flag-tag">{FLAG_LABEL[f] || f}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 1. 身份 */}
      <div className="card">
        <div className="step active">
          <div className="n">1</div>
          <div><b>选择身份</b></div>
        </div>
        <select style={{ marginTop: 8 }} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">请选择你的名字…</option>
          {s.roster.map((r) => (
            <option key={r.id} value={r.id} disabled={r.status === 'present'}>
              {r.name}（{r.studentNo}）{r.status === 'present' ? ' · 已签到' : ''}
            </option>
          ))}
        </select>
        <div className="hint" style={{ marginTop: 6 }}>
          设备指纹：<span className="mono">{fp.current}</span>（同一设备替他人签到会被拦截）
        </div>
      </div>

      {/* 2. 签到方式 */}
      <div className="card">
        <div className="step active">
          <div className="n">2</div>
          <div><b>选择签到方式</b></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className={`btn ${method === 'gps' ? 'primary' : ''}`} onClick={() => setMethod('gps')}>📍 定位签到</button>
          <button className={`btn ${method === 'photo' ? 'primary' : ''}`} onClick={() => setMethod('photo')}>🤳 拍照签到</button>
        </div>
      </div>

      {/* 3. 定位 */}
      <div className="card">
        <div className="step active">
          <div className="n">3</div>
          <div><b>获取定位</b> <span className="muted small">（超出教室围栏会被拒绝）</span></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={getRealLocation}>获取当前定位</button>
        </div>
        {locMsg && <div className="hint" style={{ marginTop: 8 }}>{locMsg}</div>}
        {loc && (
          <div className="hint mono" style={{ marginTop: 6 }}>
            lat {loc.lat.toFixed(5)}, lng {loc.lng.toFixed(5)} · accuracy {Math.round(loc.accuracy)}m
          </div>
        )}
      </div>

      {/* 4. 现场拍照（拍照签到） */}
      {method === 'photo' && (
        <div className="card">
          <div className="step active">
            <div className="n">4</div>
            <div><b>现场拍照</b> <span className="muted small">（调用手机相机，拍摄本人头像）</span></div>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="user"
            onChange={onPickPhoto}
            style={{ display: 'none' }}
            id="photo-input"
          />
          <label htmlFor="photo-input" className="btn primary block" style={{ marginTop: 10, textAlign: 'center' }}>
            {photo ? '重新拍照' : '📷 拍照'}
          </label>
          {photo && (
            <div style={{ marginTop: 12 }}>
              <img src={photo} alt="签到照片" className="preview" style={{ maxHeight: 240, objectFit: 'cover' }} />
            </div>
          )}
        </div>
      )}

      <div className="card">
        <button className="btn primary block" onClick={submit} disabled={submitting || s.status !== 'active'}>
          {submitting ? '提交中…' : '提交签到'}
        </button>
        <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
          提交时会同时校验：定位围栏 · 设备指纹 · 当前口令（自动带入）
        </div>
      </div>
    </div>
  );
}
