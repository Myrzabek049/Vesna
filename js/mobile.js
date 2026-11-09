/* Vesna — мобильный интерфейс: нижняя панель инструментов и выезжающие снизу панели.
   Без выбора — материалы (медиа, аудио, текст…). С выбранным клипом — его инструменты. */
'use strict';

V.mobile = (() => {
  const M = {};
  const mq = window.matchMedia('(max-width: 820px)');
  M.isMobile = () => mq.matches;
  const $ = (id) => document.getElementById(id);
  const P = () => V.project;

  /* Инструменты: [иконка, подпись, действие] */
  const MATERIALS = [
    ['🎞', 'Медиа', () => openLeft('media')],
    ['🎵', 'Аудио', () => openLeft('audio')],
    ['T', 'Текст', () => openLeft('text')],
    ['😊', 'Стикеры', () => openLeft('stickers')],
    ['🎙', 'Озвучка', () => V.voice.start()],
    ['✨', 'Эффекты', () => openLeft('effects')],
  ];
  const toolsFor = (c) => {
    const t = [
      ['✂', 'Разрезать', () => P().splitAtPlayhead()],
    ];
    if (c.type === 'text') t.push(['✎', 'Текст', () => openInsp('Текст')]);
    if (c.type !== 'audio') t.push(['⤢', 'Размер', () => openInsp('Положение')]);
    if (c.type === 'video' || c.type === 'audio') t.push(['⏩', 'Скорость', () => openInsp('Скорость')], ['🔊', 'Звук', () => openInsp('Звук')]);
    if (c.type === 'video' || c.type === 'image') t.push(['🎨', 'Цвет', () => openInsp('Цвет')], ['⬚', 'Кадр', () => openInsp('Кадрирование')], ['🟩', 'Хромакей', () => openInsp('Хромакей')]);
    if (c.type !== 'audio') t.push(['◆', 'Ключ. кадры', () => openInsp('Ключевые')], ['✨', 'Анимация', () => openInsp('Анимация')]);
    t.push(['⧉', 'Копия', () => P().duplicate(c.id)], ['🗑', 'Удалить', () => P().remove(c.id)], ['⚙', 'Все настройки', () => openInsp(null)]);
    return t;
  };

  const renderBar = () => {
    const bar = $('mobileBar');
    if (!bar) return;
    const c = P().selected();
    bar.innerHTML = '';
    if (c) bar.append(V.el('button', { class: 'mb-btn back', title: 'Снять выделение', onclick: () => P().select(null) }, V.el('i', {}, '‹'), V.el('span', {}, 'Назад')));
    for (const [icon, label, fn] of (c ? toolsFor(c) : MATERIALS)) {
      bar.append(V.el('button', { class: 'mb-btn', 'data-tool': label, onclick: fn }, V.el('i', {}, icon), V.el('span', {}, label)));
    }
    bar.classList.toggle('clip-mode', !!c);
  };

  /* --- Выезжающие панели --- */
  let openPanel = null;
  const show = (panel) => {
    closeSheets();
    panel.classList.add('sheet-open');
    $('sheetBackdrop').hidden = false;
    openPanel = panel;
  };
  const closeSheets = () => {
    document.querySelectorAll('.sheet-open').forEach(p => p.classList.remove('sheet-open'));
    $('sheetBackdrop').hidden = true;
    openPanel = null;
    V.inspector.focus = null;
    if (M.isMobile()) V.inspector.render();
  };
  M.close = closeSheets;
  M.isOpen = () => !!openPanel;

  const openLeft = (tab) => {
    const b = document.querySelector(`#leftTabs [data-tab="${tab}"]`);
    if (b) b.click();
    document.querySelector('.left-panel .sheet-title').textContent = b ? b.textContent.replace(/^\S+/, '').trim() || 'Материалы' : 'Материалы';
    show(document.querySelector('.left-panel'));
  };
  const openInsp = (section) => {
    show(document.querySelector('.right-panel'));   // сначала закрываем прошлую панель (она сбрасывает раздел)
    V.inspector.focus = section;
    V.inspector.render();
    $('inspTitle').textContent = section ? section.replace('Положение', 'Положение и размер').replace('Ключевые', 'Ключевые кадры').replace('Цвет', 'Цвет и фильтры') : 'Все настройки';
  };
  M.openLeft = openLeft;
  M.openInsp = openInsp;

  /* --- Масштаб таймлайна двумя пальцами --- */
  const pinch = () => {
    const sc = $('trackScroll');
    const pts = new Map();
    let d0 = 0, pps0 = 0;
    sc.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, e);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        d0 = Math.abs(a.clientX - b.clientX) || 1;
        pps0 = V.timeline.pps;
        V.timeline.pinching = true;
      }
    }, true);
    sc.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pts.size === 2 && V.timeline.pinching) {
        const [a, b] = [...pts.values()];
        const d = Math.abs(a.clientX - b.clientX) || 1;
        V.timeline.zoom(pps0 * d / d0);
        e.preventDefault();
      }
    }, { capture: true, passive: false });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) setTimeout(() => { V.timeline.pinching = false; }, 50); };
    sc.addEventListener('pointerup', up, true);
    sc.addEventListener('pointercancel', up, true);
  };

  M.init = () => {
    document.querySelectorAll('.sheet-close').forEach(b => b.addEventListener('click', closeSheets));
    $('sheetBackdrop').addEventListener('click', closeSheets);
    V.bus.on('select', () => { renderBar(); if (openPanel && openPanel.classList.contains('right-panel') && !P().selected()) closeSheets(); });
    V.bus.on('project', renderBar);
    mq.addEventListener ? mq.addEventListener('change', () => { closeSheets(); renderBar(); }) : null;
    // на телефоне добавление материала закрывает панель, чтобы сразу увидеть результат
    document.querySelector('.left-panel').addEventListener('click', (e) => {
      if (!M.isMobile()) return;
      if (e.target.closest('.text-preset, .sticker, .lib-add, .sfx-add, .media-card .mini:not(.danger), #subsAdd, .filter-card')) setTimeout(closeSheets, 150);
    }, true);
    pinch();
    renderBar();
  };

  return M;
})();
