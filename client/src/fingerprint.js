// 设备指纹：UA / 屏幕 / 时区 / 硬件 + Canvas 渲染哈希
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function deviceFingerprint() {
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}`,
      String(screen.colorDepth),
      String(new Date().getTimezoneOffset()),
      String(navigator.hardwareConcurrency || 0),
      String(navigator.deviceMemory || 0),
      String(navigator.maxTouchPoints || 0),
    ];
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 60;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f0a';
    ctx.fillRect(0, 0, 220, 60);
    ctx.font = '16px Arial';
    ctx.fillStyle = '#0af';
    ctx.fillText('考勤防作弊指纹', 12, 34);
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    ctx.arc(180, 30, 18, 0, Math.PI * 1.5);
    ctx.stroke();
    parts.push(c.toDataURL());
    return 'fp_' + fnv1a(parts.join('|'));
  } catch {
    return 'fp_' + fnv1a(navigator.userAgent || 'unknown');
  }
}
