/* Vesna — стартовый экран «Мои проекты»: список проектов, создание, открытие */
'use strict';

V.hub = (() => {
  const H = { currentId: null, index: [] };
  const $ = (id) => document.getElementById(id);
  const P = () => V.project, E = () => V.engine;
  const KEY = (id) => 'project:' + id;

  /* ---------- Индекс проектов ---------- */
  const loadIndex = async () => {
    const raw = await V.storage.getKV('projects');
    H.index = raw ? JSON.parse(raw) : [];
  };
  const saveIndex = () => V.storage.setKV('projects', JSON.stringify(H.index));
  const entry = (id) => H.index.find(p => p.id === id);

  /* Перенос старого единственного проекта (до версии с хабом) */
  const migrate = async () => {
    const old = await V.storage.getKV('project');
    if (!old) return;
    const state = JSON.parse(old);
    state.id ||= V.uid('prj');
    state.created ||= Date.now();
    const recs = await V.storage.allMedia();
    for (const r of recs) if (!r.projects) { r.projects = [state.id]; await V.storage.putMedia(r); }
    await V.storage.setKV(KEY(state.id), JSON.stringify(state));
    const clips = state.tracks.flatMap(t => t.clips);
    H.index.push({ id: state.id, name: state.name, aspect: state.aspect, created: state.created, updated: Date.now(),
      duration: clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0), clips: clips.length, thumb: null });
    await saveIndex();
    await V.storage.delKV('project');
  };

  /* ---------- Превью проекта ---------- */
  let lastThumb = 0;
  const captureThumb = () => {
    const cv = E().canvas;
    if (!cv || P().duration() <= 0) return null;
    const h = 240, w = Math.round(h * cv.width / cv.height);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(cv, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.75);
  };

  /* ---------- Сохранение текущего проекта ---------- */
  H.saveCurrent = async (withThumb = false) => {
    if (!H.currentId) return;
    const s = P().state;
    await V.storage.setKV(KEY(s.id), JSON.stringify(s));
    let e = entry(s.id);
    if (!e) { e = { id: s.id, created: s.created || Date.now() }; H.index.push(e); }
    Object.assign(e, { name: s.name, aspect: s.aspect, updated: Date.now(), duration: P().duration(), clips: P().allClips().length });
    if (withThumb || Date.now() - lastThumb > 8000) {
      const t = captureThumb();
      if (t || !e.clips) e.thumb = t;
      lastThumb = Date.now();
    }
    await saveIndex();
  };

  /* ---------- Открытие / создание ---------- */
  H.open = async (id) => {
    const raw = await V.storage.getKV(KEY(id));
    if (!raw) { V.toast('Проект не найден'); return; }
    E().pause();
    P().init(JSON.parse(raw));
    await V.media.restore(id);
    // клипы с потерянными файлами убираем
    const s = P().state;
    s.tracks.forEach(t => { t.clips = t.clips.filter(c => !c.mediaId || V.media.get(c.mediaId)); });
    P().cleanupTracks();
    H.currentId = id;
    lastThumb = Date.now();
    E().seek(0);
    E().setResolution(E().previewBase);
    P().changed();
    hide();
  };

  H.create = async (aspect = '16:9') => {
    const s = P().blank();
    s.aspect = aspect;
    const n = H.index.length + 1;
    s.name = 'Проект ' + n;
    await V.storage.setKV(KEY(s.id), JSON.stringify(s));
    H.index.push({ id: s.id, name: s.name, aspect, created: s.created, updated: Date.now(), duration: 0, clips: 0, thumb: null });
    await saveIndex();
    await H.open(s.id);
  };

  H.duplicate = async (id) => {
    const raw = await V.storage.getKV(KEY(id));
    if (!raw) return;
    const s = JSON.parse(raw);
    const src = entry(id);
    const nid = V.uid('prj');
    s.id = nid; s.created = Date.now(); s.name = (s.name || 'Проект') + ' (копия)';
    await V.storage.setKV(KEY(nid), JSON.stringify(s));
    // файлы не копируем — просто привязываем их и к новому проекту
    const recs = await V.storage.allMedia();
    for (const r of recs) if ((r.projects || []).includes(id)) { r.projects.push(nid); await V.storage.putMedia(r); }
    H.index.push({ ...src, id: nid, name: s.name, created: s.created, updated: Date.now() });
    await saveIndex();
    render();
    V.toast('Копия создана');
  };

  H.remove = async (id) => {
    const e = entry(id);
    if (!confirm(`Удалить проект «${e?.name || ''}»? Его нельзя будет восстановить.`)) return;
    const recs = await V.storage.allMedia();
    for (const r of recs) if ((r.projects || []).includes(id)) await V.media.detach(r, id);
    await V.storage.delKV(KEY(id));
    H.index = H.index.filter(p => p.id !== id);
    await saveIndex();
    render();
  };

  H.rename = async (id) => {
    const e = entry(id);
    const name = prompt('Название проекта', e.name);
    if (!name || !name.trim()) return;
    e.name = name.trim();
    const raw = await V.storage.getKV(KEY(id));
    if (raw) { const s = JSON.parse(raw); s.name = e.name; await V.storage.setKV(KEY(id), JSON.stringify(s)); }
    await saveIndex();
    render();
  };

  /* ---------- Показ ---------- */
  H.visible = () => !$('hub').hidden;
  H.show = async () => {
    E().pause();
    if (H.currentId) await H.saveCurrent(true);
    H.currentId = null;
    V.media.unload();
    P().init(null);   // освобождаем редактор, пока открыт список
    $('hub').hidden = false;
    document.body.classList.add('hub-open');
    render();
  };
  const hide = () => {
    $('hub').hidden = true;
    document.body.classList.remove('hub-open');
    closeMenu();
    // после возврата в редактор пересчитать размеры
    window.dispatchEvent(new Event('resize'));
  };

  /* ---------- Отрисовка ---------- */
  const when = (ts) => {
    const d = new Date(ts), now = new Date();
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = (day(now) - day(d)) / 864e5;
    if (diff === 0) return 'Сегодня, ' + hm;
    if (diff === 1) return 'Вчера, ' + hm;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  };

  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };
  const openMenu = (btn, p) => {
    closeMenu();
    const r = btn.getBoundingClientRect();
    menu = V.el('div', { class: 'hub-menu', style: { top: (r.bottom + 4) + 'px', left: Math.max(8, Math.min(window.innerWidth - 188, r.right - 180)) + 'px' } },
      V.el('button', { onclick: () => { closeMenu(); H.open(p.id); } }, '▶  Открыть'),
      V.el('button', { onclick: () => { closeMenu(); H.rename(p.id); } }, '✎  Переименовать'),
      V.el('button', { onclick: () => { closeMenu(); H.duplicate(p.id); } }, '⧉  Дублировать'),
      V.el('button', { class: 'danger', onclick: () => { closeMenu(); H.remove(p.id); } }, '🗑  Удалить'),
    );
    document.body.append(menu);
  };

  const render = () => {
    const list = [...H.index].sort((a, b) => b.updated - a.updated);
    $('hubCount').textContent = list.length ? `(${list.length})` : '';
    const grid = $('hubGrid');
    grid.innerHTML = '';
    $('hubEmpty').hidden = list.length > 0;
    V.mascot.set($('hubMascot').firstChild, list.length ? 'wink' : 'wow');
    for (const p of list) {
      const thumb = V.el('div', { class: 'hub-thumb' + (p.thumb ? '' : ' empty') },
        p.thumb ? V.el('img', { src: p.thumb, alt: '' }) : V.el('span', {}, '🌱'),
        V.el('span', { class: 'hub-badge' }, p.aspect),
        p.duration ? V.el('span', { class: 'hub-dur' }, V.fmtTime(p.duration, false)) : null,
      );
      const more = V.el('button', { class: 'hub-more', title: 'Действия', 'aria-label': 'Действия с проектом' }, '⋯');
      more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(more, p); });
      const card = V.el('div', { class: 'hub-card', tabindex: 0, role: 'button', 'aria-label': 'Открыть ' + p.name },
        thumb,
        V.el('div', { class: 'hub-info' },
          V.el('div', { class: 'hub-text' },
            V.el('div', { class: 'hub-name' }, p.name),
            V.el('div', { class: 'hub-meta' }, when(p.updated) + (p.clips ? '' : ' · пустой')),
          ),
          more,
        ),
      );
      card.addEventListener('click', () => H.open(p.id));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') H.open(p.id); });
      grid.append(card);
    }
  };

  /* Выбор формата нового проекта */
  const FORMATS = [
    { a: '9:16', name: 'TikTok, Reels, Shorts' },
    { a: '16:9', name: 'YouTube' },
    { a: '1:1', name: 'Квадрат' },
    { a: '4:5', name: 'Лента Instagram' },
  ];
  const showFormats = () => {
    const box = $('hubFormats');
    box.hidden = !box.hidden;
    if (!box.hidden) box.querySelector('button')?.focus();
  };

  H.init = async () => {
    await loadIndex();
    await migrate();
    $('hubMascot').append(V.mascot.create('wink', 110));
    $('hubNew').addEventListener('click', showFormats);
    const box = $('hubFormats');
    FORMATS.forEach(f => {
      const [w, h] = f.a.split(':').map(Number);
      const k = 30 / Math.max(w, h);
      box.append(V.el('button', { class: 'hub-format', onclick: () => { box.hidden = true; H.create(f.a); } },
        V.el('span', { class: 'hub-frame', style: { width: w * k + 'px', height: h * k + 'px' } }),
        V.el('b', {}, f.a), V.el('small', {}, f.name)));
    });
    document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
    window.addEventListener('resize', closeMenu);
    $('btnHome').addEventListener('click', () => H.show());
    render();
  };

  return H;
})();
