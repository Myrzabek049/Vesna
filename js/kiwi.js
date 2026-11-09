/* Vesna — Киви: голос (синтез речи), «говорящее» лицо, приветственный тур, проверка обновлений */
'use strict';

V.kiwi = (() => {
  const K = { speaking: false };
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  K.voiceOn = () => LS('vesna.kiwiVoice') !== 'off';
  K.setVoice = (on) => { LS('vesna.kiwiVoice', on ? 'on' : 'off'); if (!on) K.stop(); V.bus.emit('kiwiVoice', on); };

  /* --- Голос --- */
  let voice = null;
  const pickVoice = () => {
    if (!('speechSynthesis' in window)) return null;
    const vs = speechSynthesis.getVoices();
    // предпочитаем женский русский голос — у Киви высокий голосок
    return vs.find(v => /^ru/i.test(v.lang) && /(female|жен|irina|alyona|milena|svetlana|daria|google)/i.test(v.name))
      || vs.find(v => /^ru/i.test(v.lang)) || null;
  };
  if ('speechSynthesis' in window) {
    voice = pickVoice();
    speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
  }

  // Запасной «голос»: мелодичное чириканье, если синтеза речи нет
  const chirp = (text) => {
    try {
      const ac = V.engine.ac || new (window.AudioContext || window.webkitAudioContext)();
      const n = Math.min(10, Math.max(3, Math.round(text.length / 12)));
      let t = ac.currentTime + 0.02;
      for (let i = 0; i < n; i++) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(700 + Math.random() * 600, t);
        o.frequency.exponentialRampToValueAtTime(500 + Math.random() * 900, t + 0.08);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.linearRampToValueAtTime(0, t + 0.09);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + 0.1);
        t += 0.11 + Math.random() * 0.05;
      }
      return (t - ac.currentTime) * 1000;
    } catch (e) { return 600; }
  };

  // «Говорящее» лицо у всех видимых Киви
  let talkTimer = null;
  const talking = (on) => {
    K.speaking = on;
    clearInterval(talkTimer);
    const svgs = () => [...document.querySelectorAll('.help-bubble .vm, .kiwi-talk .vm')];
    if (!on) { svgs().forEach(s => V.mascot.set(s, 'wink')); return; }
    let open = false;
    talkTimer = setInterval(() => { open = !open; svgs().forEach(s => V.mascot.set(s, open ? 'talk' : 'happy')); }, 140);
  };

  K.stop = () => {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (window.VesnaAndroid && VesnaAndroid.stopSpeak) VesnaAndroid.stopSpeak();
    talking(false);
  };

  /* Сказать фразу (если голос включён) */
  K.say = (text, { force = false } = {}) => {
    if (!text || (!force && !K.voiceOn())) return;
    K.stop();
    const clean = text.replace(/[«»()]/g, '').replace(/\s+—\s+/g, ', ');
    // Android: системный синтезатор речи через мост
    if (window.VesnaAndroid && VesnaAndroid.speak && (!VesnaAndroid.canSpeak || VesnaAndroid.canSpeak())) {
      talking(true);
      VesnaAndroid.speak(clean, 1.35, 1.05);
      setTimeout(() => talking(false), Math.min(12000, 400 + clean.length * 65));
      return;
    }
    if ('speechSynthesis' in window && (voice || pickVoice())) {
      const u = new SpeechSynthesisUtterance(clean);
      u.voice = voice || pickVoice();
      u.lang = 'ru-RU';
      u.pitch = 1.45;   // высокий, «мультяшный» голос
      u.rate = 1.05;
      u.onstart = () => talking(true);
      u.onend = u.onerror = () => talking(false);
      speechSynthesis.speak(u);
      return;
    }
    talking(true);
    setTimeout(() => talking(false), chirp(clean));
  };
  window.VesnaSpeakDone = () => talking(false);

  /* --- Приветственный тур в редакторе (один раз) --- */
  const TOUR = [
    ['#previewStage', 'Это превью', 'Привет, я Киви! Здесь видно, каким получится видео. Клипы можно двигать и растягивать пальцем прямо тут.'],
    ['#timeline', 'Таймлайн', 'Это таймлайн: клипы по порядку. Тяни клип за края, чтобы обрезать, и перетаскивай, чтобы переставить.'],
    ['.mobile-bar, #leftTabs', 'Инструменты', 'Тут всё для монтажа: медиа, музыка, текст, стикеры и эффекты. Когда выберешь клип, появятся его настройки.'],
    ['#app .help-btn', 'Если непонятно', 'Нажми на вопросик, потом на любую кнопку, и я расскажу, что она делает. Удачного монтажа!'],
  ];
  K.tour = async (force = false) => {
    if (!force && LS('vesna.tourDone')) return;
    LS('vesna.tourDone', '1');
    for (const [sel, title, text] of TOUR) {
      const el = [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null);
      if (!el) continue;
      const ok = await V.help.showStep(el, title, text);
      if (!ok) break;
    }
  };

  /* --- Проверка обновлений (раз в сутки, если есть интернет) --- */
  const REPO = 'myrzabek049/vesna';
  const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
  K.checkUpdate = async (manual = false) => {
    if (!manual) {
      const last = +(LS('vesna.updCheck') || 0);
      if (Date.now() - last < 864e5) return;
    }
    LS('vesna.updCheck', String(Date.now()));
    try {
      const info = await (await fetch(`https://api.github.com/repos/${REPO}`, { cache: 'no-store' })).json();
      const branch = info.default_branch || 'main';
      const v = await (await fetch(`https://raw.githubusercontent.com/${REPO}/${branch}/version.json?t=${Date.now()}`, { cache: 'no-store' })).json();
      if (cmp(v.version, V.VERSION) > 0) showUpdate(v, branch);
      else if (manual) V.toast(`У тебя последняя версия Vesna (${V.VERSION}) ✓`);
    } catch (e) {
      if (manual) V.toast('Не удалось проверить обновления. Нужен интернет.');
    }
  };
  const showUpdate = (v, branch) => {
    const box = document.getElementById('hubUpdate');
    if (!box) return;
    const isAndroid = !!window.VesnaAndroid, isWin = /VesnaDesktop/.test(navigator.userAgent) || location.port === '47391';
    const file = isAndroid ? v.apk : isWin ? v.exe : null;
    const url = file ? `https://github.com/${REPO}/raw/${branch}/${file}` : `https://github.com/${REPO}/tree/${branch}`;
    box.innerHTML = '';
    box.append(
      V.mascot.create('happy', 60, { float: false, title: 'Киви' }),
      V.el('div', { class: 'upd-text' },
        V.el('b', {}, `Вышла Vesna ${v.version}!`),
        V.el('span', {}, (v.notes || []).slice(0, 3).join(' · '))),
      V.el('a', { class: 'btn primary', href: url, target: '_blank', rel: 'noopener' }, file ? 'Скачать' : 'Подробнее'),
      V.el('button', { class: 'btn ghost sm', onclick: () => { box.hidden = true; } }, '✕'));
    box.hidden = false;
    K.say(`Ура! Вышла новая версия Vesna ${v.version}.`);
  };

  return K;
})();
