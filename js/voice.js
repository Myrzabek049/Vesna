/* Vesna — озвучка: запись голоса с микрофона поверх видео */
'use strict';

V.voice = (() => {
  const R = { rec: null, recording: false };
  let stream = null, chunks = [], startAt = 0, overlay = null, timer = null;

  const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';

  const ui = () => {
    overlay = V.el('div', { class: 'rec-overlay', role: 'dialog', 'aria-label': 'Запись озвучки' },
      V.el('div', { class: 'rec-card' },
        V.el('div', { class: 'rec-dot' }),
        V.el('b', { class: 'rec-title' }, 'Приготовься…'),
        V.el('div', { class: 'rec-time' }, '3'),
        V.el('p', { class: 'hint' }, 'Видео играет без звука, чтобы микрофон не записал эхо. Говори!'),
        V.el('div', { class: 'rec-actions' },
          V.el('button', { class: 'btn ghost', onclick: () => stop(false) }, 'Отмена'),
          V.el('button', { class: 'btn primary rec-stop', onclick: () => stop(true) }, '■ Готово'))));
    document.body.append(overlay);
  };

  R.start = async () => {
    if (R.recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return V.toast('Запись звука не поддерживается на этом устройстве', 4000);
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      return V.toast('Нет доступа к микрофону. Разрешите его в настройках.', 4500);
    }
    const E = V.engine;
    E.pause();
    ui();
    R.recording = true;
    // обратный отсчёт 3-2-1
    for (let i = 3; i > 0; i--) {
      if (!R.recording) return;
      overlay.querySelector('.rec-time').textContent = i;
      await new Promise(r => setTimeout(r, 700));
    }
    if (!R.recording) return;
    chunks = [];
    const mime = pickMime();
    R.rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    R.rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    startAt = E.time;
    overlay.classList.add('live');
    overlay.querySelector('.rec-title').textContent = 'Идёт запись';
    E.voiceMute = true;          // видео без звука во время записи
    R.rec.start(250);
    if (E.duration() > 0 && E.time < E.duration() - 0.1) E.play();
    const t0 = performance.now();
    timer = setInterval(() => { overlay.querySelector('.rec-time').textContent = V.fmtTime((performance.now() - t0) / 1000); }, 100);
  };

  const stop = async (keep) => {
    if (!R.recording) return;
    R.recording = false;
    clearInterval(timer);
    const E = V.engine;
    E.pause();
    E.voiceMute = false;
    const done = R.rec && R.rec.state !== 'inactive' ? new Promise(r => { R.rec.onstop = r; R.rec.stop(); }) : Promise.resolve();
    await done;
    stream && stream.getTracks().forEach(t => t.stop());
    overlay && overlay.remove();
    if (!keep || !chunks.length) return;
    const blob = new Blob(chunks, { type: (R.rec && R.rec.mimeType) || 'audio/webm' });
    const n = V.project.allClips().filter(c => (c.name || '').startsWith('Озвучка')).length + 1;
    try {
      const m = await V.media.addBlob(blob, `Озвучка ${n}.webm`, 'audio');
      const clip = V.project.addMediaClip(m, { at: startAt });
      clip.name = `Озвучка ${n}`;
      V.project.changed();
      V.engine.seek(startAt);
      V.toast('Озвучка добавлена на аудиодорожку 🎙');
    } catch (e) {
      V.toast('Не удалось сохранить запись', 4000);
    }
  };

  R.cancel = () => stop(false);
  return R;
})();
