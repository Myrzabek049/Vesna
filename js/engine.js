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

  /* ---------- Окна активности клипов (с учётом переходов) ---------- */
  // Переход хранится у клипа основной дорожки: clip.trans = { type, dur } — вход из предыдущего клипа.
  // На время перехода оба соседних клипа видны: предыдущий «доигрывает», следующий «заранее начинается».
  const transOf = (c) => (c && c.trans && c.trans.type && c.trans.type !== 'none' ? c.trans : null);
  const windowOf = (clip, track) => {
    let a = clip.start, b = clip.start + clip.duration;
    if (track && track.kind === 'main') {
      const tr = transOf(clip);
      if (tr) a -= tr.dur / 2;
      const i = track.clips.indexOf(clip);
      const nx = transOf(track.clips[i + 1]);
      if (nx) b += nx.dur / 2;
    }
    return [a, b];
  };
  E.windowOf = windowOf;

  /* Время в исходнике для локального времени клипа (может выходить за края при переходах) */
  const srcTime = (clip, local) => {
    const m = V.media.get(clip.mediaId);
    const max = m && m.duration ? m.duration - 0.04 : Infinity;
    return V.clamp(clip.in + local * clip.speed, 0, max);
  };

  /* ---------- Синхронизация медиа с часами ---------- */
  // tol — допустимое расхождение при паузе (при точном экспорте — полкадра)
  E.seekTolerance = 0.02;
  const sync = () => {
    const t = E.time;
    let stalled = false;
    for (const track of V.project.state.tracks) {
      for (const clip of track.clips) {
        if (clip.type !== 'video' && clip.type !== 'audio') continue;
        const [wa, wb] = windowOf(clip, track);
        const end = clip.start + clip.duration;
        const active = t >= wa && t < wb;
        const soon = E.playing && !active && wa > t && wa - t < 1.2;
        if (!active && !soon) {
          const ex = E.pool.get(clip.id);
          if (ex && !ex.el.paused) ex.el.pause();
          continue;
        }
        const entry = ensureEl(clip);
        if (!entry) continue;
        const el = entry.el;
        const local = t - clip.start;
        const srcT = srcTime(clip, local);

        // громкость и затухания (звук только внутри самого клипа)
        let vol = track.muted || local < 0 || t >= end ? 0 : clip.volume / 100;
        if (clip.fadeInAudio > 0 && local < clip.fadeInAudio) vol *= Math.max(0, local / clip.fadeInAudio);
        if (clip.fadeOutAudio > 0 && end - t < clip.fadeOutAudio) vol *= Math.max(0, (end - t) / clip.fadeOutAudio);
        if (E.voiceMute) vol = 0;
        if (entry.gain) { entry.gain.gain.value = vol; el.volume = 1; }
        else el.volume = V.clamp(vol, 0, 1);

        if (!active) { // предзагрузка следующего клипа
          const want = srcTime(clip, wa - clip.start);
          if (Math.abs(el.currentTime - want) > 0.05 && !el.seeking) el.currentTime = want;
          continue;
        }

        if (el.playbackRate !== clip.speed) { el.playbackRate = clip.speed; }
        const frozen = clip.type === 'video' && (local < 0 || local > clip.duration) && (srcT <= 0 || srcT >= (V.media.get(clip.mediaId)?.duration || 1e9) - 0.05);

        if (E.playing && !frozen) {
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
          if (Math.abs(el.currentTime - srcT) > E.seekTolerance && !el.seeking) el.currentTime = srcT;
        }
      }
    }
    return stalled;
  };
  E.sync = sync;

  /* Точный рендер кадра в момент t: ждём, пока все видео встанут на нужный кадр */
  E.renderAt = async (t, fps = 30) => {
    E.time = t;
    E.seekTolerance = 0.5 / fps;
    sync();
    const waits = [];
    for (const [id, entry] of E.pool) {
      const el = entry.el;
      if (el.tagName !== 'VIDEO') continue;
      if (el.seeking) waits.push(V.once(el, 'seeked', 5000).catch(() => {}));
      else if (el.readyState < 2 && el.src) waits.push(V.once(el, 'loadeddata', 5000).catch(() => {}));
    }
    if (waits.length) await Promise.all(waits);
    E.render();
  };

  /* ---------- Рендер ---------- */
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOut = (p) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const easeBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  /* Ключевые кадры: clip.kf = [{ t, x, y, scale, rotation, opacity }] (t — секунды от начала клипа) */
  const KF_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'];
  E.KF_PROPS = KF_PROPS;
  const transformAt = (clip, local) => {
    const kf = clip.kf;
    const base = { x: clip.x, y: clip.y, scale: clip.scale, rotation: clip.rotation, opacity: clip.opacity };
    if (!kf || !kf.length) return base;
    if (local <= kf[0].t) return { ...base, ...pick(kf[0]) };
    const last = kf[kf.length - 1];
    if (local >= last.t) return { ...base, ...pick(last) };
    for (let i = 0; i < kf.length - 1; i++) {
      const a = kf[i], b = kf[i + 1];
      if (local >= a.t && local <= b.t) {
        const p = easeInOut((local - a.t) / Math.max(1e-6, b.t - a.t));
        const o = {};
        KF_PROPS.forEach(k => { o[k] = (a[k] ?? base[k]) + ((b[k] ?? base[k]) - (a[k] ?? base[k])) * p; });
        return o;
      }
    }
    return base;
  };
  const pick = (k) => { const o = {}; KF_PROPS.forEach(p => { if (k[p] != null) o[p] = k[p]; }); return o; };
  E.transformAt = transformAt;

  const animState = (clip, local) => {
    const s = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0 };
    const apply = (kind, p, dirOut) => {
      const e = easeOut(p), r = 1 - e;
      switch (kind) {
        case 'fade': s.alpha *= e; break;
        case 'zoom': s.scale *= 0.6 + 0.4 * e; s.alpha *= e; break;
        case 'pop': s.scale *= Math.max(0.01, easeBack(p)); s.alpha *= Math.min(1, p * 3); break;
        case 'slide-left': s.dx += -r; break;
        case 'slide-right': s.dx += r; break;
        case 'slide-up': s.dy += r; break;
        case 'slide-down': s.dy += r; break;
        case 'spin': s.rot += (dirOut ? 180 : -180) * r; s.scale *= Math.max(0.01, e); break;
        case 'blur': s.blur += 24 * r; s.alpha *= 0.3 + 0.7 * e; break;
      }
    };
    const l = V.clamp(local, 0, clip.duration);
    if (clip.animIn !== 'none' && clip.animInDur > 0 && l < clip.animInDur) apply(clip.animIn, V.clamp(l / clip.animInDur, 0, 1), false);
    const left = clip.duration - l;
    if (clip.animOut !== 'none' && clip.animOutDur > 0 && left < clip.animOutDur) apply(clip.animOut, V.clamp(left / clip.animOutDur, 0, 1), true);
    return s;
  };

  /* Эффект перехода для клипа основной дорожки в момент t */
  const transFx = (clip, track, t) => {
    const fx = { alpha: 1, dx: 0, scale: 1, dark: 0, clipW: 1, hide: false };
    const i = track.clips.indexOf(clip);
    const own = transOf(clip), next = track.clips[i + 1], nt = transOf(next);
    let role = null, p = 0, type = null;
    if (own && t >= clip.start - own.dur / 2 && t < clip.start + own.dur / 2) { role = 'in'; p = (t - (clip.start - own.dur / 2)) / own.dur; type = own.type; }
    else if (nt && t >= next.start - nt.dur / 2 && t < next.start + nt.dur / 2) { role = 'out'; p = (t - (next.start - nt.dur / 2)) / nt.dur; type = nt.type; }
    if (!role) return fx;
    p = V.clamp(p, 0, 1);
    const e = easeInOut(p);
    switch (type) {
      case 'fade': if (role === 'in') fx.alpha = e; break;
      case 'black':
        if (role === 'out') { fx.hide = p >= 0.5; fx.dark = Math.min(1, p * 2); }
        else { fx.hide = p < 0.5; fx.dark = Math.min(1, (1 - p) * 2); }
        break;
      case 'white':
        if (role === 'out') { fx.hide = p >= 0.5; fx.light = Math.min(1, p * 2); }
        else { fx.hide = p < 0.5; fx.light = Math.min(1, (1 - p) * 2); }
        break;
      case 'wipe': if (role === 'in') fx.clipW = e; break;
      case 'slide': fx.dx = role === 'out' ? -e : 1 - e; break;
      case 'zoom':
        if (role === 'out') { fx.scale = 1 + 0.5 * e; fx.alpha = 1 - e; }
        else { fx.scale = 0.75 + 0.25 * e; fx.alpha = e; }
        break;
    }
    return fx;
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

  /* Хромакей: убираем выбранный цвет (по умолчанию зелёный) */
  const keyCanvas = document.createElement('canvas');
  const keyCtx = keyCanvas.getContext('2d', { willReadFrequently: true });
  const hexRgb = (hex) => { const n = parseInt((hex || '#00ff00').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const chromaKey = (src, sx, sy, sw, sh, ck) => {
    const maxW = E.exporting ? 1280 : 640;
    const k = Math.min(1, maxW / sw);
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    if (keyCanvas.width !== w || keyCanvas.height !== h) { keyCanvas.width = w; keyCanvas.height = h; }
    keyCtx.clearRect(0, 0, w, h);
    keyCtx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const img = keyCtx.getImageData(0, 0, w, h), d = img.data;
    const [kr, kg, kb] = hexRgb(ck.color);
    // сравнение в цветоразностном пространстве (Cb, Cr) — устойчиво к яркости
    const kcb = -0.169 * kr - 0.331 * kg + 0.5 * kb, kcr = 0.5 * kr - 0.419 * kg - 0.081 * kb;
    const sim = (ck.sim ?? 0.35) * 180, smooth = Math.max(1, (ck.smooth ?? 0.1) * 180);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const cb = -0.169 * r - 0.331 * g + 0.5 * b, cr = 0.5 * r - 0.419 * g - 0.081 * b;
      const dist = Math.hypot(cb - kcb, cr - kcr);
      if (dist < sim) d[i + 3] = 0;
      else if (dist < sim + smooth) {
        const a = (dist - sim) / smooth;
        d[i + 3] = d[i + 3] * a;
        // подавляем цветную кайму
        if (kg > kr && kg > kb && g > (r + b) / 2) d[i + 1] = (r + b) / 2 + (g - (r + b) / 2) * a;
      }
    }
    keyCtx.putImageData(img, 0, 0);
    return keyCanvas;
  };

  const drawVisual = (clip, src, sw, sh, local, fx) => {
    const W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080;
    if (!sw || !sh || (fx && fx.hide)) return;
    // кадрирование
    const cr = clip.crop || { l: 0, t: 0, r: 0, b: 0 };
    let sx = sw * (cr.l || 0), sy = sh * (cr.t || 0);
    let cw = Math.max(1, sw * (1 - (cr.l || 0) - (cr.r || 0))), ch = Math.max(1, sh * (1 - (cr.t || 0) - (cr.b || 0)));
    let source = src;
    if (clip.chroma && clip.chroma.on) { source = chromaKey(src, sx, sy, cw, ch, clip.chroma); sx = 0; sy = 0; cw = source.width; ch = source.height; }
    const s = clip.fit === 'cover' ? Math.max(W / cw, H / ch) : clip.fit === 'stretch' ? 1 : Math.min(W / cw, H / ch);
    const bw = clip.fit === 'stretch' ? W : cw * s;
    const bh = clip.fit === 'stretch' ? H : ch * s;
    const a = animState(clip, local);
    const tf = transformAt(clip, V.clamp(local, 0, clip.duration));
    const adj = resolveAdjust(clip);
    const f = fx || { alpha: 1, dx: 0, scale: 1, dark: 0, clipW: 1 };
    const cx = W / 2 + (tf.x + a.dx + f.dx) * W, cy = H / 2 + (tf.y + a.dy) * H;
    const sc = tf.scale * a.scale * f.scale, rot = (tf.rotation + a.rot) * Math.PI / 180;

    ctx.save();
    if (f.clipW < 1) { ctx.beginPath(); ctx.rect(0, 0, W * f.clipW, H); ctx.clip(); }
    ctx.globalAlpha = V.clamp(tf.opacity / 100 * a.alpha * f.alpha, 0, 1);
    ctx.globalCompositeOperation = clip.blend || 'source-over';
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(sc * (clip.flipH ? -1 : 1), sc * (clip.flipV ? -1 : 1));
    ctx.filter = filterString(adj, a.blur, k);
    ctx.drawImage(source, sx, sy, cw, ch, -bw / 2, -bh / 2, bw, bh);
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
    if (f.dark > 0 || f.light > 0) {
      ctx.save();
      ctx.fillStyle = f.light > 0 ? `rgba(255,255,255,${f.light})` : `rgba(0,0,0,${f.dark})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (local >= 0 && local < clip.duration) E.boxes.push({ id: clip.id, cx, cy, hw: bw * Math.abs(sc) / 2, hh: bh * Math.abs(sc) / 2, rot });
  };

  const hexA = (hex, a) => {
    const n = parseInt((hex || '#000').slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  const drawText = (clip, local) => {
    const W = canvas.width, H = canvas.height, k = Math.min(W, H) / 1080;
    const t = clip.text;
    const a = animState(clip, local);
    const tf = transformAt(clip, local);
    const size = t.size * k;
    const font = `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${size}px ${t.font}`;
    ctx.save();
    ctx.font = font;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (t.letterSpacing * k) + 'px';
    // эффект «печатной машинки»: показываем текст постепенно
    let content = String(t.content || ' ');
    if (t.typewriter) {
      const dur = Math.min(clip.duration * 0.7, Math.max(0.4, content.length * 0.06));
      content = content.slice(0, Math.max(0, Math.ceil(content.length * V.clamp(local / dur, 0, 1))));
    }
    const full = String(t.content || ' ').split('\n');
    const lines = content.split('\n');
    const lh = size * (t.lineHeight || 1.2);
    const widths = full.map(l => ctx.measureText(l || ' ').width);
    const tw = Math.max(...widths), th = lh * full.length;
    const pad = size * 0.3;
    const cx = W / 2 + (tf.x + a.dx) * W, cy = H / 2 + (tf.y + a.dy) * H;
    const sc = tf.scale * a.scale, rot = (tf.rotation + a.rot) * Math.PI / 180;

    ctx.globalAlpha = V.clamp(tf.opacity / 100 * a.alpha, 0, 1);
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
        const [wa, wb] = windowOf(clip, track);
        if (t < wa || t >= wb) continue;
        const local = t - clip.start;
        const fx = track.kind === 'main' ? transFx(clip, track, t) : null;
        if (clip.type === 'video') {
          const entry = E.pool.get(clip.id) || ensureEl(clip);
          if (entry && entry.el.readyState >= 2) drawVisual(clip, entry.el, entry.el.videoWidth, entry.el.videoHeight, local, fx);
        } else if (clip.type === 'image') {
          const m = V.media.get(clip.mediaId);
          if (m && m.el) drawVisual(clip, m.el, m.width, m.height, local, fx);
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
      E.seekTolerance = 0.02;
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
