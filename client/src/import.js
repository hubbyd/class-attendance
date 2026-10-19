// 班级人员 / 课表导入解析。
// 支持两种方式：粘贴文本（每行一条）或上传 Excel / CSV / TXT 文件。
import * as XLSX from 'xlsx';

const SECTIONS = ['1-2', '3-4', '5-6', '7-8'];
const DAY_NAMES = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

// 「周三」「星期三」「礼拜一」「1」「周一」→ 1..7
export function parseDay(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/[星期周礼拜]*\s*([一二三四五六日天1-7])/);
  if (!m) return null;
  return /[1-7]/.test(m[1]) ? Number(m[1]) : DAY_NAMES[m[1]] || null;
}

// 「1-2」「第1-2节」「1」→ 节次键（1-2 / 3-4 / 5-6 / 7-8）
export function parseSection(v) {
  const s = String(v ?? '').replace(/[第节\s]/g, '').replace(/[，,、到~]/g, '-');
  const m = s.match(/(\d)\s*-\s*(\d)/);
  if (m) {
    const key = `${m[1]}-${m[2]}`;
    if (SECTIONS.includes(key)) return key;
  }
  // 单独给一个节号时，归入它所在的两节连堂
  const n = s.match(/(\d)/);
  if (n) {
    const idx = Math.floor((Number(n[1]) - 1) / 2);
    if (SECTIONS[idx]) return SECTIONS[idx];
  }
  return null;
}

// 由教室名推断楼宇：2号教学楼403 → 2号教学楼
function buildingOf(room) {
  const s = String(room ?? '').trim();
  const stripped = s.replace(/[-\s]*\d+\s*$/, '').trim();
  return stripped.length >= 2 ? stripped : s;
}

const isBuilding = (s) => /楼|馆|院|中心|校区/.test(String(s || '')) && !/\d{3,}/.test(String(s || ''));

/* -------- 把文件 / 文本读成二维数组 -------- */

function splitCells(line) {
  const s = line.trim();
  if (s.includes('\t')) return s.split('\t').map((x) => x.trim());
  if (/[,，]/.test(s)) return s.split(/[,，]/).map((x) => x.trim());
  return s.split(/\s+/).map((x) => x.trim());
}

export function textToRows(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => splitCells(l))
    .filter((row) => row.some(Boolean));
}

function sheetToRows(text) {
  const wb = XLSX.read(text, { type: 'string' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
}

// 读取上传的表格文件 → 二维数组
export async function readTable(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.txt')) return textToRows(await file.text());
  if (name.endsWith('.csv')) return sheetToRows(await file.text());
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
}

/* -------- 解析 -------- */

// 人员：每行「学号 姓名」；自动跳过表头、按学号去重
export function normalizeRoster(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    const cells = (row || []).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (!cells.length) continue;
    const joined = cells.join('');
    const noIdx = cells.findIndex((c) => /^\d{5,}$/.test(c.replace(/\s/g, '')));
    if (noIdx < 0) continue; // 表头或无学号的行
    const studentNo = cells[noIdx].replace(/\s/g, '');
    if (/学号|姓名|序号|名字/.test(joined) && noIdx !== 0) continue;
    const name = cells.find((c, i) => i !== noIdx && !/^\d+$/.test(c));
    if (!name || seen.has(studentNo)) continue;
    seen.add(studentNo);
    out.push({ studentNo, name });
  }
  return out;
}

// 课表：每行「星期,节次,课程,教室,教师」；也可带一列楼宇「星期,节次,课程,楼宇,教室,教师」
export function normalizeTimetable(rows, sections = SECTIONS) {
  const out = [];
  for (const row of rows || []) {
    const cells = (row || []).map((c) => String(c ?? '').trim());
    if (!cells.some(Boolean)) continue;
    const dayIdx = cells.findIndex((c) => parseDay(c) != null);
    if (dayIdx < 0) continue; // 表头或空行
    const day = parseDay(cells[dayIdx]);
    const secIdx = cells.findIndex((c, i) => i > dayIdx && sections.includes(parseSection(c)));
    if (secIdx < 0) continue;
    const section = parseSection(cells[secIdx]);
    const rest = cells.filter((c, i) => i !== dayIdx && i !== secIdx && c);
    if (rest.length < 2) continue;
    const teacher = rest[rest.length - 1];
    const room = rest[rest.length - 2];
    let course;
    let building;
    if (rest.length >= 4 && isBuilding(rest[1])) {
      course = rest[0];
      building = rest[1];
    } else {
      course = rest.slice(0, rest.length - 2).join(' ') || rest[0];
      building = buildingOf(room);
    }
    if (!course || !room) continue;
    out.push({ day, section, course, room, building, teacher });
  }
  return out;
}
