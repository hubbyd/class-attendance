import * as XLSX from 'xlsx';

// 生成真正的 .xlsx 并触发浏览器下载（Excel/WPS 直接打开）。
// header: 表头数组；rows: 二维数组（单元格为字符串或数字）。
export function downloadXlsx(filename, sheetName, header, rows) {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // 按各列内容长度粗估列宽，观感更好
  ws['!cols'] = header.map((h, i) => {
    let w = String(h ?? '').length;
    rows.forEach((r) => {
      const l = String(r[i] ?? '').length;
      if (l > w) w = l;
    });
    return { wch: Math.min(40, Math.max(8, w + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 将时间戳格式化为可用于文件名的串：20261016-1331
export function stamp(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
