/* Vesna — экспорт видео без водяных знаков (MediaRecorder, всё локально) */
'use strict';

V.exporter = (() => {
  const X = { recorder: null, cancelled: false };
  const FORMATS = [
    { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4', name: 'MP4 (H.264)' },
    { mime: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4', name: 'MP4 (H.264)' },
    { mime: 'video/mp4', ext: 'mp4', name: 'MP4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', name: 'WebM (VP9)' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', name: 'WebM (VP8)' },
    { mime: 'video/webm', ext: 'webm', name: 'WebM' },
  ];

  const supported = () => {
    if (!window.MediaRecorder) return [];
    const seen = new Set();
    return FORMATS.filter(f => {
      if (!MediaRecorder.isTypeSupported(f.mime) || seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    });
  };

  let dlg, bar, status, progress, btnStart, btnCancel;

  X.open = () => {
    if (V.project.duration() <= 0) return V.toast('Сначала добавьте клипы на таймлайн');
    const fmts = supported();
    const sel = document.getElementById('exportFormat');
    sel.innerHTML = '';
    fmts.forEach((f, i) => sel.append(V.el('option', { value: i }, f.name)));
    X.formats = fmts;
    if (!fmts.length) {
      V.toast('Этот браузер не поддерживает запись видео. Попробуйте Chrome, Edge или Firefox.', 5000);
      return;
    }
    progress.hidden = true;
    btnStart.disabled = false;
    btnCancel.textContent = 'Отмена';
    dlg.showModal();
  };

  /* Android-приложение: передаём файл частями через мост в Movies/Vesna */
  const saveAndroid = async (blob, name) => {
    const A = window.VesnaAndroid;
    if (!A.begin(name, blob.type)) return '';
    const CH = 3 * 256 * 1024;
    for (let off = 0; off < blob.size; off += CH) {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1] || '');
        r.onerror = rej;
        r.readAsDataURL(blob.slice(off, off + CH));
      });
      if (!A.append(b64)) return '';
      status.textContent = `Сохранение… ${Math.round(Math.min(1, (off + CH) / blob.size) * 100)}%`;
    }
    return A.finish();
  };

  const finish = () => {
    if (window.VesnaAndroid) window.VesnaAndroid.keepAwake(false);
    V.engine.exporting = false;
    V.engine.onEnded = null;
    if (V.engine.monitor) V.engine.monitor.gain.value = 1;
    V.engine.setResolution(V.engine.previewBase);
    document.body.classList.remove('exporting');
  };

  X.start = async () => {
    const E = V.engine;
    const fmt = X.formats[+document.getElementById('exportFormat').value];
    const base = +document.getElementById('exportRes').value;
    const fps = +document.getElementById('exportFps').value;
    const q = +document.getElementById('exportQuality').value;

    E.pause();
    E.ensureAudio();
    E.exporting = true;
    if (window.VesnaAndroid) window.VesnaAndroid.keepAwake(true);
    document.body.classList.add('exporting');
    E.setResolution(base);
    const { width: w, height: h } = E.canvas;
    const bitrate = Math.round(w * h * fps * 0.11 * q);

    const stream = E.canvas.captureStream(fps);
    if (E.streamDest) E.streamDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    if (E.monitor) E.monitor.gain.value = 0; // не играем звук в динамики во время экспорта

    const chunks = [];
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
    } catch (e) {
      finish();
      return V.toast('Не удалось начать запись: ' + e.message, 5000);
    }
    X.recorder = rec;
    X.cancelled = false;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    progress.hidden = false;
    btnStart.disabled = true;
    bar.style.width = '0%';
    status.textContent = 'Подготовка…';

    // подготовка: ставим всё в начало и даём видео загрузиться
    E.seek(0);
    E.step();
    await new Promise(r => setTimeout(r, 600));

    const D = E.duration();
    const onTime = () => {
      if (!E.exporting) return;
      const p = V.clamp(E.time / D, 0, 1);
      bar.style.width = (p * 100).toFixed(1) + '%';
      status.textContent = `${Math.round(p * 100)}% · ${V.fmtTime(E.time, false)} / ${V.fmtTime(D, false)}`;
    };
    X.onTime = onTime;

    const done = new Promise(res => { rec.onstop = res; });
    rec.start(500);
    E.onEnded = () => setTimeout(() => rec.state !== 'inactive' && rec.stop(), 150);
    E.play();
    await done;
    stream.getVideoTracks().forEach(t => t.stop());
    finish();

    if (X.cancelled) {
      status.textContent = 'Отменено';
      dlg.close();
      return;
    }
    const blob = new Blob(chunks, { type: fmt.mime.split(';')[0] });
    const name = (V.project.state.name || 'vesna').replace(/[\\/:*?"<>|]+/g, '_') + '.' + fmt.ext;
    let where = name;
    if (window.VesnaAndroid) {
      status.textContent = 'Сохранение в галерею…';
      where = await saveAndroid(blob, name);
      if (!where) { btnStart.disabled = false; status.textContent = 'Не удалось сохранить файл'; return V.toast('Ошибка сохранения', 4000); }
    } else {
      const url = URL.createObjectURL(blob);
      const a = V.el('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    bar.style.width = '100%';
    status.textContent = `Готово: ${where} (${(blob.size / 1048576).toFixed(1)} МБ)`;
    btnStart.disabled = false;
    btnCancel.textContent = 'Закрыть';
    V.toast('Видео сохранено ✓');
  };

  X.cancel = () => {
    if (X.recorder && X.recorder.state !== 'inactive') {
      X.cancelled = true;
      V.engine.pause();
      X.recorder.stop();
    } else dlg.close();
  };

  X.init = () => {
    dlg = document.getElementById('exportDialog');
    bar = document.getElementById('exportBar');
    status = document.getElementById('exportStatus');
    progress = document.getElementById('exportProgress');
    btnStart = document.getElementById('exportStart');
    btnCancel = document.getElementById('exportCancel');
    btnStart.addEventListener('click', X.start);
    btnCancel.addEventListener('click', X.cancel);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); X.cancel(); });
    V.bus.on('time', () => X.onTime && X.onTime());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && V.engine.exporting) V.toast('Не сворачивайте вкладку во время экспорта!', 5000);
    });
  };

  return X;
})();
