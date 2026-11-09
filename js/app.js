/* Vesna — запуск приложения и связывание интерфейса */
'use strict';

(async () => {
  const $ = (id) => document.getElementById(id);
  const P = V.project, E = V.engine;

  /* ---------- Заставка с маскотом ---------- */
  const splashM = V.mascot.create('focus', 140);
  $('splashMascot').append(splashM);
  let sp = 0;
  const spT = setInterval(() => V.mascot.progress(splashM, sp = Math.min(0.95, sp + 0.15)), 120);
  const hideSplash = () => {
    clearInterval(spT);
    V.mascot.progress(splashM, 1);
    V.mascot.set(splashM, 'happy');
    setTimeout(() => { $('splash').classList.add('hide'); setTimeout(() => $('splash').remove(), 400); }, 350);
  };

  /* ---------- Инициализация (проект открывается из хаба) ---------- */
  P.init(null);
  E.init($('preview'));
  V.timeline.init();
  V.inspector.init();
  V.exporter.init();

  $('projectName').value = P.state.name || 'Мой проект';
  $('aspectSelect').value = P.state.aspect;

  /* ---------- Автосохранение ---------- */
  const save = V.debounce(() => V.hub.saveCurrent(), 400);
  V.bus.on('project', () => { save(); V.media.render(); });

  /* ---------- Вкладки левой панели ---------- */
  $('leftTabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    document.querySelectorAll('#leftTabs .tab').forEach(t => t.classList.toggle('active', t === b));
    document.querySelectorAll('.left-panel .tab-body').forEach(s => s.classList.toggle('active', s.dataset.body === b.dataset.tab));
  });

  /* ---------- Импорт ---------- */
  $('fileInput').addEventListener('change', (e) => { V.media.importFiles(e.target.files); e.target.value = ''; });
  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, (e) => {
    if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); dz.classList.add('over'); V.mascot.set($('mediaMascot').firstChild, 'wow'); }
  }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, () => { dz.classList.remove('over'); V.mascot.set($('mediaMascot').firstChild, 'wink'); }));
  document.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) { e.preventDefault(); V.media.importFiles(e.dataTransfer.files); }
  });

  /* ---------- Пресеты ---------- */
  const textPresets = $('textPresets');
  V.TEXT_PRESETS.forEach(p => {
    const t = { ...V.TEXT_DEFAULT, ...p.t };
    const sample = V.el('span', { class: 'tp-sample', style: {
      fontFamily: t.font, color: t.color, fontWeight: t.bold ? 700 : 400, fontStyle: t.italic ? 'italic' : 'normal',
      background: t.bgOpacity ? t.bgColor : 'transparent',
      WebkitTextStroke: t.strokeWidth ? `${Math.min(2, t.strokeWidth / 4)}px ${t.strokeColor}` : '',
      textShadow: t.shadow ? `0 0 8px ${t.color}` : '',
    } }, 'Аа');
    textPresets.append(V.el('button', { class: 'text-preset', onclick: () => P.addTextClip(p) }, sample, V.el('span', {}, p.name)));
  });

  const stickers = $('stickerGrid');
  V.STICKERS.forEach(s => stickers.append(V.el('button', { class: 'sticker', onclick: () => P.addTextClip({ sticker: true, t: { strokeWidth: 0 } }, s) }, s)));

  const filterGrid = $('filterGrid');
  const renderFilterGrid = () => {
    filterGrid.innerHTML = '';
    const sel = P.selected();
    V.FILTERS.forEach(f => {
      const adj = { ...V.DEFAULT_ADJUST, ...f.adj };
      const css = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturate}%) hue-rotate(${adj.hue}deg) grayscale(${adj.grayscale}%) sepia(${adj.sepia}%)`;
      const m = sel && sel.mediaId ? V.media.get(sel.mediaId) : null;
      filterGrid.append(V.el('button', {
        class: 'filter-card' + (sel && sel.filter === f.id ? ' active' : ''),
        onclick: () => {
          const c = P.selected();
          if (!c || (c.type !== 'video' && c.type !== 'image')) return V.toast('Выберите видео или фото на таймлайне');
          P.mutate(() => { c.filter = f.id; });
        },
      }, V.el('div', { class: 'filter-thumb', style: { filter: css, backgroundImage: m?.thumb ? `url(${m.thumb})` : '' } }), V.el('span', {}, f.name)));
    });
  };
  const renderAnimGrid = (id, list, key) => {
    const box = $(id);
    box.innerHTML = '';
    const sel = P.selected();
    list.forEach(a => box.append(V.el('button', {
      class: 'chip' + (sel && sel[key] === a.id ? ' active' : ''),
      onclick: () => {
        const c = P.selected();
        if (!c || c.type === 'audio') return V.toast('Выберите видео, фото или текст');
        P.mutate(() => { c[key] = a.id; });
      },
    }, a.name)));
  };
  const renderPresetPanels = () => {
    renderFilterGrid();
    renderAnimGrid('animInGrid', V.ANIMS_IN, 'animIn');
    renderAnimGrid('animOutGrid', V.ANIMS_OUT, 'animOut');
  };
  V.bus.on('select', renderPresetPanels);
  V.bus.on('project', renderPresetPanels);
  renderPresetPanels();

  /* ---------- Верхняя панель ---------- */
  $('projectName').addEventListener('change', (e) => P.mutate(s => { s.name = e.target.value.trim() || 'Мой проект'; }));
  $('aspectSelect').addEventListener('change', (e) => {
    P.mutate(s => { s.aspect = e.target.value; });
    E.setResolution(E.previewBase);
  });
  $('btnUndo').addEventListener('click', P.undo);
  $('btnRedo').addEventListener('click', P.redo);
  $('btnExport').addEventListener('click', V.exporter.open);
  V.bus.on('project', () => {
    $('aspectSelect').value = P.state.aspect;
    $('projectName').value = P.state.name;
    if (E.canvas) { const { w, h } = P.size(E.previewBase); if (!E.exporting && (E.canvas.width !== w || E.canvas.height !== h)) E.setResolution(E.previewBase); }
  });

  /* ---------- Транспорт ---------- */
  const frame = 1 / 30;
  $('btnPlay').addEventListener('click', E.toggle);
  $('btnToStart').addEventListener('click', () => E.seek(0));
  $('btnToEnd').addEventListener('click', () => E.seek(E.duration()));
  $('btnPrevFrame').addEventListener('click', () => E.seek(E.time - frame));
  $('btnNextFrame').addEventListener('click', () => E.seek(E.time + frame));
  V.bus.on('play', (on) => { $('btnPlay').textContent = on ? '❚❚' : '▶'; $('btnPlay').classList.toggle('on', on); });

  /* ---------- Панель таймлайна ---------- */
  $('btnSplit').addEventListener('click', P.splitAtPlayhead);
  $('btnDuplicate').addEventListener('click', () => P.selectedId ? P.duplicate(P.selectedId) : V.toast('Выберите клип'));
  $('btnDelete').addEventListener('click', () => P.selectedId ? P.remove(P.selectedId) : V.toast('Выберите клип'));
  $('btnAddTrack').addEventListener('click', () => { P.mutate(() => P.addTrack('overlay')); V.toast('Добавлена дорожка оверлея — перетащите на неё фото или видео'); });

  /* ---------- Горячие клавиши ---------- */
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) && e.target.type !== 'range') return;
    if (document.querySelector('dialog[open]') || V.hub.visible()) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); E.toggle(); }
    else if (mod && (k === 'z' || k === 'я') && e.shiftKey) { e.preventDefault(); P.redo(); }
    else if (mod && (k === 'z' || k === 'я')) { e.preventDefault(); P.undo(); }
    else if (mod && (k === 'y' || k === 'н')) { e.preventDefault(); P.redo(); }
    else if (mod && (k === 'd' || k === 'в')) { e.preventDefault(); if (P.selectedId) P.duplicate(P.selectedId); }
    else if (mod && (k === 'b' || k === 'и')) { e.preventDefault(); P.splitAtPlayhead(); }
    else if (mod && (k === 'e' || k === 'у')) { e.preventDefault(); V.exporter.open(); }
    else if (!mod && (k === 's' || k === 'ы')) { P.splitAtPlayhead(); }
    else if (k === 'delete' || k === 'backspace') { if (P.selectedId) { e.preventDefault(); P.remove(P.selectedId); } }
    else if (k === 'arrowleft') { e.preventDefault(); E.seek(E.time - (e.shiftKey ? 1 : frame)); }
    else if (k === 'arrowright') { e.preventDefault(); E.seek(E.time + (e.shiftKey ? 1 : frame)); }
    else if (k === 'home') E.seek(0);
    else if (k === 'end') E.seek(E.duration());
    else if (k === '=' || k === '+') V.timeline.zoom(V.timeline.pps * 1.25);
    else if (k === '-') V.timeline.zoom(V.timeline.pps / 1.25);
    else if (k === 'escape') P.select(null);
  });

  /* ---------- Превью: размер и прямое редактирование ---------- */
  const stage = $('previewStage');
  const canvas = $('preview');
  const selBox = V.el('div', { class: 'sel-box', hidden: true },
    V.el('div', { class: 'sel-handle scale', title: 'Масштаб' }),
    V.el('div', { class: 'sel-handle rotate', title: 'Поворот' }),
  );
  stage.append(selBox);

  const fitCanvas = () => {
    const r = stage.getBoundingClientRect();
    const ar = canvas.width / canvas.height;
    let w = r.width, h = w / ar;
    if (h > r.height) { h = r.height; w = h * ar; }
    canvas.style.width = Math.floor(w) + 'px';
    canvas.style.height = Math.floor(h) + 'px';
    updateSel();
  };
  new ResizeObserver(fitCanvas).observe(stage);
  V.bus.on('resize', fitCanvas);

  const displayScale = () => canvas.getBoundingClientRect().width / canvas.width;

  function updateSel() {
    const id = P.selectedId;
    const box = id && !E.exporting && E.boxes.find(b => b.id === id);
    if (!box) { selBox.hidden = true; return; }
    const s = displayScale();
    const cr = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    selBox.hidden = false;
    selBox.style.width = (box.hw * 2 * s) + 'px';
    selBox.style.height = (box.hh * 2 * s) + 'px';
    selBox.style.left = (cr.left - sr.left + box.cx * s - box.hw * s) + 'px';
    selBox.style.top = (cr.top - sr.top + box.cy * s - box.hh * s) + 'px';
    selBox.style.transform = `rotate(${box.rot}rad)`;
  }
  V.bus.on('rendered', updateSel);
  V.bus.on('select', () => { E.dirty = true; });

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height };
  };
  const hit = (pt) => {
    for (let i = E.boxes.length - 1; i >= 0; i--) {
      const b = E.boxes[i];
      const dx = pt.x - b.cx, dy = pt.y - b.cy;
      const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      if (Math.abs(lx) <= b.hw && Math.abs(ly) <= b.hh) return b;
    }
    return null;
  };

  stage.addEventListener('pointerdown', (e) => {
    if (E.exporting) return;
    const handle = e.target.closest('.sel-handle');
    const pt = toCanvas(e);
    let clip;
    if (handle) clip = P.selected();
    else {
      const b = hit(pt);
      if (!b) { if (e.target === canvas || e.target === stage) P.select(null); return; }
      if (P.selectedId !== b.id) P.select(b.id);
      clip = P.findClip(b.id);
    }
    if (!clip) return;
    e.preventDefault();
    const box = E.boxes.find(b => b.id === clip.id);
    const o = { x: clip.x, y: clip.y, scale: clip.scale, rotation: clip.rotation };
    const W = canvas.width, H = canvas.height;
    const d0 = box ? Math.hypot(pt.x - box.cx, pt.y - box.cy) : 1;
    const a0 = box ? Math.atan2(pt.y - box.cy, pt.x - box.cx) : 0;
    let moved = false;
    const move = (ev) => {
      const p = toCanvas(ev);
      if (!moved) { moved = true; P.checkpoint(); }
      if (handle && handle.classList.contains('scale') && box) {
        clip.scale = V.clamp(o.scale * Math.hypot(p.x - box.cx, p.y - box.cy) / d0, 0.05, 10);
      } else if (handle && box) {
        let r = o.rotation + (Math.atan2(p.y - box.cy, p.x - box.cx) - a0) * 180 / Math.PI;
        r = ((r + 540) % 360) - 180;
        // привязка к 0/90/180
        for (const sn of [-180, -90, 0, 90, 180]) if (Math.abs(r - sn) < 4) r = sn;
        clip.rotation = Math.round(r);
      } else {
        let nx = o.x + (p.x - pt.x) / W, ny = o.y + (p.y - pt.y) / H;
        // привязка к центру
        if (Math.abs(nx) < 0.012) nx = 0;
        if (Math.abs(ny) < 0.012) ny = 0;
        clip.x = nx; clip.y = ny;
      }
      E.dirty = true;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) P.changed();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // колесо мыши над превью — масштаб выбранного клипа
  stage.addEventListener('wheel', (e) => {
    const c = P.selected();
    if (!c || c.type === 'audio') return;
    e.preventDefault();
    P.checkpoint();
    c.scale = V.clamp(c.scale * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.05, 10);
    P.changed();
  }, { passive: false });

  /* ---------- PWA ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.VesnaAndroid) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ---------- Хаб проектов ---------- */
  await V.hub.init();
  await V.hub.show();
  hideSplash();
  window.addEventListener('beforeunload', () => V.hub.saveCurrent(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) V.hub.saveCurrent(true); });

  /* Хуки для Android-приложения */
  window.VesnaSave = () => V.hub.saveCurrent(true);
  window.VesnaBack = () => {
    if (V.hub.visible()) return false;            // из хаба — выход из приложения
    const dlg = document.querySelector('dialog[open]');
    if (dlg) { V.exporter.cancel(); return true; }
    if (E.playing) { E.pause(); return true; }
    if (P.selectedId) { P.select(null); return true; }
    V.hub.show();                                  // из редактора — в список проектов
    return true;
  };
})();
