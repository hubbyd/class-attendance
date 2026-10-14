import React from 'react';
import { navigate } from '../App.jsx';

const FEATURES = [
  { ic: '📍', t: 'GPS 定位围栏', d: '只有进入教室设定半径（电子围栏）内才能签到，超出范围直接拒绝，杜绝异地/远程代签。' },
  { ic: '🤳', t: '拍照 + 活体检测', d: '签到需现场拍照，服务器校验连续帧运动量，静态照片、翻拍截图一律判为活体失败。' },
  { ic: '🔢', t: '动态口令 / 二维码', d: '口令与二维码每 15 秒由密钥派生并刷新，过期即失效，防止口令外泄后被群内批量代签。' },
  { ic: '📱', t: '设备指纹拦截', d: '基于 UA / 屏幕 / Canvas 生成设备指纹，同一设备替多人签到会被识别并拒绝，留痕可复核。' },
];

export default function Home() {
  return (
    <div className="wrap">
      <div className="card" style={{ marginTop: 20 }}>
        <h2>防作弊课堂考勤系统</h2>
        <p className="muted small" style={{ marginTop: 6 }}>
          类似学习通的定位签到 / 拍照签到，加入四重防作弊机制。选择身份进入对应端体验。
        </p>
        <div className="grid c2" style={{ marginTop: 16 }}>
          <button className="btn primary block" style={{ padding: 22, fontSize: 16 }} onClick={() => navigate('/teacher')}>
            👩‍🏫 教师端 · 发起签到 / 实时看板
          </button>
          <button className="btn block" style={{ padding: 22, fontSize: 16 }} onClick={() => navigate('/student')}>
            🎒 学生端 · 定位 / 拍照签到
          </button>
        </div>
      </div>

      <div className="card">
        <h3>四重防作弊能力</h3>
        <div className="grid c2">
          {FEATURES.map((f) => (
            <div className="feat" key={f.t}>
              <div className="ic">{f.ic}</div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{f.t}</div>
                <div className="hint">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
