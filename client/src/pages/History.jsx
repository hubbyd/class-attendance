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

export default function History({ classId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!classId) return;
    api
      .history(classId)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [classId]);

  if (!classId) return <div className="wrap narrow"><div className="card" style={{ marginTop: 20 }}>缺少班级参数</div></div>;
  if (err) return <div className="wrap narrow"><div className="card" style={{ marginTop: 20 }}><div className="banner bad">{err}</div></div></div>;
  if (!data) return <div className="wrap narrow"><div className="card" style={{ marginTop: 20 }}>加载中…</div></div>;

  return (
    <div className="wrap">
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 style={{ flex: 1 }}>签到历史 · {data.className}</h2>
          <button className="btn ghost" onClick={() => navigate('/teacher')}>返回学委端</button>
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          共 {data.sessions.length} 次签到记录。每次签到的数据都已存入数据库，点击「查看明细」可修改状态。
        </div>
      </div>

      <div className="card">
        {data.sessions.length === 0 ? (
          <div className="muted small">暂无历史记录。发起一次签到后，这里会自动累计每一次的签到数据。</div>
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
                    {s.course && s.title && s.title !== s.course && (
                      <div className="hint">{s.title}</div>
                    )}
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
                    <button className="btn sm" onClick={() => navigate('/session?id=' + s.id)}>查看明细</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
