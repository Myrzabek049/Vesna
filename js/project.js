/* Vesna — модель проекта, дорожки, клипы, история изменений */
'use strict';

V.ASPECTS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '4:3': [4, 3], '21:9': [21, 9] };
V.MIN_CLIP = 0.1;

V.project = (() => {
  const P = {
    state: null,
    selectedId: null,
    past: [],
    future: [],
  };

  const newTrack = (kind) => ({ id: V.uid('trk'), kind, muted: false, hidden: false, clips: [] });

  P.blank = () => ({
    id: V.uid('prj'),
    created: Date.now(),
    name: 'Мой проект',
    aspect: '16:9',
    background: '#000000',
    tracks: [newTrack('main'), newTrack('audio')],
  });

  P.init = (saved) => {
    P.state = saved && saved.tracks ? saved : P.blank();
    P.past = []; P.future = []; P.selectedId = null;
    V.bus.emit('project');
  };

  /* --- размеры кадра --- */
  P.size = (base = 1080) => {
    const [a, b] = V.ASPECTS[P.state.aspect] || [16, 9];
    // base — короткая сторона
    let w, h;
    if (a >= b) { h = base; w = Math.round(base * a / b); } else { w = base; h = Math.round(base * b / a); }
    return { w: w - (w % 2), h: h - (h % 2) };
  };

  /* --- история --- */
  const snap = () => JSON.stringify(P.state);
  P.checkpoint = () => {
    P.past.push(snap());
    if (P.past.length > 150) P.past.shift();
    P.future = [];
  };
  P.changed = () => { V.bus.emit('project'); };
  P.mutate = (fn) => { P.checkpoint(); const r = fn(P.state); P.changed(); return r; };
  P.undo = () => {
    if (!P.past.length) return V.toast('Нечего отменять');
    P.future.push(snap());
    P.state = JSON.parse(P.past.pop());
    if (!P.findClip(P.selectedId)) P.selectedId = null;
    P.changed();
  };
  P.redo = () => {
    if (!P.future.length) return V.toast('Нечего повторять');
    P.past.push(snap());
    P.state = JSON.parse(P.future.pop());
    if (!P.findClip(P.selectedId)) P.selectedId = null;
    P.changed();
  };

  /* --- поиск --- */
  P.allClips = () => P.state.tracks.flatMap(t => t.clips);
  P.findClip = (id) => {
    if (!id) return null;
    for (const t of P.state.tracks) {
      const c = t.clips.find(c => c.id === id);
      if (c) return c;
    }
    return null;
  };
  P.trackOf = (clipId) => P.state.tracks.find(t => t.clips.some(c => c.id === clipId));
  P.selected = () => P.findClip(P.selectedId);
  P.select = (id) => { P.selectedId = id; V.bus.emit('select', id); };

  P.duration = () => P.allClips().reduce((m, c) => Math.max(m, c.start + c.duration), 0);

  /* Порядок отображения дорожек в таймлайне (сверху вниз) */
  P.displayTracks = () => {
    const t = P.state.tracks;
    const by = (k) => t.filter(x => x.kind === k);
    return [...by('text').reverse(), ...by('overlay').reverse(), ...by('main'), ...by('audio')];
  };
  /* Порядок отрисовки (снизу вверх) */
  P.renderTracks = () => {
    const t = P.state.tracks;
    const by = (k) => t.filter(x => x.kind === k);
    return [...by('main'), ...by('overlay'), ...by('text')];
  };

  P.kindAccepts = (kind, clipType) => {
    if (kind === 'main' || kind === 'overlay') return clipType === 'video' || clipType === 'image';
    if (kind === 'text') return clipType === 'text';
    if (kind === 'audio') return clipType === 'audio';
    return false;
  };

  P.addTrack = (kind) => {
    const t = newTrack(kind);
    P.state.tracks.push(t);
    return t;
  };

  /* --- создание клипов --- */
  const baseClip = (type, extra) => Object.assign({
    id: V.uid('clip'),
    type,
    mediaId: null,
    start: 0,
    duration: 3,
    in: 0,
    speed: 1,
    volume: 100,
    fadeInAudio: 0,
    fadeOutAudio: 0,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 100,
    flipH: false, flipV: false,
    fit: 'contain',
    filter: 'none',
    adjust: { ...V.DEFAULT_ADJUST },
    animIn: 'none', animInDur: 0.5,
    animOut: 'none', animOutDur: 0.5,
    blend: 'source-over',
  }, extra);

  const trackEnd = (track) => track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);

  const isFree = (track, start, dur, ignoreId) =>
    !track.clips.some(c => c.id !== ignoreId && start < c.start + c.duration - 1e-6 && start + dur > c.start + 1e-6);

  /* Найти дорожку данного вида со свободным местом, иначе создать */
  const freeTrack = (kind, start, dur) => {
    const t = P.state.tracks.find(t => t.kind === kind && isFree(t, start, dur));
    return t || P.addTrack(kind);
  };

  P.addMediaClip = (media, opts = {}) => P.mutate(() => {
    const type = media.type;
    let dur = type === 'image' ? 4 : Math.max(V.MIN_CLIP, media.duration || 4);
    const clip = baseClip(type, { mediaId: media.id, duration: dur, name: media.name });
    let track;
    if (type === 'audio') {
      clip.start = opts.at ?? V.engine.time;
      track = freeTrack('audio', clip.start, dur);
    } else if (opts.overlay) {
      clip.start = opts.at ?? V.engine.time;
      track = freeTrack('overlay', clip.start, dur);
    } else {
      track = P.state.tracks.find(t => t.kind === 'main') || P.addTrack('main');
      clip.start = trackEnd(track);
    }
    track.clips.push(clip);
    sortTrack(track);
    P.selectedId = clip.id;
    return clip;
  });

  P.addTextClip = (preset = {}, content) => P.mutate(() => {
    const text = { ...V.TEXT_DEFAULT, ...(preset.t || {}) };
    if (content) text.content = content;
    const clip = baseClip('text', {
      text,
      duration: 3,
      start: V.engine.time,
      y: preset.y ?? 0,
      name: content || text.content,
      animIn: preset.sticker ? 'pop' : 'fade',
      animOut: 'fade',
    });
    if (preset.sticker) { text.size = 220; text.bold = false; }
    const track = freeTrack('text', clip.start, clip.duration);
    track.clips.push(clip);
    sortTrack(track);
    P.selectedId = clip.id;
    return clip;
  });

  const sortTrack = (t) => t.clips.sort((a, b) => a.start - b.start);
  P.sortTrack = sortTrack;

  /* Основная дорожка «магнитная»: клипы идут встык, без пустот */
  const compactMain = () => {
    P.state.tracks.filter(t => t.kind === 'main').forEach(t => {
      sortTrack(t);
      let pos = 0;
      t.clips.forEach(c => { c.start = pos; pos += c.duration; });
    });
  };
  P.compactMain = compactMain;

  /* Максимальная длительность клипа с учётом исходника */
  P.maxDuration = (clip) => {
    if (clip.type === 'video' || clip.type === 'audio') {
      const m = V.media.get(clip.mediaId);
      if (m && m.duration) return Math.max(V.MIN_CLIP, (m.duration - clip.in) / clip.speed);
    }
    return Infinity;
  };

  /* --- операции --- */
  P.split = (clipId, t) => {
    const c = P.findClip(clipId);
    if (!c) return false;
    if (t <= c.start + V.MIN_CLIP || t >= c.start + c.duration - V.MIN_CLIP) return false;
    P.mutate(() => {
      const track = P.trackOf(c.id);
      const left = t - c.start;
      const right = V.deepClone(c);
      right.id = V.uid('clip');
      right.start = t;
      right.duration = c.duration - left;
      right.in = c.in + left * c.speed;
      right.animIn = 'none';
      right.fadeInAudio = 0;
      c.duration = left;
      c.animOut = 'none';
      c.fadeOutAudio = 0;
      track.clips.push(right);
      sortTrack(track);
    });
    return true;
  };

  /* Разрезать выбранный клип, а если не выбран — все клипы под плейхедом */
  P.splitAtPlayhead = () => {
    const t = V.engine.time;
    const sel = P.selected();
    if (sel && t > sel.start && t < sel.start + sel.duration) {
      if (!P.split(sel.id, t)) V.toast('Слишком близко к краю клипа');
      return;
    }
    const under = P.allClips().filter(c => t > c.start + V.MIN_CLIP && t < c.start + c.duration - V.MIN_CLIP);
    if (!under.length) return V.toast('Под плейхедом нет клипов');
    P.checkpoint();
    const past = P.past.length;
    under.forEach(c => { P.split(c.id, t); });
    // объединяем несколько шагов истории в один
    P.past.length = past;
    P.changed();
  };

  P.remove = (clipId) => {
    const track = P.trackOf(clipId);
    if (!track) return;
    P.mutate(() => {
      const idx = track.clips.findIndex(c => c.id === clipId);
      const [c] = track.clips.splice(idx, 1);
      if (track.kind === 'main') compactMain();
      cleanupTracks();
      if (P.selectedId === clipId) P.selectedId = null;
    });
  };

  P.duplicate = (clipId) => {
    const c = P.findClip(clipId);
    if (!c) return;
    P.mutate(() => {
      const track = P.trackOf(clipId);
      const d = V.deepClone(c);
      d.id = V.uid('clip');
      d.start = c.start + c.duration;
      if (track.kind === 'main') {
        // вставка сразу после, остальные сдвигаются вправо
        track.clips.forEach(o => { if (o.start >= d.start - 1e-6) o.start += d.duration; });
        track.clips.push(d);
        compactMain();
      } else {
        const t = isFree(track, d.start, d.duration) ? track : freeTrack(track.kind, d.start, d.duration);
        t.clips.push(d);
        sortTrack(t);
      }
      P.selectedId = d.id;
    });
  };

  /* Перемещение: возвращает фактический старт с учётом занятости */
  P.placeClip = (clip, track, start) => {
    start = Math.max(0, start);
    if (isFree(track, start, clip.duration, clip.id)) return start;
    // ищем ближайшее свободное место справа или слева
    const others = track.clips.filter(c => c.id !== clip.id).sort((a, b) => a.start - b.start);
    const candidates = [0];
    others.forEach(o => { candidates.push(o.start + o.duration); candidates.push(o.start - clip.duration); });
    let best = null, bestD = Infinity;
    for (const s of candidates) {
      if (s < 0) continue;
      if (!isFree(track, s, clip.duration, clip.id)) continue;
      const d = Math.abs(s - start);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best ?? trackEnd(track);
  };

  P.moveClipToTrack = (clip, toTrack) => {
    const from = P.trackOf(clip.id);
    if (!from || from === toTrack) return;
    from.clips.splice(from.clips.indexOf(clip), 1);
    toTrack.clips.push(clip);
  };

  /* Удаляем пустые дорожки, кроме первой основной и одной аудио */
  const cleanupTracks = () => {
    const keep = new Set();
    const firstMain = P.state.tracks.find(t => t.kind === 'main');
    const firstAudio = P.state.tracks.find(t => t.kind === 'audio');
    if (firstMain) keep.add(firstMain.id);
    if (firstAudio) keep.add(firstAudio.id);
    P.state.tracks = P.state.tracks.filter(t => t.clips.length || keep.has(t.id));
  };
  P.cleanupTracks = cleanupTracks;

  /* Удалить все клипы, использующие медиа */
  P.removeMedia = (mediaId) => {
    const used = P.allClips().some(c => c.mediaId === mediaId);
    if (used) P.mutate(() => {
      P.state.tracks.forEach(t => { t.clips = t.clips.filter(c => c.mediaId !== mediaId); });
      cleanupTracks();
      if (!P.findClip(P.selectedId)) P.selectedId = null;
    });
  };

  return P;
})();
