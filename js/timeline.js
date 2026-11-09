/* Vesna — таймлайн: дорожки, клипы, перетаскивание, обрезка, плейхед */
'use strict';

V.timeline = (() => {
  const T = { pps: 80, snap: true };
  const HEIGHTS = { text: 36, overlay: 50, main: 66, audio: 46 };
  const LABELS = { text: 'Текст', overlay: 'Оверлей', main: 'Основная', audio: 'Аудио' };
  const ICONS = { text: 'T', overlay: '⧉', main: '▣', audio: '♪' };
  const PAD = 24; // отступ слева в пикселях

  let heads, scroll, content, ruler, tracksEl, playhead;

  const x2t = (x) => (x - PAD) / T.pps;
  const t2x = (t) => PAD + t * T.pps;

  /* ---------- Отрисовка ---------- */
  T.render = () => {
    const P = V.project;
    const tracks = P.displayTracks();
    const dur = P.duration();
    const width = Math.max(scroll.clientWidth, t2x(dur) + 400);
    content.style.width = width + 'px';

    heads.innerHTML = '';
    heads.append(V.el('div', { class: 'head-ruler' }));
    tracksEl.innerHTML = '';

    for (const tr of tracks) {
      const h = HEIGHTS[tr.kind];
      const head = V.el('div', { class: 'track-head ' + tr.kind, style: { height: h + 'px' } },
        V.el('span', { class: 'th-icon' }, ICONS[tr.kind]),
        V.el('span', { class: 'th-label' }, LABELS[tr.kind]),
      );
      if (tr.kind !== 'text') {
        head.append(V.el('button', {
          class: 'th-btn' + (tr.muted ? ' on' : ''), title: tr.muted ? 'Включить звук' : 'Выключить звук',
          onclick: () => P.mutate(() => { tr.muted = !tr.muted; }),
        }, tr.muted ? '🔇' : '🔊'));
      }
      if (tr.kind !== 'audio') {
        head.append(V.el('button', {
          class: 'th-btn' + (tr.hidden ? ' on' : ''), title: tr.hidden ? 'Показать' : 'Скрыть',
          onclick: () => P.mutate(() => { tr.hidden = !tr.hidden; }),
        }, tr.hidden ? '◌' : '◉'));
      }
      heads.append(head);

      const row = V.el('div', { class: 'track-row ' + tr.kind + (tr.hidden ? ' hidden-track' : ''), style: { height: h + 'px' }, 'data-track': tr.id });
      for (const c of tr.clips) row.append(clipEl(c, tr));
      // кнопки переходов между соседними клипами основной дорожки
      if (tr.kind === 'main') tr.clips.forEach((c, i) => {
        if (i === 0) return;
        const on = c.trans && c.trans.type && c.trans.type !== 'none';
        const b = V.el('button', { class: 'trans-btn' + (on ? ' on' : ''), title: on ? 'Переход: ' + (V.TRANSITIONS.find(t => t.id === c.trans.type) || {}).name : 'Добавить переход', 'data-clip': c.id,
          style: { left: (t2x(c.start) - 11) + 'px' } }, on ? '⧓' : '+');
        row.append(b);
      });
      tracksEl.append(row);
    }
    drawRuler(width);
    T.updatePlayhead();
  };

  const clipEl = (c, tr) => {
    const m = c.mediaId ? V.media.get(c.mediaId) : null;
    const sel = V.project.selectedId === c.id;
    const style = { left: t2x(c.start) + 'px', width: Math.max(4, c.duration * T.pps) + 'px' };
    const el = V.el('div', { class: `clip ${c.type}${sel ? ' selected' : ''}`, 'data-id': c.id, style });
    if (m && m.thumb && (c.type === 'video' || c.type === 'image')) {
      el.style.backgroundImage = `url(${m.thumb})`;
    }
    if (m && m.wave && c.type === 'audio') {
      // волна показывает только используемую часть исходника
      const full = (m.duration / c.speed) * T.pps;
      el.style.backgroundImage = `url(${m.wave})`;
      el.style.backgroundSize = `${full}px 100%`;
      el.style.backgroundPosition = `${-(c.in / c.speed) * T.pps}px 0`;
    }
    let label = c.type === 'text' ? (c.text.content || '').replace(/\n/g, ' ') : (c.name || m?.name || '');
    const badges = [];
    if (c.speed !== 1) badges.push(c.speed + '×');
    if (c.filter !== 'none') badges.push('🎨');
    if ((c.type === 'video' || c.type === 'audio') && c.volume === 0) badges.push('🔇');
    if (c.animIn !== 'none' || c.animOut !== 'none') badges.push('✦');
    el.append(
      V.el('div', { class: 'clip-label' }, V.el('span', {}, label), badges.length ? V.el('span', { class: 'clip-badges' }, badges.join(' ')) : null),
      V.el('div', { class: 'clip-dur' }, V.fmtTime(c.duration)),
      V.el('div', { class: 'handle l', 'data-h': 'l' }),
      V.el('div', { class: 'handle r', 'data-h': 'r' }),
    );
    if (c.type === 'video' && m && !m.thumb) el.classList.add('nothumb');
    if (c.kf && c.kf.length) c.kf.forEach(k => el.append(V.el('span', { class: 'kf-dot', style: { left: (k.t * T.pps - 4) + 'px' } })));
    return el;
  };

  const drawRuler = (width) => {
    ruler.innerHTML = '';
    // шаг делений в зависимости от масштаба
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const major = steps.find(s => s * T.pps >= 70) || 600;
    const minor = major / 5;
    const end = x2t(width);
    for (let i = 0; i * minor <= end; i++) {
      const t = i * minor;
      const isMajor = i % 5 === 0;
      const tick = V.el('div', { class: 'tick' + (isMajor ? ' major' : ''), style: { left: t2x(t) + 'px' } });
      if (isMajor) tick.append(V.el('span', {}, major < 1 ? V.fmtTime(t) : V.fmtTime(t, false)));
      ruler.append(tick);
    }
  };

  T.updatePlayhead = () => {
    playhead.style.transform = `translateX(${t2x(V.engine.time)}px)`;
    document.getElementById('timeCurrent').textContent = V.fmtTime(V.engine.time);
    document.getElementById('timeTotal').textContent = V.fmtTime(V.project.duration());
    // автопрокрутка при воспроизведении
    if (V.engine.playing) {
      const x = t2x(V.engine.time);
      if (x > scroll.scrollLeft + scroll.clientWidth - 60 || x < scroll.scrollLeft) scroll.scrollLeft = x - 80;
    }
  };

  /* ---------- Привязка ---------- */
  const snapPoints = (excludeId) => {
    const pts = [0, V.engine.time];
    V.project.allClips().forEach(c => { if (c.id !== excludeId) { pts.push(c.start, c.start + c.duration); } });
    return pts;
  };
  const snapT = (t, pts) => {
    if (!T.snap) return t;
    const th = 8 / T.pps;
    let best = t, bd = th;
    for (const p of pts) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best;
  };

  /* ---------- Взаимодействие ---------- */
  const contentX = (e) => e.clientX - content.getBoundingClientRect().left;

  const startScrub = (e) => {
    e.preventDefault();
    const move = (ev) => { if (!T.pinching) V.engine.seek(x2t(contentX(ev))); };
    move(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const rowAt = (clientY) => {
    for (const row of tracksEl.children) {
      const r = row.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return row;
    }
    return null;
  };

  const startClipDrag = (e, clipDiv) => {
    const P = V.project;
    const id = clipDiv.dataset.id;
    const clip = P.findClip(id);
    if (!clip) return;
    e.preventDefault();
    e.stopPropagation();
    if (P.selectedId !== id) { P.select(id); T.render(); }
    const handle = e.target.dataset.h;
    const orig = { start: clip.start, duration: clip.duration, in: clip.in };
    const origTrack = P.trackOf(id);
    const x0 = e.clientX;
    let moved = false;
    const pts = snapPoints(id);

    const move = (ev) => {
      if (T.pinching) return;
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3 && !handle && Math.abs(ev.clientY - e.clientY) < 3) return;
      if (!moved) { moved = true; P.checkpoint(); }
      const dt = dx / T.pps;
      const track = P.trackOf(id);
      const others = track.clips.filter(c => c.id !== id);
      if (handle === 'l') {
        // обрезка слева
        const prevEnd = track.kind === 'main' ? -Infinity : Math.max(0, ...others.filter(o => o.start + o.duration <= orig.start + 1e-6).map(o => o.start + o.duration));
        let ns = snapT(orig.start + dt, pts);
        let d = ns - orig.start;
        const minD = (clip.type === 'video' || clip.type === 'audio') ? -orig.in / clip.speed : -Infinity;
        d = V.clamp(d, Math.max(minD, (track.kind === 'main' ? -Infinity : prevEnd - orig.start), -orig.start), orig.duration - V.MIN_CLIP);
        if (track.kind === 'main') {
          // на основной дорожке старт не двигаем — меняется только точка входа
          clip.in = orig.in + d * clip.speed;
          clip.duration = orig.duration - d;
          clip.start = orig.start;
        } else {
          clip.start = orig.start + d;
          clip.in = orig.in + d * clip.speed;
          clip.duration = orig.duration - d;
        }
        if (clip.type === 'image' || clip.type === 'text') clip.in = 0;
      } else if (handle === 'r') {
        const nextStart = track.kind === 'main' ? Infinity : Math.min(Infinity, ...others.filter(o => o.start >= orig.start + orig.duration - 1e-6).map(o => o.start));
        let ne = snapT(orig.start + orig.duration + dt, pts);
        let nd = V.clamp(ne - orig.start, V.MIN_CLIP, Math.min(P.maxDuration(clip), nextStart - orig.start));
        clip.duration = nd;
      } else {
        // перемещение, возможно на другую дорожку
        let ns = Math.max(0, orig.start + dt);
        const s1 = snapT(ns, pts), s2 = snapT(ns + clip.duration, pts) - clip.duration;
        ns = Math.abs(s1 - ns) <= Math.abs(s2 - ns) ? s1 : s2;
        clip.start = Math.max(0, ns);
        const row = rowAt(ev.clientY);
        if (row) {
          const target = P.state.tracks.find(t => t.id === row.dataset.track);
          if (target && target !== track && P.kindAccepts(target.kind, clip.type)) P.moveClipToTrack(clip, target);
        } else if (clip.type !== 'audio' && clip.type !== 'text') {
          // выше всех дорожек — создаём новую дорожку оверлея
          const top = tracksEl.getBoundingClientRect().top;
          if (ev.clientY < top && track.kind !== 'overlay') { const nt = P.addTrack('overlay'); P.moveClipToTrack(clip, nt); }
        }
      }
      V.engine.dirty = true;
      T.render();
      if (handle) V.bus.emit('trim', clip);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      const track = P.trackOf(id);
      if (track.kind === 'main') {
        if (!handle) {
          // переупорядочивание по центру клипа
          const center = clip.start + clip.duration / 2;
          const others = track.clips.filter(c => c.id !== id);
          let idx = others.findIndex(o => center < o.start + o.duration / 2);
          if (idx < 0) idx = others.length;
          others.splice(idx, 0, clip);
          track.clips = others;
          let pos = 0;
          track.clips.forEach(c => { c.start = pos; pos += c.duration; });
        } else P.compactMain();
      } else {
        clip.start = P.placeClip(clip, track, clip.start);
        P.sortTrack(track);
      }
      if (origTrack.kind === 'main' && origTrack !== track) P.compactMain();
      P.cleanupTracks();
      P.changed();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* Перетаскивание медиа из библиотеки на таймлайн */
  const onDrop = (e) => {
    const mid = e.dataTransfer.getData('text/vesna-media');
    if (!mid) return;
    e.preventDefault();
    e.stopPropagation();
    const media = V.media.get(mid);
    if (!media) return;
    const P = V.project;
    const t = Math.max(0, x2t(contentX(e)));
    const row = rowAt(e.clientY);
    const track = row && P.state.tracks.find(tr => tr.id === row.dataset.track);
    if (media.type === 'audio') { V.project.addMediaClip(media, { at: t }); return; }
    if (track && track.kind === 'main') {
      const clip = V.project.addMediaClip(media);
      // вставляем в позицию курсора
      const tr = P.trackOf(clip.id);
      const others = tr.clips.filter(c => c.id !== clip.id);
      let idx = others.findIndex(o => t < o.start + o.duration / 2);
      if (idx < 0) idx = others.length;
      others.splice(idx, 0, clip);
      tr.clips = others;
      P.compactMain();
      P.changed();
    } else {
      V.project.addMediaClip(media, { overlay: true, at: t });
    }
  };

  T.zoom = (pps, anchorT = V.engine.time) => {
    const before = t2x(anchorT) - scroll.scrollLeft;
    T.pps = V.clamp(pps, 10, 400);
    document.getElementById('zoomRange').value = T.pps;
    T.render();
    scroll.scrollLeft = t2x(anchorT) - before;
  };

  T.fit = () => {
    const d = V.project.duration();
    if (d > 0) T.zoom((scroll.clientWidth - PAD - 60) / d, 0);
  };

  T.init = () => {
    heads = document.getElementById('trackHeads');
    scroll = document.getElementById('trackScroll');
    content = document.getElementById('trackContent');
    ruler = document.getElementById('ruler');
    tracksEl = document.getElementById('tracks');
    playhead = document.getElementById('playhead');

    ruler.addEventListener('pointerdown', startScrub);
    playhead.addEventListener('pointerdown', startScrub);
    tracksEl.addEventListener('pointerdown', (e) => {
      const tb = e.target.closest('.trans-btn');
      if (tb) { e.stopPropagation(); return; }
      const c = e.target.closest('.clip');
      if (c) return startClipDrag(e, c);
      V.project.select(null);
      T.render();
      startScrub(e);
    });
    tracksEl.addEventListener('click', (e) => {
      const tb = e.target.closest('.trans-btn');
      if (!tb) return;
      V.project.select(tb.dataset.clip);
      if (V.mobile.isMobile()) V.mobile.openInsp('Переход');
      else {
        V.inspector.render();
        const sec = [...document.querySelectorAll('.insp-section summary')].find(s => s.textContent.startsWith('Переход'));
        if (sec) sec.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    tracksEl.addEventListener('dblclick', (e) => {
      const c = e.target.closest('.clip');
      if (c) V.engine.seek(x2t(contentX(e)));
    });
    content.addEventListener('dragover', (e) => {
      if ([...e.dataTransfer.types].includes('text/vesna-media')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    });
    content.addEventListener('drop', onDrop);
    // синхронная вертикальная прокрутка заголовков
    scroll.addEventListener('scroll', () => { heads.scrollTop = scroll.scrollTop; });
    // Ctrl + колесо — масштаб
    scroll.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        T.zoom(T.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), x2t(contentX(e)));
      }
    }, { passive: false });
    document.getElementById('zoomRange').addEventListener('input', (e) => T.zoom(+e.target.value));
    document.getElementById('snapToggle').addEventListener('change', (e) => { T.snap = e.target.checked; });

    V.bus.on('project', T.render);
    V.bus.on('select', T.render);
    V.bus.on('time', T.updatePlayhead);
    window.addEventListener('resize', T.render);
    T.render();
  };

  return T;
})();
