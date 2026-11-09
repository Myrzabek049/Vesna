/* Vesna — движок: часы воспроизведения, синхронизация медиа, рендер кадра, аудиограф */
'use strict';

V.engine = (() => {
  const E = {
    time: 0,
    playing: false,
    dirty: true,
    boxes: [],          // области клипов на холсте для выбора мышью
    pool: new Map(),    // clipId -> { el, gain, mediaId }
    onEnded: null,
    exporting: false,
    previewBase: 720,
  };

  let canvas, ctx, lastTs = 0, stallSince = 0;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';

  /* ---------- Аудио ---------- */
  E.ac = null; E.master = null; E.streamDest = null;
  E.ensureAudio = () => {
    if (E.ac) { if (E.ac.state === 'suspended') E.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    E.ac = new AC();
    E.master = E.ac.createGain();
    E.monitor = E.ac.createGain();   // выход на динамики (глушится при экспорте)
    E.master.connect(E.monitor);
    E.monitor.connect(E.ac.destination);
    E.streamDest = E.ac.createMediaStreamDestination();
    E.master.connect(E.streamDest);
    E.pool.forEach(connectEntry);
  };
  const connectEntry = (entry) => {
    if (!E.ac || entry.gain) return;
    try {
      const src = E.ac.createMediaElementSource(entry.el);
      entry.gain = E.ac.createGain();
      src.connect(entry.gain);
      entry.gain.connect(E.master);
    } catch (e) { console.warn('audio connect', e); }
  };

  /* ---------- Пул медиаэлементов (по одному на клип) ---------- */
  const ensureEl = (clip) => {
    let entry = E.pool.get(clip.id);
    if (entry && entry.mediaId === clip.mediaId) return entry;
    const media = V.media.get(clip.mediaId);
    if (!media) return null;
    const el = document.createElement(clip.type === 'audio' ? 'audio' : 'video');
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.crossOrigin = 'anonymous';
    el.src = media.url;
    el.addEventListener('seeked', () => { E.dirty = true; });
    el.addEventListener('loadeddata', () => { E.dirty = true; });
    holder.append(el);
    entry = { el, gain: null, mediaId: clip.mediaId, wantTime: -1 };
    E.pool.set(clip.id, entry);
    connectEntry(entry);
    return entry;
  };
  const dropEl = (id) => {
    const e = E.pool.get(id);
    if (!e) return;
    e.el.pause();
    e.el.removeAttribute('src');
    e.el.load();
    e.el.remove();
    try { e.gain && e.gain.disconnect(); } catch (_) {}
    E.pool.delete(id);
  };
  E.prune = () => {
    const ids = new Set(V.project.allClips().map(c => c.id));
    [...E.pool.keys()].forEach(id => { if (!ids.has(id)) dropEl(id); });
  };

  /* ---------- Управление воспроизведением ---------- */
  E.duration = () => V.project.duration();

  E.play = () => {
    E.ensureAudio();
    if (E.time >= E.duration() - 0.02) E.time = 0;
    if (E.duration() <= 0) return V.toast('Добавьте медиа на таймлайн');
    E.playing = true;
    lastTs = performance.now();
    V.bus.emit('play', true);
  };
  E.pause = () => {
    E.playing = false;
    E.pool.forEach(e => e.el.pause());
    E.dirty = true;
    V.bus.emit('play', false);
  };
  E.toggle = () => (E.playing ? E.pause() : E.play());
  E.seek = (t) => {
    E.time = V.clamp(t, 0, Math.max(0, E.duration()));
    E.dirty = true;
    if (E.playing) {
      // при перемотке во время воспроизведения заставляем пересинхронизироваться
      E.pool.forEach(e => e.el.pause());
    }
    V.bus.emit('time', E.time);
  };

  /* ---------- Синхронизация медиа с часами ---------- */
  const sync = () => {
    const t = E.time;
    let stalled = false;
    for (const track of V.project.state.tracks) {
      for (const clip of track.clips) {
        if (clip.type !== 'video' && clip.type !== 'audio') continue;
        const end = clip.start + clip.duration;
        const active = t >= clip.start && t < end;
        const soon = E.playing && !active && clip.start > t && clip.start - t < 1.2;
        if (!active && !soon) {
          const ex = E.pool.get(clip.id);
          if (ex && !ex.el.paused) ex.el.pause();
          continue;
        }
        const entry = ensureEl(clip);
        if (!entry) continue;
        const el = entry.el;
        const srcT = clip.in + Math.max(0, t - clip.start) * clip.speed;

        // громкость и затухания
        let vol = track.muted ? 0 : clip.volume / 100;
        const local = t - clip.start;
        if (clip.fadeInAudio > 0 && local < clip.fadeInAudio) vol *= local / clip.fadeInAudio;
        if (clip.fadeOutAudio > 0 && end - t < clip.fadeOutAudio) vol *= Math.max(0, (end - t) / clip.fadeOutAudio);
        if (entry.gain) { entry.gain.gain.value = vol; el.volume = 1; }
        else el.volume = V.clamp(vol, 0, 1);

        if (!active) { // предзагрузка следующего клипа
          if (Math.abs(el.currentTime - clip.in) > 0.05 && !el.seeking) el.currentTime = clip.in;
          continue;
        }

        if (el.playbackRate !== clip.speed) { el.playbackRate = clip.speed; }

        if (E.playing) {
          if (el.paused) {
            if (Math.abs(el.currentTime - srcT) > 0.05) el.currentTime = srcT;
            const p = el.play();
            if (p && p.catch) p.catch(() => {});
          } else if (Math.abs(el.currentTime - srcT) > 0.3 && !el.seeking) {
            el.currentTime = srcT;
          }
          if (clip.type === 'video' && (el.seeking || el.readyState < 2)) stalled = true;
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - srcT) > 0.02 && !el.seeking) el.currentTime = srcT;
        }
      }
    }
    return stalled;
  };

  /* ---------- Рендер ---------- */
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  const animState = (clip, local) => {
    const s = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0 };
    const apply = (kind, p, dirOut) => {
      const e = easeOut(p), r = 1 - e;
      switch (kind) {
        case 'fade': s.alpha *= e; break;
        case 'zoom': s.scale *= dirOut ? 0.6 + 0.4 * e : 0.6 + 0.4 * e; s.alpha *= e; break;
        case 'pop': s.scale *= Math.max(0.01, easeBack(p)); s.alpha *= Math.min(1, p * 3); break;
        case 'slide-left': s.dx += -r; break;
        case 'slide-right': s.dx += r; break;
        case 'slide-up': s.dy += r; break;
        case 'slide-down': s.dy += r; break;
        case 'spin': s.rot += (dirOut ? 180 : -180) * r; s.scale *= Math.max(0.01, e); break;
        case 'blur': s.blur += 24 * r; s.alpha *= 0.3 + 0.7 * e; break;
      }
    };
    if (clip.animIn !== 'none' && clip.animInDur > 0 && local < clip.animInDur) apply(clip.animIn, V.clamp(local / clip.animInDur, 0, 1), false);
    const left = clip.duration - local;
    if (clip.animOut !== 'none' && clip.animOutDur > 0 && left < clip.animOutDur) apply(clip.animOut, V.clamp(left / clip.animOutDur, 0, 1), true);
    return s;
  };

  const resolveAdjust = (clip) => {
    const pre = (V.FILTERS.find(f => f.id === clip.filter) || V.FILTERS[0]).adj;
    const a = clip.adjust || V.DEFAULT_ADJUST;
    const d = V.DEFAULT_ADJUST;
    return {
      brightness: (pre.brightness ?? 100) * a.brightness / 100,
      contrast: (pre.contrast ?? 100) * a.contrast / 100,
      saturate: (pre.saturate ?? 100) * a.saturate / 100,
      hue: (pre.hue ?? 0) + a.hue,
      blur: (pre.blur ?? 0) + a.blur,
      grayscale: V.clamp((pre.grayscale ?? 0) + a.grayscale, 0, 100),
      sepia: V.clamp((pre.sepia ?? 0) + a.sepia, 0, 100),
      invert: V.clamp((pre.invert ?? 0) + (a.invert ?? d.invert), 0, 100),
      vignette: V.clamp((pre.vignette ?? 0) + (a.vignette ?? 0), 0, 100),
    };
  };

  const filterString = (adj, extraBlur, k) => {
    const parts = [];
    if (adj.brightness !== 100) parts.push(`brightness(${adj.brightness}%)`);
    if (adj.contrast !== 100) parts.push(`contrast(${adj.contrast}%)`);
    if (adj.saturate !== 100) parts.push(`saturate(${adj.saturate}%)`);
    if (adj.hue) parts.push(`hue-rotate(${adj.hue}deg)`);
    if (adj.grayscale) parts.push(`grayscale(${adj.grayscale}%)`);
    if (adj.sepia) parts.push(`sepia(${adj.sepia}%)`);
    if (adj.invert) parts.push(`invert(${adj.invert}%)`);
    const b = (adj.blur + extraBlur) * k;
    if (b > 0.05) parts.push(`blur(${b.toFixed(2)}px)`);
    return parts.length ? parts.join(' ') : 'none';
  };

  const drawVisual = (clip, src, sw, sh, local) => {
    const W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080;
    if (!sw || !sh) return;
    const s = clip.fit === 'cover' ? Math.max(W / sw, H / sh) : clip.fit === 'stretch' ? 1 : Math.min(W / sw, H / sh);
    const bw = clip.fit === 'stretch' ? W : sw * s;
    const bh = clip.fit === 'stretch' ? H : sh * s;
    const a = animState(clip, local);
    const adj = resolveAdjust(clip);
    const cx = W / 2 + (clip.x + a.dx) * W, cy = H / 2 + (clip.y + a.dy) * H;
    const sc = clip.scale * a.scale, rot = (clip.rotation + a.rot) * Math.PI / 180;

    ctx.save();
    ctx.globalAlpha = V.clamp(clip.opacity / 100 * a.alpha, 0, 1);
    ctx.globalCompositeOperation = clip.blend || 'source-over';
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(sc * (clip.flipH ? -1 : 1), sc * (clip.flipV ? -1 : 1));
    ctx.filter = filterString(adj, a.blur, k);
    ctx.drawImage(src, -bw / 2, -bh / 2, bw, bh);
    ctx.filter = 'none';
    if (adj.vignette > 0) {
      const g = ctx.createRadialGradient(0, 0, Math.min(bw, bh) * 0.25, 0, 0, Math.hypot(bw, bh) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${adj.vignette / 100})`);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = g;
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    }
    ctx.restore();
    E.boxes.push({ id: clip.id, cx, cy, hw: bw * Math.abs(sc) / 2, hh: bh * Math.abs(sc) / 2, rot });
  };

  const hexA = (hex, a) => {
    const n = parseInt((hex || '#000').slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  const drawText = (clip, local) => {
    const W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080;
    const t = clip.text;
    const a = animState(clip, local);
    const size = t.size * k;
    const font = `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${size}px ${t.font}`;
    ctx.save();
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (t.letterSpacing * k) + 'px';
    const lines = String(t.content || ' ').split('\n');
    const lh = size * (t.lineHeight || 1.2);
    const widths = lines.map(l => ctx.measureText(l || ' ').width);
    const tw = Math.max(...widths), th = lh * lines.length;
    const pad = size * 0.3;
    const cx = W / 2 + (clip.x + a.dx) * W, cy = H / 2 + (clip.y + a.dy) * H;
    const sc = clip.scale * a.scale, rot = (clip.rotation + a.rot) * Math.PI / 180;

    ctx.globalAlpha = V.clamp(clip.opacity / 100 * a.alpha, 0, 1);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(sc * (clip.flipH ? -1 : 1), sc * (clip.flipV ? -1 : 1));
    if (a.blur > 0.05) ctx.filter = `blur(${(a.blur * k).toFixed(2)}px)`;

    if (t.bgOpacity > 0) {
      ctx.fillStyle = hexA(t.bgColor, t.bgOpacity / 100);
      const rx = -tw / 2 - pad, ry = -th / 2 - pad * 0.6, rw = tw + pad * 2, rh = th + pad * 1.2;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, size * 0.2); ctx.fill(); }
      else ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = t.align;
    const ax = t.align === 'left' ? -tw / 2 : t.align === 'right' ? tw / 2 : 0;
    lines.forEach((line, i) => {
      const y = -th / 2 + lh * (i + 0.5);
      if (t.strokeWidth > 0) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = t.strokeWidth * k * 2;
        ctx.strokeStyle = t.strokeColor;
        ctx.strokeText(line, ax, y);
      }
      if (t.shadow > 0) { ctx.shadowColor = t.color; ctx.shadowBlur = t.shadow * k; }
      ctx.fillStyle = t.color;
      ctx.fillText(line, ax, y);
      if (t.shadow > 0) { ctx.shadowBlur = t.shadow * k * 2; ctx.fillText(line, ax, y); ctx.shadowBlur = 0; }
    });
    ctx.restore();
    E.boxes.push({ id: clip.id, cx, cy, hw: (tw / 2 + pad) * Math.abs(sc), hh: (th / 2 + pad * 0.6) * Math.abs(sc), rot });
  };

  E.render = () => {
    const W = canvas.width, H = canvas.height;
    const t = E.time;
    E.boxes = [];
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = V.project.state.background || '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    for (const track of V.project.renderTracks()) {
      if (track.hidden) continue;
      for (const clip of track.clips) {
        if (t < clip.start || t >= clip.start + clip.duration) continue;
        const local = t - clip.start;
        if (clip.type === 'video') {
          const entry = E.pool.get(clip.id) || ensureEl(clip);
          if (entry && entry.el.readyState >= 2) drawVisual(clip, entry.el, entry.el.videoWidth, entry.el.videoHeight, local);
        } else if (clip.type === 'image') {
          const m = V.media.get(clip.mediaId);
          if (m && m.el) drawVisual(clip, m.el, m.width, m.height, local);
        } else if (clip.type === 'text') {
          drawText(clip, local);
        }
      }
    }
    V.bus.emit('rendered');
  };

  /* ---------- Главный цикл ---------- */
  const loop = (ts) => {
    requestAnimationFrame(loop);
    E.step(ts);
  };
  E.step = (ts = performance.now()) => {
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    const stalled = sync();
    if (E.playing) {
      // ждём буферизацию видео (не дольше 3 секунд), чтобы не было рывков при экспорте
      if (stalled && E.time > 0) {
        if (!stallSince) stallSince = ts;
        if (ts - stallSince > 3000) stallSince = 0;
      } else stallSince = 0;
      if (!stallSince) E.time += dt;
      const D = E.duration();
      if (E.time >= D) {
        E.time = D;
        E.pause();
        if (E.onEnded) { const cb = E.onEnded; E.onEnded = null; cb(); }
      }
      E.render();
      V.bus.emit('time', E.time);
    } else if (E.dirty) {
      E.dirty = false;
      E.render();
    }
  };

  E.setResolution = (base) => {
    const { w, h } = V.project.size(base);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    E.dirty = true;
    V.bus.emit('resize');
  };

  E.init = (cv) => {
    canvas = cv;
    ctx = canvas.getContext('2d', { alpha: false });
    E.canvas = canvas;
    document.body.append(holder);
    E.setResolution(E.previewBase);
    V.bus.on('project', () => { E.prune(); E.dirty = true; });
    lastTs = performance.now();
    requestAnimationFrame(loop);
  };

  return E;
})();
