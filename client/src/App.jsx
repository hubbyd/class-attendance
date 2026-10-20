import React, { useEffect, useState } from 'react';
import Home from './pages/Home.jsx';
import Teacher from './pages/Teacher.jsx';
import TeacherSession from './pages/TeacherSession.jsx';
import Student from './pages/Student.jsx';
import History from './pages/History.jsx';
import Counselor from './pages/Counselor.jsx';
import { api, savedTeacherCode } from './api.js';
import { syncIfChanged } from './backup.js';

export function navigate(to) {
  window.location.hash = to;
}

// 学委端后台自动备份：每 10 秒检查一次服务端数据版本，有变化就把全量数据存到本机，
// 以免免费云部署重启清库后数据无法找回。
function AutoBackup() {
  useEffect(() => {
    let stop = false;
    const tick = () => {
      if (!stop) syncIfChanged();
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  return null;
}

function parseHash() {
  const h = window.location.hash.replace(/^#/, '');
  const [pathPart, query] = h.split('?');
  return { path: pathPart || '/', params: new URLSearchParams(query || '') };
}

// 学委端口令闸门：验证通过后本机记住，学生即便手动改网址也进不来
function TeacherGate({ children }) {
  const [ok, setOk] = useState(null); // null=校验中
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const saved = savedTeacherCode();
    if (!saved) return setOk(false);
    api
      .teacherVerify(saved)
      .then(() => setOk(true))
      .catch(() => {
        try {
          localStorage.removeItem('teacherCode');
        } catch {}
        setOk(false);
      });
  }, []);

  async function submit() {
    setErr('');
    try {
      await api.teacherVerify(code.trim());
      try {
        localStorage.setItem('teacherCode', code.trim());
      } catch {}
      setOk(true);
    } catch {
      setErr('口令不正确，请向学委确认');
    }
  }

  if (ok === null) {
    return (
      <div className="wrap narrow">
        <div className="card" style={{ marginTop: 20 }}>
          <h2>正在验证…</h2>
        </div>
      </div>
    );
  }

  if (!ok) {
    return (
      <div className="wrap narrow">
        <div className="card" style={{ marginTop: 20 }}>
          <h2>学委端 · 请输入口令</h2>
          <p className="muted small" style={{ marginTop: 6 }}>
            此界面仅供学委使用，请输入学委口令进入。验证通过后本机会自动记住，无需重复输入。
          </p>
          {err && <div className="banner bad" style={{ margin: '12px 0' }}>{err}</div>}
          <label className="field" style={{ marginTop: 12 }}>
            <span>学委口令</span>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && code.trim() && submit()}
            />
          </label>
          <button className="btn primary block" onClick={submit} disabled={!code.trim()}>
            进入学委端
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <AutoBackup />
      {children}
    </>
  );
}

export default function App() {
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const isStudent = route.path.startsWith('/student');

  let page = <Home />;
  if (route.path.startsWith('/teacher'))
    page = (
      <TeacherGate>
        <Teacher />
      </TeacherGate>
    );
  else if (route.path.startsWith('/session'))
    page = (
      <TeacherGate>
        <TeacherSession id={route.params.get('id')} />
      </TeacherGate>
    );
  else if (route.path.startsWith('/history'))
    page = (
      <TeacherGate>
        <History classId={route.params.get('class')} />
      </TeacherGate>
    );
  else if (route.path.startsWith('/counselor')) page = <Counselor />;
  else if (isStudent) page = <Student sid={route.params.get('sid')} classId={route.params.get('class')} />;

  return (
    <>
      <div className="topbar">
        <div className="logo">课堂考勤 · 防作弊签到</div>
        <span className="tag">原型 Demo</span>
        <div className="spacer" />
        {/* 学生端不显示返回主界面的入口，避免误入学委端 */}
        {!isStudent && (
          <button
            className="btn ghost sm"
            style={{ color: '#fff', borderColor: '#334155' }}
            onClick={() => navigate('/')}
          >
            首页
          </button>
        )}
      </div>
      {page}
    </>
  );
}
