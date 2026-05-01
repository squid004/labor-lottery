const SHEET_ID = '1qi-c7I46d9lMgPD4sf4Oamo1aLeKwNZ2m-u2d6JqoP4';
let entries = [];
let currentMonth = new Date(2026, 5, 1);

function splitCSVLine(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const name = (cols[1] || '').trim();
    if (!name || name.toLowerCase() === 'full name') continue;
    for (const [di, ti] of [[2,3],[4,5],[6,7]]) {
      const date = (cols[di] || '').trim();
      const time = (cols[ti] || '').trim();
      if (date) result.push({ name, date, time });
    }
  }
  return result;
}

async function loadData() {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.includes('<!DOCTYPE')) continue;
      entries = parseCSV(text);
      updateStats(entries);
      renderTable(next10(entries));
      renderCalendar(entries);
      document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
      return;
    } catch(e) {
      console.warn('URL failed:', url, e);
    }
  }
  document.getElementById('calendar-grid').innerHTML =
    '<div class="loading" style="grid-column:1/-1">Could not load data. Make sure the sheet is shared publicly.</div>';
  document.getElementById('entries-tbody').innerHTML =
    '<tr><td colspan="4" class="no-entries">Could not load entries.</td></tr>';
}

function formatTime(timeStr) {
  if (!timeStr || !timeStr.trim()) return '—';
  const t = timeStr.trim();
  const num = parseFloat(t);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMins = Math.round(num * 24 * 60);
    const hours24 = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const ampm = hours24 < 12 ? 'AM' : 'PM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return hours12 + ':' + String(mins).padStart(2, '0') + ' ' + ampm;
  }
  return t;
}

function parseEntryDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
  let d = new Date(cleaned + ' 2026');
  if (!isNaN(d.getTime())) return d;
  d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function getEasternNow() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function parseTimeMinutes(timeStr) {
  if (!timeStr || !timeStr.trim()) return null;
  const t = timeStr.trim();
  const num = parseFloat(t);
  if (!isNaN(num) && num >= 0 && num < 1) return Math.round(num * 24 * 60);
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (m) {
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const ampm = (m[3] || '').toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }
  return null;
}

function parseFullDatetime(dateStr, timeStr) {
  const d = parseEntryDate(dateStr);
  if (!d) return null;
  const mins = parseTimeMinutes(timeStr);
  if (mins !== null) d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

function next10(data) {
  const now = getEasternNow();
  const withDt = data
    .map(e => ({ entry: e, dt: parseFullDatetime(e.date, e.time) }))
    .filter(x => x.dt !== null);

  // Closest future guess sets the cutoff — past guesses farther than this are eliminated
  const minFutureDist = withDt
    .filter(x => x.dt >= now)
    .reduce((min, x) => Math.min(min, x.dt - now), Infinity);

  return withDt
    .filter(x => x.dt >= now || (now - x.dt) < minFutureDist)
    .sort((a, b) => Math.abs(a.dt - now) - Math.abs(b.dt - now))
    .slice(0, 10)
    .map(x => x.entry);
}

function formatDate(dateStr) {
  const d = parseEntryDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function updateStats(data) {
  const count = data.length;
  const pot = count * 10;
  document.getElementById('stat-entries').textContent = count;
  document.getElementById('stat-winner').textContent = '$' + Math.floor(pot * 0.75);
}

function renderTable(data) {
  const tbody = document.getElementById('entries-tbody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-entries">No entries yet — be the first!</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((e, i) => `
    <tr>
      <td class="rank-cell">${i + 1}</td>
      <td><strong>${e.name}</strong></td>
      <td>${formatDate(e.date)}</td>
      <td class="time-cell">${formatTime(e.time)}</td>
    </tr>
  `).join('');
}

function renderCalendar(data) {
  const grid = document.getElementById('calendar-grid');
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  document.getElementById('cal-month-label').textContent =
    currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const dueDate = new Date(2026, 5, 14);
  const byDate = {};
  data.forEach(e => {
    const d = parseEntryDate(e.date);
    if (!d) return;
    const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(e);
  });
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  let html = days.map(d => '<div class="cal-day-header">' + d + '</div>').join('');
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const key = year + '-' + month + '-' + day;
    const dayEntries = byDate[key] || [];
    const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===day;
    const isDue = dueDate.getFullYear()===year && dueDate.getMonth()===month && dueDate.getDate()===day;
    let cls = 'cal-cell';
    if (isToday) cls += ' today';
    if (isDue) cls += ' due-date';
    if (dayEntries.length) cls += ' has-entries';
    const entriesHtml = dayEntries.map(e =>
      '<div class="cal-entry" title="' + e.name + ' — ' + (e.time || 'TBD') + '">' + e.name + '</div>'
    ).join('');
    const dueHtml = isDue ? '<div class="due-marker">Due date</div>' : '';
    html += '<div class="' + cls + '" data-count="' + dayEntries.length + '"><div class="cal-date">' + day + '</div><div class="cal-entries">' + dueHtml + entriesHtml + '</div></div>';
  }
  grid.innerHTML = html;
}

function changeMonth(dir) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + dir, 1);
  renderCalendar(entries);
}

renderCalendar([]);
loadData();
