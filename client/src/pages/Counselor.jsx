import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { STATUS_LABEL } from '../flags.js';

const fmt = (t) =>
  new Date(t).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// 统计列：出勤 / 迟到 / 请假 / 缺勤 / 代签 / 待复核 / 已拒绝
const COLS = ['present', 'late', 'leave', 'absent', 'proxy', 'flagged', 'rejected'];
const COL_COLORS = {
  present: 'var(--ok)',
  late: '#1d4ed8',
  leave: '#6d28d9',
  absent: 'inherit',
  proxy: '#c2410c',
  flagged: 'var(--warn)',
  rejected: 'var(--bad)',
};

// 导员端：公开只读，仅展示每节课的考勤情况（可展开看学生明细），不能做任何修改
export default function Counselor() {
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .counselorClasses()
      .then((b) => {
        setClasses(b.classes);
        if (b.classes.length) setClassId(b.classes[0].id);
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!classId) return;
    setData(null);
    setOpenId('');
    api
      .counselorHistory(classId)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [classId]);

  if (err) {
    return (
      <div className="wrap narrow">
        <div className="card" style={{ marginTop: 20 }}>
          <div className="banner bad">{err}</div>
        </div>
      </div>
    );
  }

  if (!classes) {
    return (
      <div className="wrap narrow">
        <div className="card" style={{ marginTop: 20 }}>加载中…</div>
      </div>
    );
  }

  const opened = data && openId ? data.sessions.find((s) => s.id === openId) : null;

  return (
    <div className="wrap">
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 style={{ flex: 1 }}>导员端 · 考勤查询</h2>
          <button className="btn ghost" onClick={() => navigate('/')}>返回首页</button>
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          本页仅供查阅，只展示每节课的考勤统计与名单，<b>不能修改任何数据</b>。
        </div>

        {classes.length === 0 ? (
          <div className="muted small" style={{ marginTop: 12 }}>暂无班级数据。</div>
        ) : (
          <label className="field" style={{ marginTop: 12, maxWidth: 320 }}>
            <span>选择班级</span>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.studentCount} 人 · {c.sessionCount} 次签到）
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="card">
        {!data ? (
          <div className="muted small">加载中…</div>
        ) : data.sessions.length === 0 ? (
          <div className="muted small">该班级暂无签到记录。</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>课程 / 标题</th>
                <th>楼宇 · 教室</th>
                {COLS.map((c) => (
                  <th key={c} style={{ textAlign: 'center' }}>{STATUS_LABEL[c]}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.id}>
                  <td className="small">
                    {fmt(s.startAt)}
                    {s.status === 'active' && <span className="pill present" style={{ marginLeft: 6 }}>进行中</span>}
                  </td>
                  <td>
                    <b>{s.course || s.title}</b>
                    {s.course && s.title && s.title !== s.course && <div className="hint">{s.title}</div>}
                  </td>
                  <td className="small">
                    {s.building || '—'}
                    {s.roomName ? ` · ${s.roomName}` : ''}
                  </td>
                  {COLS.map((c) => (
                    <td key={c} style={{ textAlign: 'center' }}>
                      <b style={{ color: COL_COLORS[c] }}>{s.counts[c] || 0}</b>
                    </td>
                  ))}
                  <td>
                    <button
                      className="btn sm"
                      onClick={() => setOpenId(openId === s.id ? '' : s.id)}
                    >
                      {openId === s.id ? '收起名单' : '查看名单'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {opened && (
        <div className="card">
          <h2>
            {opened.course || opened.title} · {fmt(opened.startAt)} 名单
          </h2>
          <div className="muted small" style={{ marginTop: 6 }}>
            应到 {opened.total} 人 ·
            {COLS.map((c) => ` ${STATUS_LABEL[c]} ${opened.counts[c] || 0}`).join(' ·')}
          </div>
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>学号</th>
                <th>姓名</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((stu) => {
                const st = (opened.statuses && opened.statuses[stu.id]) || 'absent';
                return (
                  <tr key={stu.id}>
                    <td className="small">{stu.studentNo}</td>
                    <td>{stu.name}</td>
                    <td>
                      <span className={'pill ' + st}>{STATUS_LABEL[st] || st}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
