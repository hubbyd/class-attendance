import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { deviceFingerprint } from '../fingerprint.js';
import { FLAG_LABEL } from '../flags.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function computeMotion(frames) {
  let sum = 0;
  let n = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    let d = 0;
    for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]);
    sum += d / a.length / 255;
    n++;
  }
  return n ? sum / n : 0;
}

export default function Student({ sid, code }) {
  const [sessionId, setSessionId] = useState(sid || '');
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');

  const [studentId, setStudentId] = useState('');
  const [passcode, setPasscode] = useState(code || '');
  const [method, setMethod] = useState('gps');
  const [loc, setLoc] = useState(null);
  const [locMsg, setLocMsg] = useState('');
  const [photo, setPhoto] = useState('');
  const [motion, setMotion] = useState(null);
  const [challenge, setChallenge] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fp = useRef(deviceFingerprint());
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!sid) return;
    api.session(sid).then(setS).catch((e) => setErr(e.message));
  }, [sid]);

  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => api.session(s.id).then(setS).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [s && s.id]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function loadSession() {
    setErr('');
    try {
      setS(await api.session(sessionId.trim()));
    } catch (e) {
      setErr(e.message);
    }
  }

  function startCamera() {
    setCamErr('');
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: 640 }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamOn(true);
        setChallenge(['请眨眼', '请缓慢左右摇头', '请张嘴'][Math.floor(Math.random() * 3)]);
      })
      .catch((e) => {
        setCamErr('无法访问摄像头（' + (e.message || '权限被拒绝') + '），可使用下方“演示模式”继续体验。');
      });
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 24;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    const frames = [];
    for (let i = 0; i < 8; i++) {
      sctx.drawImage(video, 0, 0, 32, 24);
      const d = sctx.getImageData(0, 0, 32, 24).data;
      const g = new Float32Array(32 * 24);
      for (let k = 0; k < g.length; k++) g[k] = d[k * 4] * 0.299 + d[k * 4 + 1] * 0.587 + d[k * 4 + 2] * 0.114;
      frames.push(g);
      await sleep(160);
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    const scale = Math.min(1, 480 / w);
    const big = document.createElement('canvas');
    big.width = Math.round(w * scale);
    big.height = Math.round(h * scale);
    big.getContext('2d').drawImage(video, 0, 0, big.width, big.height);
    setPhoto(big.toDataURL('image/jpeg', 0.7));
    setMotion(computeMotion(frames));
    setCapturing(false);
  }

  function getRealLocation() {
    setLocMsg('正在获取定位…');
    if (!navigator.geolocation) {
      setLocMsg('当前环境不支持定位，请使用下方演示定位。');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, source: 'gps' });
        setLocMsg('已获取真实定位，精度 ' + Math.round(pos.coords.accuracy) + 'm');
      },
      (e) => setLocMsg('定位失败：' + e.message + '，请使用下方演示定位。'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function demoLoc(kind) {
    if (!s) return;
    const c = s.center;
    if (kind === 'in') {
      setLoc({ lat: c.lat + 0.0004, lng: c.lng, accuracy: 20, source: 'demo' });
      setLocMsg('演示定位：教室内（约 45m）');
    } else if (kind === 'far') {
      setLoc({ lat: c.lat + 0.05, lng: c.lng, accuracy: 20, source: 'demo' });
      setLocMsg('演示定位：远离教室（约 5.5km）');
    } else {
      setLoc({ lat: c.lat + 0.0004, lng: c.lng, accuracy: 400, source: 'demo' });
      setLocMsg('演示定位：低精度（accuracy 400m）');
    }
  }

  function demoPhoto(motionVal) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = '#1e293b';
    ctx.font = '16px sans-serif';
    ctx.fillText('占位人脸照片（演示）', 82, 120);
    setPhoto(c.toDataURL('image/jpeg', 0.6));
    setMotion(motionVal);
  }

  function scan() {
    if (s?.passcode) {
      setPasscode(s.passcode);
      setErr('');
    }
  }

  async function submit() {
    setErr('');
    setResult(null);
    if (!s) return setErr('请先进入签到场次');
    if (s.status !== 'active') return setErr('该签到场次已结束');
    if (!studentId) return setErr('请选择你的身份');
    if (!passcode) return setErr('请输入或扫描签到口令');
    if (!loc) return setErr('请先获取定位');
    if (method === 'photo' && !photo) return setErr('请先拍照完成活体检测');
    setSubmitting(true);
    try {
      const r = await api.checkin(s.id, {
        studentId,
        passcode,
        deviceFingerprint: fp.current,
        location: { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy },
        checkinType: method,
        photo: method === 'photo' ? photo : undefined,
        motionScore: method === 'photo' ? motion : undefined,
      });
      setResult(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------- 未进入场次：输入签到码 ---------- */
  if (!s) {
    return (
      <div className="wrap narrow">
        <div className="card" style={{ marginTop: 20 }}>
          <h2>进入签到</h2>
          <p className="muted small" style={{ marginTop: 6 }}>扫描教师二维码会自动带入，也可手动输入签到场次编号。</p>
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

      {/* 2. 口令 */}
      <div className="card">
        <div className="step active">
          <div className="n">2</div>
          <div><b>输入 / 扫描签到口令</b> <span className="muted small">（每 15s 刷新，过期失效）</span></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            className="mono"
            style={{ flex: 1, letterSpacing: 4, fontSize: 18, fontWeight: 700 }}
            maxLength={6}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="6 位口令"
          />
          <button className="btn" onClick={scan} disabled={s.status !== 'active'}>📷 模拟扫码</button>
        </div>
      </div>

      {/* 3. 签到方式 */}
      <div className="card">
        <div className="step active">
          <div className="n">3</div>
          <div><b>选择签到方式</b></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className={`btn ${method === 'gps' ? 'primary' : ''}`} onClick={() => setMethod('gps')}>📍 定位签到</button>
          <button className={`btn ${method === 'photo' ? 'primary' : ''}`} onClick={() => setMethod('photo')}>🤳 拍照签到</button>
        </div>
      </div>

      {/* 4. 定位 */}
      <div className="card">
        <div className="step active">
          <div className="n">4</div>
          <div><b>获取定位</b> <span className="muted small">（超出围栏直接拒绝）</span></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={getRealLocation}>获取真实定位</button>
          <button className="btn" onClick={() => demoLoc('in')}>演示：教室内</button>
          <button className="btn" onClick={() => demoLoc('far')}>演示：校外/异地</button>
          <button className="btn" onClick={() => demoLoc('bad')}>演示：低精度</button>
        </div>
        {locMsg && <div className="hint" style={{ marginTop: 8 }}>{locMsg}</div>}
        {loc && (
          <div className="hint mono" style={{ marginTop: 6 }}>
            lat {loc.lat.toFixed(5)}, lng {loc.lng.toFixed(5)} · accuracy {Math.round(loc.accuracy)}m · {loc.source === 'demo' ? '演示' : 'GPS'}
          </div>
        )}
      </div>

      {/* 5. 拍照（拍照签到） */}
      {method === 'photo' && (
        <div className="card">
          <div className="step active">
            <div className="n">5</div>
            <div><b>现场拍照 + 活体检测</b> <span className="muted small">（静态照片会被判失败）</span></div>
          </div>

          {camErr && <div className="banner warn" style={{ marginTop: 10 }}>{camErr}</div>}

          {!camOn ? (
            <button className="btn primary block" style={{ marginTop: 10 }} onClick={startCamera}>开启摄像头</button>
          ) : (
            <>
              <video ref={videoRef} autoPlay muted playsInline className="mirror" style={{ marginTop: 10 }} />
              {challenge && <div className="banner warn" style={{ marginTop: 10 }}>活体动作提示：{challenge}</div>}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={capture} disabled={capturing}>
                  {capturing ? '采集中…' : '拍照并检测活体'}
                </button>
                <button className="btn ghost" onClick={stopCamera}>关闭摄像头</button>
              </div>
            </>
          )}

          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => demoPhoto(0.035)}>演示：活体通过</button>
            <button className="btn bad" onClick={() => demoPhoto(0.001)}>演示：静态照片</button>
          </div>

          {photo && (
            <div style={{ marginTop: 12 }}>
              <img src={photo} alt="签到照片" className="preview" style={{ maxHeight: 240, objectFit: 'cover' }} />
              <div className="hint" style={{ marginTop: 6 }}>
                活体运动量：<b>{motion != null ? motion.toFixed(3) : '—'}</b>
                {motion != null && (motion >= 0.01 ? '（通过）' : '（低于阈值，将判为活体失败）')}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <button className="btn primary block" onClick={submit} disabled={submitting || s.status !== 'active'}>
          {submitting ? '提交中…' : '提交签到'}
        </button>
        <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
          提交时会同时校验：口令有效性 · 围栏距离 · 设备指纹 · 活体运动量
        </div>
      </div>
    </div>
  );
}
