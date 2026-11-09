/* Vesna — экспорт видео без водяных знаков.
   «Точный» режим: каждый кадр рисуется и кодируется отдельно (WebCodecs + MP4), звук сводится офлайн —
   никаких рывков, даже на слабом устройстве. «Быстрый» режим: запись в реальном времени (MediaRecorder). */
'use strict';

V.exporter = (() => {
  const X = { recorder: null, cancelled: false, busy: false };
  const FORMATS = [
    { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4', name: 'MP4 (H.264)' },
    { mime: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4', name: 'MP4 (H.264)' },
    { mime: 'video/mp4', ext: 'mp4', name: 'MP4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', name: 'WebM (VP9)' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', name: 'WebM (VP8)' },
    { mime: 'video/webm', ext: 'webm', name: 'WebM' },
  ];

  const recorderFormats = () => {
    if (!window.MediaRecorder) return [];
    const seen = new Set();
    return FORMATS.filter(f => {
      if (!MediaRecorder.isTypeSupported(f.mime) || seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    });
  };
  X.preciseAvailable = () => 'VideoEncoder' in window && 'VideoFrame' in window && !!window.Mp4Muxer;

  let dlg, bar, status, progress, btnStart, btnCancel, modeSel, fmtSel;

  const fillFormats = () => {
    fmtSel.innerHTML = '';
    if (modeSel.value === 'precise') {
      fmtSel.append(V.el('option', { value: 'mp4' }, 'MP4'));
      fmtSel.disabled = true;
    } else {
      X.formats = recorderFormats();
      X.formats.forEach((f, i) => fmtSel.append(V.el('option', { value: i }, f.name)));
      fmtSel.disabled = false;
    }
  };

  X.open = () => {
    if (V.project.duration() <= 0) return V.toast('Сначала добавьте клипы на таймлайн');
    if (!X.preciseAvailable()) {
      modeSel.value = 'fast';
      modeSel.querySelector('[value=precise]').disabled = true;
    }
    if (!X.preciseAvailable() && !recorderFormats().length) {
      V.toast('Этот браузер не поддерживает запись видео. Попробуйте Chrome или Edge.', 5000);
      return;
    }
    fillFormats();
    progress.hidden = true;
    btnStart.disabled = false;
    if (!X.mascot) { X.mascot = V.mascot.create('wink', 64, { float: false }); document.getElementById('exportMascot').append(X.mascot); }
    V.mascot.set(X.mascot, 'wink');
    btnCancel.textContent = 'Отмена';
    dlg.showModal();
  };

  /* ---------- Сохранение файла (браузер / Android) ---------- */
  X.saveBlob = async (blob, name, onProgress) => {
    const A = window.VesnaAndroid;
    if (A) {
      if (!A.begin(name, blob.type || 'application/octet-stream')) return '';
      const CH = 3 * 256 * 1024;
      for (let off = 0; off < blob.size; off += CH) {
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1] || '');
          r.onerror = rej;
          r.readAsDataURL(blob.slice(off, off + CH));
        });
        if (!A.append(b64)) return '';
        onProgress && onProgress(Math.min(1, (off + CH) / blob.size));
      }
      return A.finish();
    }
    const url = URL.createObjectURL(blob);
    const a = V.el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return name;
  };

  const setProgress = (p, text) => {
    bar.style.width = (p * 100).toFixed(1) + '%';
    V.mascot.progress(X.mascot, p);
    if (text) status.textContent = text;
  };

  const begin = (base) => {
    const E = V.engine;
    E.pause();
    E.ensureAudio();
    E.exporting = true;
    X.busy = true;
    X.cancelled = false;
    if (window.VesnaAndroid) window.VesnaAndroid.keepAwake(true);
    document.body.classList.add('exporting');
    E.setResolution(base);
    progress.hidden = false;
    btnStart.disabled = true;
    V.mascot.set(X.mascot, 'focus');
    setProgress(0, 'Подготовка…');
  };

  const finish = () => {
    if (window.VesnaAndroid) window.VesnaAndroid.keepAwake(false);
    const E = V.engine;
    E.exporting = false;
    X.busy = false;
    E.onEnded = null;
    E.seekTolerance = 0.02;
    if (E.monitor) E.monitor.gain.value = 1;
    E.setResolution(E.previewBase);
    document.body.classList.remove('exporting');
    X.onTime = null;
  };

  /* ---------- Точный режим ---------- */
  // Сведение звука всех клипов офлайн (OfflineAudioContext)
  const audioCache = new Map();
  const decode = async (mediaId) => {
    if (audioCache.has(mediaId)) return audioCache.get(mediaId);
    const m = V.media.get(mediaId);
    let buf = null;
    try {
      const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 48000, 48000);
      buf = await ac.decodeAudioData(await m.blob.arrayBuffer());
    } catch (e) { buf = null; } // у видео может не быть звука
    audioCache.set(mediaId, buf);
    return buf;
  };

  const mixAudio = async (D, SR = 48000) => {
    const P = V.project;
    const jobs = [];
    for (const track of P.state.tracks) {
      if (track.muted) continue;
      for (const c of track.clips) {
        if ((c.type === 'video' || c.type === 'audio') && c.volume > 0 && c.mediaId) jobs.push(c);
      }
    }
    if (!jobs.length) return null;
    const ctx = new OfflineAudioContext(2, Math.ceil(D * SR), SR);
    let any = false;
    for (const c of jobs) {
      const buf = await decode(c.mediaId);
      if (!buf) continue;
      any = true;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = c.speed;
      const g = ctx.createGain();
      const vol = c.volume / 100;
      const t0 = c.start, t1 = c.start + c.duration;
      g.gain.setValueAtTime(c.fadeInAudio > 0 ? 0 : vol, t0);
      if (c.fadeInAudio > 0) g.gain.linearRampToValueAtTime(vol, t0 + Math.min(c.fadeInAudio, c.duration));
      if (c.fadeOutAudio > 0) {
        g.gain.setValueAtTime(vol, Math.max(t0, t1 - c.fadeOutAudio));
        g.gain.linearRampToValueAtTime(0, t1);
      }
      src.connect(g).connect(ctx.destination);
      src.start(t0, Math.min(c.in, buf.duration), Math.max(0.01, c.duration * c.speed));
      src.stop(t1);
    }
    if (!any) return null;
    return await ctx.startRendering();
  };

  const pickVideoCodec = async (w, h, fps, bitrate) => {
    const opts = [
      { codec: 'avc1.640033', mux: 'avc' }, { codec: 'avc1.4d0033', mux: 'avc' }, { codec: 'avc1.42003e', mux: 'avc' },
      { codec: 'vp09.00.50.08', mux: 'vp9' }, { codec: 'av01.0.08M.08', mux: 'av1' },
    ];
    for (const o of opts) {
      const cfg = { codec: o.codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality' };
      if (o.mux === 'avc') cfg.avc = { format: 'avc' };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, mux: o.mux }; } catch (e) {}
    }
    return null;
  };
  const pickAudioCodec = async () => {
    if (!('AudioEncoder' in window)) return null;
    for (const o of [{ codec: 'mp4a.40.2', mux: 'aac' }, { codec: 'opus', mux: 'opus' }]) {
      const cfg = { codec: o.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
      try { const r = await AudioEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, mux: o.mux }; } catch (e) {}
    }
    return null;
  };

  const exportPrecise = async (base, fps, q) => {
    const E = V.engine;
    begin(base);
    const { width: w, height: h } = E.canvas;
    const D = E.duration();
    const N = Math.max(1, Math.round(D * fps));
    const bitrate = Math.round(w * h * fps * 0.12 * q);
    const vc = await pickVideoCodec(w, h, fps, bitrate);
    if (!vc) throw new Error('кодирование видео не поддерживается этим устройством');

    // звук
    setProgress(0.01, 'Сведение звука…');
    let audio = null, ac = null;
    try { audio = await mixAudio(D); } catch (e) { console.warn('mix', e); }
    if (audio) ac = await pickAudioCodec();

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: vc.mux, width: w, height: h, frameRate: fps },
      audio: audio && ac ? { codec: ac.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encErr = null;
    const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
    venc.configure(vc.cfg);

    if (audio && ac) {
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { encErr = e; } });
      aenc.configure(ac.cfg);
      const L = audio.getChannelData(0), R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
      const FR = 4800;
      for (let off = 0; off < audio.length; off += FR) {
        const n = Math.min(FR, audio.length - off);
        const data = new Float32Array(n * 2);
        data.set(L.subarray(off, off + n), 0);
        data.set(R.subarray(off, off + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off / 48000 * 1e6), data });
        aenc.encode(ad);
        ad.close();
      }
      await aenc.flush();
      aenc.close();
    }

    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      if (X.cancelled) break;
      if (encErr) throw encErr;
      await E.renderAt(i / fps, fps);
      const frame = new VideoFrame(E.canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 1));
      if (i % 3 === 0) {
        const el = (performance.now() - t0) / 1000, left = el / (i + 1) * (N - i - 1);
        setProgress(0.03 + 0.95 * (i + 1) / N, `Кадр ${i + 1} из ${N} · осталось ≈ ${V.fmtTime(left, false)}`);
      }
    }
    await venc.flush();
    venc.close();
    if (X.cancelled) return null;
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
  };

  /* ---------- Быстрый режим (реальное время) ---------- */
  const exportFast = async (base, fps, q) => {
    const E = V.engine;
    const fmt = X.formats[+fmtSel.value];
    begin(base);
    const { width: w, height: h } = E.canvas;
    const bitrate = Math.round(w * h * fps * 0.11 * q);
    const stream = E.canvas.captureStream(fps);
    if (E.streamDest) E.streamDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    if (E.monitor) E.monitor.gain.value = 0;
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
    X.recorder = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    E.seek(0);
    E.step();
    await new Promise(r => setTimeout(r, 600));
    const D = E.duration();
    X.onTime = () => {
      if (!E.exporting) return;
      const p = V.clamp(E.time / D, 0, 1);
      setProgress(p, `${Math.round(p * 100)}% · ${V.fmtTime(E.time, false)} / ${V.fmtTime(D, false)}`);
    };
    const done = new Promise(res => { rec.onstop = res; });
    rec.start(500);
    E.onEnded = () => setTimeout(() => rec.state !== 'inactive' && rec.stop(), 150);
    E.play();
    await done;
    stream.getVideoTracks().forEach(t => t.stop());
    X.recorder = null;
    if (X.cancelled) return null;
    return { blob: new Blob(chunks, { type: fmt.mime.split(';')[0] }), ext: fmt.ext };
  };

  X.start = async () => {
    const base = +document.getElementById('exportRes').value;
    const fps = +document.getElementById('exportFps').value;
    const q = +document.getElementById('exportQuality').value;
    let out = null;
    try {
      out = modeSel.value === 'precise' ? await exportPrecise(base, fps, q) : await exportFast(base, fps, q);
    } catch (e) {
      console.error(e);
      finish();
      V.mascot.set(X.mascot, 'sad');
      btnStart.disabled = false;
      status.textContent = 'Ошибка: ' + (e.message || e);
      if (modeSel.value === 'precise' && recorderFormats().length) {
        status.textContent += '. Попробуйте режим «Быстрый».';
      }
      return;
    }
    finish();
    if (!out) {
      V.mascot.set(X.mascot, 'sad');
      status.textContent = 'Отменено';
      btnStart.disabled = false;
      return;
    }
    const name = (V.project.state.name || 'vesna').replace(/[\\/:*?"<>|]+/g, '_') + '.' + out.ext;
    status.textContent = 'Сохранение…';
    const where = await X.saveBlob(out.blob, name, (p) => { status.textContent = `Сохранение… ${Math.round(p * 100)}%`; });
    if (!where) { V.mascot.set(X.mascot, 'sad'); btnStart.disabled = false; status.textContent = 'Не удалось сохранить файл'; return; }
    setProgress(1);
    V.mascot.set(X.mascot, 'happy');
    status.textContent = `Готово: ${where} (${(out.blob.size / 1048576).toFixed(1)} МБ)`;
    btnStart.disabled = false;
    btnCancel.textContent = 'Закрыть';
    V.kiwi && V.kiwi.say('Готово! Видео сохранено.');
    V.toast('Видео сохранено ✓');
  };

  X.cancel = () => {
    if (X.busy) {
      X.cancelled = true;
      if (X.recorder && X.recorder.state !== 'inactive') { V.engine.pause(); X.recorder.stop(); }
    } else dlg.close();
  };

  X.init = () => {
    dlg = document.getElementById('exportDialog');
    bar = document.getElementById('exportBar');
    status = document.getElementById('exportStatus');
    progress = document.getElementById('exportProgress');
    btnStart = document.getElementById('exportStart');
    btnCancel = document.getElementById('exportCancel');
    modeSel = document.getElementById('exportMode');
    fmtSel = document.getElementById('exportFormat');
    modeSel.addEventListener('change', fillFormats);
    btnStart.addEventListener('click', X.start);
    btnCancel.addEventListener('click', X.cancel);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); X.cancel(); });
    V.bus.on('time', () => X.onTime && X.onTime());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && V.engine.exporting && modeSel.value === 'fast') V.toast('Не сворачивайте приложение во время быстрого экспорта!', 5000);
    });
  };

  return X;
})();
