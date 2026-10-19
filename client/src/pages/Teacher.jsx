import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { normalizeRoster, normalizeTimetable, readTable, textToRows } from '../import.js';

const WEEKDAY = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };

// 按“浏览器本地时间”匹配当天课表（服务端在云端多为 UTC，时区不可靠，故在前端匹配）
function matchNow(timetable, sections) {
  const toMin = (s) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const d = new Date();
  const weekday = d.getDay() === 0 ? 7 : d.getDay(); // 1=周一 … 7=周日
  const minutes = d.getHours() * 60 + d.getMinutes();
  const today = timetable
    .filter((x) => x.day === weekday)
    .sort((a, b) => toMin(sections[a.section].start) - toMin(sections[b.section].start));
  const current =
    today.find(
      (x) => minutes >= toMin(sections[x.section].start) && minutes <= toMin(sections[x.section].end),
    ) ||
    today.find((x) => minutes < toMin(sections[x.section].start)) ||
    null;
  return { weekday, today, current };
}

export default function Teacher() {
  const [classes, setClasses] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', roomName: '', lat: '34.116844', lng: '108.929497', radiusMeters: '800' });
  const [showNew, setShowNew] = useState(false);
  const [publicUrl, setPublicUrl] = useState(window.location.origin);
  const [qr, setQr] = useState({});
  const [copied, setCopied] = useState('');
  // 发起签到：按当天课程自动带出教室/楼宇 + 现场取点作为围栏中心
  const [startFor, setStartFor] = useState(null);
  const [startForm, setStartForm] = useState(null);
  const [tt, setTt] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  // 新建班级时的导入：人员名册 + 班级课表（粘贴文本 或 上传 Excel/CSV）
  const [rosterText, setRosterText] = useState('');
  const [timetableText, setTimetableText] = useState('');
  const [rosterRows, setRosterRows] = useState([]);
  const [timetableRows, setTimetableRows] = useState([]);

  const parsedRoster = useMemo(
    () => normalizeRoster([...rosterRows, ...textToRows(rosterText)]),
    [rosterRows, rosterText],
  );
  const parsedTimetable = useMemo(
    () => normalizeTimetable([...timetableRows, ...textToRows(timetableText)]),
    [timetableRows, timetableText],
  );

  async function pickFile(e, kind) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setErr('');
    try {
      const rows = await readTable(f);
      if (kind === 'roster') setRosterRows(rows);
      else setTimetableRows(rows);
    } catch {
      setErr(`无法解析文件「${f.name}」，请使用 Excel(.xlsx/.xls)、CSV 或 TXT。`);
    }
  }

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
    if (!parsedRoster.length) {
      setErr('请先导入班级人员（每行「学号 姓名」，或上传 Excel/CSV），至少 1 人。');
      return;
    }
    try {
      await api.createClass({
        name: form.name,
        roomName: form.roomName,
        lat: Number(form.lat),
        lng: Number(form.lng),
        radiusMeters: Number(form.radiusMeters),
        students: parsedRoster,
        timetable: parsedTimetable,
      });
      setShowNew(false);
      setForm({ ...form, name: '', roomName: '' });
      setRosterText('');
      setTimetableText('');
      setRosterRows([]);
      setTimetableRows([]);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeClass(c) {
    setErr('');
    const yes = window.confirm(
      `确定删除班级「${c.name}」吗？\n\n该班级的全部签到场次、名单与签到历史记录都会被一并删除，且无法恢复。`,
    );
    if (!yes) return;
    try {
      await api.deleteClass(c.id);
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

  // 打开「发起签到」面板：自动读取当天课表，匹配本节次课程并预填教室/楼宇
  async function openStart(c) {
    setErr('');
    try {
      // 已有进行中的签到则直接进入，避免重复发起
      const a = await api.activeSession(c.id);
      if (a.active) {
        navigate('/session?id=' + a.session.id);
        return;
      }
      const t = await api.timetable(c.id);
      const { weekday, today, current } = matchNow(t.timetable, t.sections);
      setTt({ weekday, today, current, buildingPresets: t.buildingPresets, total: t.timetable.length });
      setStartForm({
        selIdx: current ? today.indexOf(current) : -1,
        course: current ? current.course : '',
        room: current ? current.room : c.roomName,
        building: current ? current.building : '',
        title: current ? `${current.course} 课堂签到` : `${c.name} 课堂签到`,
        lat: '',
        lng: '',
        radiusMeters: 150,
        durationMin: 15,
      });
      setLocMsg('');
      setStartFor(c);
    } catch (e) {
      setErr(e.message);
    }
  }

  function pickCourse(e) {
    const idx = Number(e.target.value);
    const cur = tt.today[idx];
    if (!cur) {
      setStartForm((f) => ({ ...f, selIdx: -1 }));
      return;
    }
    setStartForm((f) => ({
      ...f,
      selIdx: idx,
      course: cur.course,
      room: cur.room,
      building: cur.building,
      title: `${cur.course} 课堂签到`,
    }));
  }

  // 在教室现场取当前位置，作为本次签到的围栏中心（精确到本栋楼）
  function useMyLocation() {
    if (!startFor) return;
    if (!navigator.geolocation) {
      setLocMsg('当前浏览器不支持定位，请手动填写坐标');
      return;
    }
    setLocating(true);
    setLocMsg('正在获取定位…（请在教室内点击并允许定位）');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setStartForm((f) => ({
          ...f,
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6),
          // 定位精度较差时适当放宽半径，保证本栋楼内同学都能签上
          radiusMeters: accuracy && accuracy > 60 ? 200 : 150,
        }));
        setLocMsg(`已取点成功（精度约 ${Math.round(accuracy || 0)}m），已作为本栋楼的围栏中心`);
        setLocating(false);
      },
      (e) => {
        setLocMsg('定位失败：' + (e.message || '请检查是否已允许定位') + '。可手动填写坐标。');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function confirmStart() {
    if (!startFor || !startForm) return;
    setErr('');
    if (!startForm.lat || !startForm.lng) {
      setErr('请先点「获取当前定位」，在教室现场取点作为围栏中心（精确到本栋楼）');
      return;
    }
    try {
      const s = await api.createSession(startFor.id, {
        title: startForm.title,
        course: startForm.course,
        building: startForm.building,
        roomName: startForm.room,
        lat: Number(startForm.lat),
        lng: Number(startForm.lng),
        radiusMeters: Number(startForm.radiusMeters),
        durationMin: Number(startForm.durationMin),
      });
      setStartFor(null);
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
          <div style={{ marginTop: 14 }}>
            <div className="grid c2">
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
            </div>

            {/* ① 班级人员导入 */}
            <div className="card" style={{ marginTop: 4, background: '#f8fafc' }}>
              <div className="row">
                <b style={{ flex: 1 }}>① 导入班级人员（必填）</b>
                <label className="btn sm" style={{ cursor: 'pointer' }}>
                  📄 上传 Excel / CSV
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => pickFile(e, 'roster')}
                  />
                </label>
              </div>
              <div className="hint" style={{ margin: '6px 0 8px' }}>
                每行一条：<span className="mono">学号,姓名</span>（逗号、空格或制表符分隔均可；可直接从 Excel 复制粘贴）
              </div>
              <textarea
                rows={5}
                value={rosterText}
                onChange={(e) => setRosterText(e.target.value)}
                placeholder={'2431081147,许东宁\n2431211144,刘思甜'}
              />
              {parsedRoster.length > 0 ? (
                <div className="banner ok" style={{ marginTop: 8 }}>
                  已识别 <b>{parsedRoster.length}</b> 人：{parsedRoster.slice(0, 4).map((s) => s.name).join('、')}
                  {parsedRoster.length > 4 ? ' 等' : ''}
                </div>
              ) : (
                <div className="hint" style={{ marginTop: 8 }}>尚未识别到学生，请粘贴或上传名册。</div>
              )}
            </div>

            {/* ② 班级课表导入 */}
            <div className="card" style={{ marginTop: 12, background: '#f8fafc' }}>
              <div className="row">
                <b style={{ flex: 1 }}>② 导入班级课表（选填）</b>
                <label className="btn sm" style={{ cursor: 'pointer' }}>
                  📄 上传 Excel / CSV
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => pickFile(e, 'timetable')}
                  />
                </label>
              </div>
              <div className="hint" style={{ margin: '6px 0 8px' }}>
                每行一条：<span className="mono">星期,节次,课程,教室,教师</span>（节次填 1-2 / 3-4 / 5-6 / 7-8）。
                导入后，发起签到时会自动按当天课程带出教室。
              </div>
              <textarea
                rows={5}
                value={timetableText}
                onChange={(e) => setTimetableText(e.target.value)}
                placeholder={'周三,1-2,操作系统,2号教学楼403,李建廷\n周五,7-8,软件工程,实验楼402,史西兵'}
              />
              {parsedTimetable.length > 0 ? (
                <div className="banner ok" style={{ marginTop: 8 }}>
                  已识别 <b>{parsedTimetable.length}</b> 节课：
                  {parsedTimetable.slice(0, 2).map((x) => `${WEEKDAY[x.day]}第${x.section}节《${x.course}》`).join('、')}
                  {parsedTimetable.length > 2 ? ' 等' : ''}
                </div>
              ) : (
                <div className="hint" style={{ marginTop: 8 }}>
                  未导入课表也可以建班，之后发起签到时手动填写课程与教室即可。
                </div>
              )}
            </div>

            <button
              className="btn primary block"
              style={{ marginTop: 14 }}
              onClick={createClass}
              disabled={!form.name || !form.roomName}
            >
              保存班级
            </button>
          </div>
        )}
      </div>

      <div className="grid c2">
        {classes.map((c) => (
          <div className="card" key={c.id}>
            <h2>{c.name}</h2>
            <div className="muted small" style={{ marginTop: 4 }}>
              🏫 {c.roomName} · 围栏半径 {c.radiusMeters}m · 学生 {c.studentCount} 人 · 课表 {c.timetableCount} 条
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

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => openStart(c)} style={{ flex: 2 }}>
                ▶ 发起本次签到（按当天课程）
              </button>
              <button className="btn" onClick={() => navigate('/history?class=' + c.id)} style={{ flex: 1 }}>
                📜 历史记录
              </button>
            </div>
            <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn ghost sm" onClick={() => removeClass(c)}>
                🗑 删除班级
              </button>
            </div>
          </div>
        ))}
      </div>

      {startFor && startForm && (
        <div className="modal-mask" onClick={() => setStartFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>发起签到 · {startFor.name}</h2>

            {tt && tt.current ? (
              <div className="banner ok">
                按当前时间自动匹配：{WEEKDAY[tt.weekday]} 第 {tt.current.section} 节《{tt.current.course}》
                · {tt.current.room} · {tt.current.teacher}
              </div>
            ) : tt && tt.total === 0 ? (
              <div className="banner warn">
                该班级尚未导入课表，可直接在下方手动填写课程与教室，然后发起签到。
              </div>
            ) : (
              <div className="banner warn">
                {tt
                  ? `今天（${WEEKDAY[tt.weekday] || ''}）当前不在课表节次内，可在下方选择当天课程，或直接发起。`
                  : '正在读取课表…'}
              </div>
            )}

            {tt && tt.today.length > 0 && (
              <label className="field" style={{ marginTop: 12 }}>
                <span>选择本次课程（今天课表）</span>
                <select value={startForm.selIdx} onChange={pickCourse}>
                  <option value={-1}>— 不按课表，手动填写 —</option>
                  {tt.today.map((x, i) => (
                    <option key={i} value={i}>
                      第 {x.section} 节 · {x.course}（{x.room}）
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid c2" style={{ marginTop: 12 }}>
              <label className="field">
                <span>签到标题</span>
                <input value={startForm.title} onChange={(e) => setStartForm({ ...startForm, title: e.target.value })} />
              </label>
              <label className="field">
                <span>教室</span>
                <input value={startForm.room} onChange={(e) => setStartForm({ ...startForm, room: e.target.value })} />
              </label>
              <label className="field">
                <span>楼宇</span>
                <input
                  list="building-presets"
                  value={startForm.building}
                  onChange={(e) => setStartForm({ ...startForm, building: e.target.value })}
                />
              </label>
              <datalist id="building-presets">
                {(tt.buildingPresets || []).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <label className="field">
                <span>有效时长（分钟）</span>
                <input
                  value={startForm.durationMin}
                  onChange={(e) => setStartForm({ ...startForm, durationMin: e.target.value })}
                />
              </label>
            </div>

            <div className="card" style={{ marginTop: 12, background: '#f8fafc' }}>
              <div className="hint" style={{ fontWeight: 700, color: 'var(--brand)' }}>
                围栏中心（在教室现场取点，精确到本栋楼）
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" onClick={useMyLocation} disabled={locating} style={{ flex: 1 }}>
                  📍 获取当前定位（教室现场取点）
                </button>
              </div>
              {locMsg && <div className="hint" style={{ marginTop: 8 }}>{locMsg}</div>}
              <div className="grid c2" style={{ marginTop: 10 }}>
                <label className="field">
                  <span>围栏中心纬度 (lat)</span>
                  <input value={startForm.lat} onChange={(e) => setStartForm({ ...startForm, lat: e.target.value })} />
                </label>
                <label className="field">
                  <span>围栏中心经度 (lng)</span>
                  <input value={startForm.lng} onChange={(e) => setStartForm({ ...startForm, lng: e.target.value })} />
                </label>
                <label className="field">
                  <span>围栏半径（米）</span>
                  <input
                    value={startForm.radiusMeters}
                    onChange={(e) => setStartForm({ ...startForm, radiusMeters: e.target.value })}
                  />
                </label>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                默认半径 150m，约覆盖一栋教学楼；定位精度较差时会自动放宽到 200m。
              </div>
            </div>

            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn primary" onClick={confirmStart}>✅ 确认发起</button>
              <button className="btn ghost" onClick={() => setStartFor(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
