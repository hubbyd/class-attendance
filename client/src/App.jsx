import React, { useEffect, useState } from 'react';
import Home from './pages/Home.jsx';
import Teacher from './pages/Teacher.jsx';
import TeacherSession from './pages/TeacherSession.jsx';
import Student from './pages/Student.jsx';

export function navigate(to) {
  window.location.hash = to;
}

function parseHash() {
  const h = window.location.hash.replace(/^#/, '');
  const [pathPart, query] = h.split('?');
  return { path: pathPart || '/', params: new URLSearchParams(query || '') };
}

export default function App() {
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  let page = <Home />;
  if (route.path.startsWith('/teacher')) page = <Teacher />;
  else if (route.path.startsWith('/session')) page = <TeacherSession id={route.params.get('id')} />;
  else if (route.path.startsWith('/student'))
    page = <Student sid={route.params.get('sid')} classId={route.params.get('class')} />;

  return (
    <>
      <div className="topbar">
        <div className="logo">课堂考勤 · 防作弊签到</div>
        <span className="tag">原型 Demo</span>
        <div className="spacer" />
        <button
          className="btn ghost sm"
          style={{ color: '#fff', borderColor: '#334155' }}
          onClick={() => navigate('/')}
        >
          首页
        </button>
      </div>
      {page}
    </>
  );
}
