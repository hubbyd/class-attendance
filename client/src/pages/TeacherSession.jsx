import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { FLAG_LABEL, SOFT_FLAGS, STATUS_LABEL } from '../flags.js';

const fmtTime = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false });

export default function TeacherSession({ id }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const [qr, setQr] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [reviewing, setReviewing] = useState(null);
  const [publicUrl, setPublicUrl] = useState(window.location.origin);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.config && fetch('/api/config').then((r) => r.json()).then((c) => c.publicUrl && setPublicUrl(c.publicUrl)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      setS(await api.session(id));
    } catch (e) {
      setErr(e.message);
    }
  }

  const studentLink = useMemo(() => {
    if (!s) return '';
    return `${publicUrl}#/student?sid=${s.id}&code=${s.passcode || ''}`;
  }, [s?.id, s?.passcode, publicUrl]);

  useEffect(() => {
    if (studentLink && s?.status === 'active') {
      QRCode.toDataURL(studentLink, { width: 220, margin: 1 }).then(setQr).catch(() => {});
    }
  }, [studentLink, s?.status]);

  async function copyLink() {
    const link = studentLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // 微信内置浏览器可能不支持 clipboard API，降级为手动选中
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function doReview(record, action) {
    try {
      await api.review(s.id, record.id, action);
      setReviewing(null);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function endSession() {
    try {
      await api.endSession(s.id);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!s) return <div className="wrap narrow"><div className="card" style={{ marginTop: 20 }}>{err || '加载中…'}</div></div>;

  const remain = Math.max(0, s.endAt - tick);
  const mm = String(Math.floor(remain / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');

  const byStudent = {};
  s.records.forEach((r) => (byStudent[r.studentId] = r));
  const present = s.roster.filter((r) => r.status === 'present').length;
  const flagged = s.roster.filter((r) => r.status === 'flagged').length;
  const rejected = s.roster.filter((r) => r.status === 'rejected').length;
  const absent = s.roster.filter((r) => r.status === 'absent').length;

  return (
    <div className="wrap">
      {err && <div className="banner bad" style={{ marginTop: 16 }}>{err}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 style={{ flex: 1 }}>{s.title}</h2>
          {s.status === 'active' ? (
            <span className="pill present"><span className="badge-dot" />签到进行中</span>
          ) : (
            <span className="pill absent">已结束</span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          {s.className} · 🏫 {s.roomName} · 围栏半径 {s.radiusMeters}m
        </div>

        <div className="grid c2" style={{ marginTop: 16 }}>
          <div>
            <h3>分享签到链接到班级群</h3>
            {s.status === 'active' ? (
              <>
                <div className="link-box">
                  <span className="mono link-text">{studentLink}</span>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn primary" onClick={copyLink} style={{ flex: 1 }}>
                    📋 复制签到链接到班级群
                  </button>
                </div>
                {copied && (
                  <div className="banner ok" style={{ marginTop: 10 }}>
                    已复制到剪贴板，可直接粘贴到班级群
                  </div>
                )}
                <div className="hint" style={{ marginTop: 10 }}>
                  同学在群里点开链接即可签到，口令已自动带入，无需手动输入。
                </div>
                {qr && <img className="qr" src={qr} width={200} height={200} style={{ marginTop: 12 }} alt="签到二维码" />}
                <div className="hint" style={{ marginTop: 8 }}>
                  也可现场扫码（备用方式）· 口令 <b>{s.passcode}</b> · <b style={{ color: 'var(--brand)' }}>{s.secondsToRotate}s</b> 后刷新 · 剩余 {mm}:{ss}
                </div>
              </>
            ) : (
              <div className="banner warn">签到已结束，链接与口令均已失效</div>
            )}
          </div>
          <div>
            <h3>实时统计</h3>
            <div className="grid c2">
              <div className="stat"><b style={{ color: 'var(--ok)' }}>{present}</b><span>已签到</span></div>
              <div className="stat"><b style={{ color: 'var(--warn)' }}>{flagged}</b><span>待复核</span></div>
              <div className="stat"><b style={{ color: 'var(--bad)' }}>{rejected}</b><span>已拒绝</span></div>
              <div className="stat"><b>{absent}</b><span>未签到</span></div>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn bad" onClick={endSession} disabled={s.status !== 'active'}>结束签到</button>
              <button className="btn" onClick={load}>手动刷新</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>签到明细（点击可查看照片与定位并复核）</h3>
        {s.records.length === 0 ? (
          <div className="muted small">暂无签到记录…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>学生</th><th>方式</th><th>状态</th><th>围栏距离</th><th>异常标记</th><th>时间</th><th></th>
              </tr>
            </thead>
            <tbody>
              {s.records
                .slice()
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name}</b><div className="hint">{r.studentNo}</div></td>
                    <td>{r.checkinType === 'photo' ? '🤳 拍照' : '📍 定位'}</td>
                    <td><span className={`pill ${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td>{r.distance == null ? '—' : r.distance + 'm'}</td>
                    <td>
                      {r.flags.length === 0 && <span className="hint">—</span>}
                      {r.flags.map((f) => (
                        <span key={f} className={`flag-tag ${SOFT_FLAGS.includes(f) ? 'soft' : ''}`}>
                          {FLAG_LABEL[f] || f}
                        </span>
                      ))}
                    </td>
                    <td className="small">{fmtTime(r.createdAt)}</td>
                    <td>
                      <button className="btn sm" onClick={() => setReviewing(r)}>查看</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>全班名单状态</h3>
        <div className="row">
          {s.roster.map((r) => (
            <span key={r.id} className={`pill ${r.status}`}>{r.name} · {STATUS_LABEL[r.status]}</span>
          ))}
        </div>
      </div>

      {reviewing && (
        <div className="modal-mask" onClick={() => setReviewing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{reviewing.name} 的签到凭证</h2>
            <div className="muted small" style={{ marginBottom: 12 }}>
              {reviewing.studentNo} · {fmtTime(reviewing.createdAt)} · 方式：{reviewing.checkinType === 'photo' ? '拍照' : '定位'}
            </div>

            {reviewing.photo ? (
              <img src={reviewing.photo} alt="签到照片" className="preview" style={{ maxHeight: 300, objectFit: 'cover' }} />
            ) : (
              <div className="banner warn">该学生使用的定位签到，无人脸照片</div>
            )}

            <div className="grid c2" style={{ marginTop: 14 }}>
              <div className="stat"><b>{reviewing.distance == null ? '—' : reviewing.distance + 'm'}</b><span>与教室中心距离</span></div>
              <div className="stat"><b>{reviewing.location?.accuracy != null ? reviewing.location.accuracy + 'm' : '—'}</b><span>定位精度</span></div>
              <div className="stat"><b>{reviewing.motionScore == null ? '—' : reviewing.motionScore.toFixed(3)}</b><span>活体运动量</span></div>
              <div className="stat"><b className="mono" style={{ fontSize: 14 }}>{reviewing.deviceFingerprint}</b><span>设备指纹</span></div>
            </div>

            {reviewing.flags.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {reviewing.flags.map((f) => (
                  <span key={f} className={`flag-tag ${SOFT_FLAGS.includes(f) ? 'soft' : ''}`}>
                    {FLAG_LABEL[f] || f}
                  </span>
                ))}
              </div>
            )}

            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn ok" onClick={() => doReview(reviewing, 'approve')}>复核通过</button>
              <button className="btn bad" onClick={() => doReview(reviewing, 'reject')}>拒绝签到</button>
              <button className="btn ghost" onClick={() => setReviewing(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
