/* Vesna — медиатека: импорт, метаданные, миниатюры, волновые формы */
'use strict';

V.media = (() => {
  const M = { items: new Map() };

  M.get = (id) => M.items.get(id);

  const typeOf = (file) => {
    const t = file.type || '';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('audio/')) return 'audio';
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv'].includes(ext)) return 'video';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
    return null;
  };

  const loadVideoMeta = async (url) => {
    const v = document.createElement('video');
    v.preload = 'auto'; v.muted = true; v.playsInline = true; v.src = url;
    await V.once(v, 'loadedmetadata', 15000);
    let duration = v.duration;
    // у некоторых webm длительность Infinity — «проматываем» до конца
    if (!isFinite(duration)) {
      v.currentTime = 1e9;
      await V.once(v, 'seeked', 15000).catch(() => {});
      duration = v.duration;
      if (!isFinite(duration)) duration = v.currentTime || 5;
    }
    const w = v.videoWidth, h = v.videoHeight;
    let thumb = null;
    try {
      v.currentTime = Math.min(0.5, duration / 3);
      await V.once(v, 'seeked', 8000);
      thumb = snapshot(v, w, h);
    } catch (e) { /* без миниатюры */ }
    v.removeAttribute('src'); v.load();
    return { duration, width: w, height: h, thumb };
  };

  const snapshot = (src, w, h) => {
    const th = 90, tw = Math.max(1, Math.round(th * (w / h || 16 / 9)));
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    c.getContext('2d').drawImage(src, 0, 0, tw, th);
    return c.toDataURL('image/jpeg', 0.7);
  };

  const loadImage = (url) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });

  let actx = null;
  const waveform = async (blob) => {
    try {
      actx ||= new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
      const buf = await actx.decodeAudioData(await blob.arrayBuffer());
      const data = buf.getChannelData(0);
      const W = 600, H = 60;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(255,255,255,0.75)';
      const step = Math.max(1, Math.floor(data.length / W));
      for (let x = 0; x < W; x++) {
        let peak = 0;
        const s = x * step;
        for (let i = 0; i < step; i += 16) peak = Math.max(peak, Math.abs(data[s + i] || 0));
        const bh = Math.max(1, peak * H);
        g.fillRect(x, (H - bh) / 2, 1, bh);
      }
      return { wave: c.toDataURL('image/png'), duration: buf.duration };
    } catch (e) {
      return { wave: null, duration: null };
    }
  };

  /* Создание записи медиа из Blob/File */
  const build = async (rec) => {
    const url = URL.createObjectURL(rec.blob);
    const item = { ...rec, url };
    if (rec.type === 'video') {
      Object.assign(item, await loadVideoMeta(url));
      const w = await waveform(rec.blob);
      item.wave = w.wave;
    } else if (rec.type === 'image') {
      const img = await loadImage(url);
      item.el = img;
      item.width = img.naturalWidth; item.height = img.naturalHeight;
      item.duration = 0;
      item.thumb = snapshot(img, img.naturalWidth, img.naturalHeight);
    } else if (rec.type === 'audio') {
      const w = await waveform(rec.blob);
      item.wave = w.wave;
      item.duration = w.duration;
      if (!item.duration) {
        const a = new Audio(); a.src = url;
        await V.once(a, 'loadedmetadata', 15000).catch(() => {});
        item.duration = isFinite(a.duration) ? a.duration : 5;
      }
    }
    M.items.set(item.id, item);
    return item;
  };

  M.importFiles = async (files) => {
    const list = [...files];
    let ok = 0;
    for (const f of list) {
      const type = typeOf(f);
      if (!type) { V.toast('Формат не поддерживается: ' + f.name); continue; }
      V.toast('Импорт: ' + f.name, 60000);
      try {
        const rec = { id: V.uid('med'), name: f.name, type, blob: f, added: Date.now() };
        await build(rec);
        V.storage.putMedia(rec);
        ok++;
      } catch (e) {
        console.error(e);
        V.toast('Не удалось открыть ' + f.name + '. Браузер не поддерживает этот кодек.', 4000);
      }
    }
    if (ok) V.toast(`Импортировано файлов: ${ok}`);
    M.render();
  };

  /* Добавить медиа из Blob (стоп-кадр, замена клипа) */
  M.addBlob = async (blob, name, type) => {
    const rec = { id: V.uid('med'), name, type, blob, added: Date.now() };
    const item = await build(rec);
    V.storage.putMedia(rec);
    M.render();
    return item;
  };

  M.restore = async () => {
    const recs = await V.storage.allMedia();
    recs.sort((a, b) => (a.added || 0) - (b.added || 0));
    for (const r of recs) {
      try { await build(r); } catch (e) { console.warn('restore failed', r.name, e); }
    }
    M.render();
  };

  M.remove = (id) => {
    const it = M.items.get(id);
    if (!it) return;
    V.project.removeMedia(id);
    M.items.delete(id);
    URL.revokeObjectURL(it.url);
    V.storage.deleteMedia(id);
    M.render();
  };

  M.clear = () => {
    M.items.forEach(it => URL.revokeObjectURL(it.url));
    M.items.clear();
    V.storage.clearMedia();
    M.render();
  };

  /* --- UI медиатеки --- */
  M.render = () => {
    const grid = document.getElementById('mediaGrid');
    grid.innerHTML = '';
    document.getElementById('mediaEmpty').hidden = M.items.size > 0;
    const mm = document.getElementById('mediaMascot');
    if (!mm.firstChild) mm.append(V.mascot.create('wink', 120));
    for (const it of M.items.values()) {
      const used = V.project.allClips().some(c => c.mediaId === it.id);
      const card = V.el('div', { class: 'media-card' + (used ? ' used' : ''), draggable: 'true', 'data-id': it.id, title: it.name },
        V.el('div', { class: 'media-thumb ' + it.type, style: it.thumb ? { backgroundImage: `url(${it.thumb})` } : (it.wave ? { backgroundImage: `url(${it.wave})` } : {}) },
          it.type === 'audio' ? V.el('span', { class: 'media-icon' }, '♪') : null,
          it.type !== 'image' ? V.el('span', { class: 'media-dur' }, V.fmtTime(it.duration, false)) : null,
        ),
        V.el('div', { class: 'media-name' }, it.name),
        V.el('div', { class: 'media-actions' },
          it.type !== 'audio' ? V.el('button', { class: 'mini', title: 'На основную дорожку', onclick: (e) => { e.stopPropagation(); V.project.addMediaClip(it); } }, '+') : null,
          it.type !== 'audio' ? V.el('button', { class: 'mini', title: 'Как оверлей (картинка в картинке)', onclick: (e) => { e.stopPropagation(); V.project.addMediaClip(it, { overlay: true }); } }, '⧉') : null,
          it.type === 'audio' ? V.el('button', { class: 'mini', title: 'Добавить на аудиодорожку', onclick: (e) => { e.stopPropagation(); V.project.addMediaClip(it); } }, '+') : null,
          V.el('button', { class: 'mini danger', title: 'Удалить из проекта', onclick: (e) => {
            e.stopPropagation();
            if (confirm(`Удалить «${it.name}» и все его клипы?`)) M.remove(it.id);
          } }, '×'),
        ),
      );
      card.addEventListener('dblclick', () => V.project.addMediaClip(it));
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/vesna-media', it.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      grid.append(card);
    }
  };

  M.typeOf = typeOf;
  return M;
})();
