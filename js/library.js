/* Vesna — библиотека: встроенная музыка и звуки, свои шрифты и свои стикеры.
   Свои шрифты и стикеры общие для всех проектов (хранятся в IndexedDB с пометкой «__lib__»). */
'use strict';

V.library = (() => {
  const L = { fonts: [], stickers: [] };
  const LIB = '__lib__';

  L.MUSIC = [
    { file: 'vesna-pop', name: 'Весенний поп', mood: 'Лёгкий, позитивный · 112 BPM' },
    { file: 'solnce', name: 'Солнечный день', mood: 'Радостный · 120 BPM' },
    { file: 'energiya', name: 'Энергия', mood: 'Динамичный, для спорта · 128 BPM' },
    { file: 'ulitsa', name: 'Улица', mood: 'Хип-хоп бит · 90 BPM' },
    { file: 'spokoyno', name: 'Спокойно', mood: 'Медленный, для влогов · 80 BPM' },
  ];
  L.SFX = [
    { file: 'whoosh', name: 'Вжух' }, { file: 'pop', name: 'Поп' }, { file: 'click', name: 'Щелчок' },
    { file: 'ding', name: 'Дзынь' }, { file: 'tada', name: 'Та-да!' }, { file: 'fail', name: 'Провал' },
    { file: 'aplodismenty', name: 'Аплодисменты' }, { file: 'boom', name: 'Бум' }, { file: 'boop', name: 'Буп' },
  ];

  /* --- Встроенные звуки: скачиваем файл приложения и добавляем как обычное аудио --- */
  const addBuiltin = async (path, name) => {
    try {
      const r = await fetch(path);
      if (!r.ok) throw new Error(r.status);
      const blob = await r.blob();
      const m = await V.media.addBlob(new Blob([blob], { type: 'audio/mpeg' }), name + '.mp3', 'audio');
      V.project.addMediaClip(m, { at: V.engine.time });
      V.toast('Добавлено: ' + name);
    } catch (e) {
      V.toast('Не удалось загрузить звук. Откройте Vesna через приложение или веб-сервер.', 4000);
    }
  };

  let previewAudio = null, previewBtn = null;
  const preview = (path, btn) => {
    if (previewAudio) { previewAudio.pause(); previewBtn && (previewBtn.textContent = '▶'); }
    if (previewBtn === btn) { previewAudio = previewBtn = null; return; }
    previewAudio = new Audio(path);
    previewBtn = btn;
    btn.textContent = '❚❚';
    previewAudio.play().catch(() => {});
    previewAudio.onended = () => { btn.textContent = '▶'; previewAudio = previewBtn = null; };
  };

  /* --- Свои шрифты --- */
  const registerFont = async (rec) => {
    try {
      const face = new FontFace(rec.family, await rec.blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      return true;
    } catch (e) { console.warn('font', rec.name, e); return false; }
  };

  L.importFonts = async (files) => {
    let ok = 0;
    for (const f of files) {
      if (!/\.(ttf|otf|woff2?|ttc)$/i.test(f.name)) { V.toast('Это не файл шрифта: ' + f.name); continue; }
      const family = 'Свой: ' + f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 40);
      const rec = { id: V.uid('font'), kind: 'font', name: f.name, family, blob: f, added: Date.now(), projects: [LIB] };
      if (await registerFont(rec)) {
        await V.storage.putMedia(rec);
        L.fonts.push({ id: rec.id, family, name: f.name });
        ok++;
      } else V.toast('Шрифт повреждён или не поддерживается: ' + f.name, 4000);
    }
    if (ok) { V.toast(`Добавлено шрифтов: ${ok}`); L.render(); V.bus.emit('fonts'); }
  };

  L.removeFont = async (id) => {
    await V.storage.deleteMedia(id);
    L.fonts = L.fonts.filter(f => f.id !== id);
    L.render(); V.bus.emit('fonts');
  };

  /* Полный список шрифтов для выбора в тексте */
  L.fontList = () => [
    ...V.FONTS,
    ...L.fonts.map(f => ({ id: `"${f.family}", sans-serif`, name: f.family })),
  ];

  /* --- Свои стикеры --- */
  L.importStickers = async (files) => {
    let ok = 0;
    for (const f of files) {
      if (!/^image\//.test(f.type) && !/\.(png|webp|gif|svg|jpe?g)$/i.test(f.name)) { V.toast('Это не картинка: ' + f.name); continue; }
      const rec = { id: V.uid('stk'), kind: 'sticker', name: f.name, blob: f, added: Date.now(), projects: [LIB] };
      await V.storage.putMedia(rec);
      L.stickers.push({ ...rec, url: URL.createObjectURL(f) });
      ok++;
    }
    if (ok) { V.toast(`Добавлено стикеров: ${ok}`); L.render(); }
  };

  L.useSticker = async (s) => {
    const m = await V.media.addBlob(s.blob, s.name, 'image');
    const c = V.project.addMediaClip(m, { overlay: true, at: V.engine.time, select: true });
    if (c) { c.scale = 0.35; c.duration = 3; c.animIn = 'pop'; c.animOut = 'fade'; c.name = 'Стикер'; V.project.changed(); }
  };

  L.removeSticker = async (id) => {
    const s = L.stickers.find(x => x.id === id);
    if (s) URL.revokeObjectURL(s.url);
    await V.storage.deleteMedia(id);
    L.stickers = L.stickers.filter(x => x.id !== id);
    L.render();
  };

  /* --- Отрисовка разделов --- */
  L.render = () => {
    // аудио
    const mus = document.getElementById('musicList');
    if (mus && !mus.childElementCount) {
      L.MUSIC.forEach(t => {
        const path = `library/music/${t.file}.mp3`;
        const play = V.el('button', { class: 'lib-play', title: 'Прослушать', 'aria-label': 'Прослушать ' + t.name }, '▶');
        play.addEventListener('click', () => preview(path, play));
        mus.append(V.el('div', { class: 'lib-row' }, play,
          V.el('div', { class: 'lib-info' }, V.el('b', {}, t.name), V.el('small', {}, t.mood)),
          V.el('button', { class: 'btn sm lib-add', onclick: () => addBuiltin(path, t.name) }, '+ Добавить')));
      });
      const sfx = document.getElementById('sfxList');
      L.SFX.forEach(t => {
        const path = `library/sfx/${t.file}.mp3`;
        const b = V.el('button', { class: 'sfx-chip', title: 'Нажми — послушать, «+» — добавить' },
          V.el('span', { class: 'sfx-name', onclick: (e) => { e.stopPropagation(); new Audio(path).play().catch(() => {}); } }, '🔈 ' + t.name),
          V.el('span', { class: 'sfx-add', onclick: (e) => { e.stopPropagation(); addBuiltin(path, t.name); } }, '+'));
        sfx.append(b);
      });
    }
    // свои стикеры
    const my = document.getElementById('myStickers');
    if (my) {
      my.innerHTML = '';
      L.stickers.forEach(s => {
        my.append(V.el('div', { class: 'my-sticker' },
          V.el('button', { class: 'sticker img', title: s.name, onclick: () => L.useSticker(s) }, V.el('img', { src: s.url, alt: s.name })),
          V.el('button', { class: 'mini danger', title: 'Удалить стикер', onclick: () => { if (confirm('Удалить стикер из библиотеки?')) L.removeSticker(s.id); } }, '×')));
      });
      document.getElementById('myStickersEmpty').hidden = L.stickers.length > 0;
    }
    // свои шрифты
    const fl = document.getElementById('myFonts');
    if (fl) {
      fl.innerHTML = '';
      L.fonts.forEach(f => fl.append(V.el('div', { class: 'font-row' },
        V.el('span', { style: { fontFamily: `"${f.family}"` } }, f.family.replace('Свой: ', '') + ' — Аа Бб 123'),
        V.el('button', { class: 'mini danger', title: 'Удалить шрифт', onclick: () => { if (confirm('Удалить шрифт?')) L.removeFont(f.id); } }, '×'))));
    }
  };

  L.init = async () => {
    const recs = (await V.storage.allMedia()).filter(r => (r.projects || []).includes(LIB));
    for (const r of recs.sort((a, b) => a.added - b.added)) {
      if (r.kind === 'font') { if (await registerFont(r)) L.fonts.push({ id: r.id, family: r.family, name: r.name }); }
      else if (r.kind === 'sticker') L.stickers.push({ ...r, url: URL.createObjectURL(r.blob) });
    }
    document.getElementById('fontInput').addEventListener('change', (e) => { L.importFonts([...e.target.files]); e.target.value = ''; });
    document.getElementById('stickerInput').addEventListener('change', (e) => { L.importStickers([...e.target.files]); e.target.value = ''; });
    // перерисовать превью, когда загрузится шрифт
    document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { V.engine.dirty = true; });
    L.render();
  };

  return L;
})();
