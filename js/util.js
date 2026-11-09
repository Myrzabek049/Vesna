/* Vesna — общие утилиты */
'use strict';

const V = window.V = {};

V.uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

V.clamp = (v, a, b) => Math.min(b, Math.max(a, v));

V.fmtTime = (sec, withFrac = true) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  const base = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return withFrac ? base + '.' + String(cs).padStart(2, '0') : base;
};

V.el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
};

V.debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

V.deepClone = (o) => JSON.parse(JSON.stringify(o));

let toastTimer;
V.toast = (msg, ms = 2200) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
};

/* Простейшая шина событий */
V.bus = {
  map: {},
  on(ev, fn) { (this.map[ev] ||= []).push(fn); },
  emit(ev, data) { (this.map[ev] || []).forEach(fn => fn(data)); }
};

/* Ожидание события у элемента */
V.once = (target, ev, timeout = 8000) => new Promise((res, rej) => {
  let to;
  const h = (e) => { clearTimeout(to); target.removeEventListener(ev, h); res(e); };
  target.addEventListener(ev, h);
  to = setTimeout(() => { target.removeEventListener(ev, h); rej(new Error('timeout ' + ev)); }, timeout);
});
