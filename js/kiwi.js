/* Vesna — Киви: голос (синтез речи), «говорящее» лицо, приветственный тур, проверка обновлений */
'use strict';

V.kiwi = (() => {
  const K = { speaking: false };
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  K.voiceOn = () => LS('vesna.kiwiVoice') !== 'off';
  K.setVoice = (on) => { LS('vesna.kiwiVoice', on ? 'on' : 'off'); if (!on) K.stop(); V.bus.emit('kiwiVoice', on); };

  /* --- Настройки голоса --- */
  K.PRESETS = [
    { id: 'zvonkiy', name: 'Звонкий', pitch: 1.45, rate: 1.05 },
    { id: 'obychny', name: 'Обычный', pitch: 1.0, rate: 1.0 },
    { id: 'spokoyny', name: 'Спокойный', pitch: 0.9, rate: 0.85 },
    { id: 'tarator', name: 'Тараторка', pitch: 1.25, rate: 1.45 },
    { id: 'basok', name: 'Басок', pitch: 0.6, rate: 0.95 },
  ];
  const DEFAULT_CFG = { voice: '', pitch: 1.45, rate: 1.05, preset: 'zvonkiy' };
  K.cfg = () => { try { return { ...DEFAULT_CFG, ...JSON.parse(LS('vesna.kiwiVoiceCfg') || '{}') }; } catch (e) { return { ...DEFAULT_CFG }; } };
  K.setCfg = (patch) => { const c = { ...K.cfg(), ...patch }; LS('vesna.kiwiVoiceCfg', JSON.stringify(c)); return c; };

  /* --- Список голосов устройства (только русские) --- */
  const android = () => window.VesnaAndroid && VesnaAndroid.speak && (!VesnaAndroid.canSpeak || VesnaAndroid.canSpeak());
  K.voices = () => {
    if (window.VesnaAndroid && VesnaAndroid.voicesJson) {
      try { return JSON.parse(VesnaAndroid.voicesJson()); } catch (e) { return []; }
    }
    if (!('speechSynthesis' in window)) return [];
    return speechSynthesis.getVoices().filter(v => /^ru/i.test(v.lang))
      .map(v => ({ id: v.voiceURI || v.name, name: v.name.replace(/^Microsoft |^Google /, '') + (v.localService ? '' : ' · интернет') }));
  };

  let voice = null;
  const pickVoice = () => {
    if (!('speechSynthesis' in window)) return null;
    const vs = speechSynthesis.getVoices();
    const want = K.cfg().voice;
    if (want) { const v = vs.find(v => (v.voiceURI || v.name) === want); if (v) return v; }
    return vs.find(v => /^ru/i.test(v.lang) && /(female|жен|irina|alyona|milena|svetlana|daria|google)/i.test(v.name))
      || vs.find(v => /^ru/i.test(v.lang)) || null;
  };
  if ('speechSynthesis' in window) {
    voice = pickVoice();
    speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); V.bus.emit('kiwiVoices'); };
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
    const svgs = () => [...document.querySelectorAll('.help-bubble .vm, .kiwi-talk .vm')].filter(e => e.isConnected);
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
    const cfg = K.cfg();
    if (android()) {
      talking(true);
      VesnaAndroid.speak(clean, cfg.pitch, cfg.rate, cfg.voice || '');
      setTimeout(() => talking(false), Math.min(15000, 400 + clean.length * 65 / cfg.rate));
      return;
    }
    if ('speechSynthesis' in window && (voice || pickVoice())) {
      const u = new SpeechSynthesisUtterance(clean);
      voice = pickVoice();
      u.voice = voice;
      u.lang = 'ru-RU';
      u.pitch = cfg.pitch;
      u.rate = cfg.rate;
      u.onstart = () => talking(true);
      u.onend = u.onerror = () => talking(false);
      speechSynthesis.speak(u);
      return;
    }
    talking(true);
    setTimeout(() => talking(false), chirp(clean));
  };
  window.VesnaSpeakDone = () => talking(false);

  /* --- Окно «Голос Киви» --- */
  let dlg = null;
  const SAMPLE = 'Привет! Я Киви. Если что-то непонятно, нажми на вопросик, и я всё объясню.';
  K.openSettings = () => {
    if (!dlg) {
      dlg = V.el('dialog', { class: 'dialog kiwi-dialog', 'aria-label': 'Голос Киви' });
      document.body.append(dlg);
      dlg.addEventListener('close', () => K.stop());
      V.bus.on('kiwiVoices', () => { if (dlg.open) build(); });
    }
    build();
    dlg.showModal();
  };
  const build = () => {
    const c = K.cfg();
    const list = K.voices();
    const sel = V.el('select', { class: 'select', id: 'kiwiVoiceSel' },
      V.el('option', { value: '' }, 'Автоматически'),
      list.map(v => V.el('option', { value: v.id, selected: v.id === c.voice }, v.name)));
    sel.addEventListener('change', () => { K.setCfg({ voice: sel.value }); voice = pickVoice(); K.say(SAMPLE, { force: true }); });

    const slider = (label, key, min, max) => {
      const out = V.el('span', { class: 'rv' }, (+c[key]).toFixed(2) + '×');
      const inp = V.el('input', { type: 'range', min, max, step: 0.05, value: c[key] });
      const paint = () => inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%');
      inp.addEventListener('input', () => { out.textContent = (+inp.value).toFixed(2) + '×'; paint(); K.setCfg({ [key]: +inp.value, preset: '' }); markPreset(''); });
      inp.addEventListener('change', () => K.say(SAMPLE, { force: true }));
      paint();
      return V.el('label', { class: 'ctl range' }, V.el('span', { class: 'cl' }, label), out, inp);
    };
    const chips = V.el('div', { class: 'chip-row' }, K.PRESETS.map(p => V.el('button', {
      type: 'button', class: 'chip' + (c.preset === p.id ? ' active' : ''), 'data-preset': p.id,
      onclick: () => { K.setCfg({ preset: p.id, pitch: p.pitch, rate: p.rate }); build(); K.say(SAMPLE, { force: true }); },
    }, p.name)));
    const markPreset = (id) => chips.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b.dataset.preset === id));

    const onToggle = V.el('button', { type: 'button', class: 'chip' + (K.voiceOn() ? ' active' : ''), onclick: () => { K.setVoice(!K.voiceOn()); build(); } }, K.voiceOn() ? '✓ Голос включён' : 'Голос выключен');
    const noVoices = !list.length;
    dlg.innerHTML = '';
    dlg.append(V.el('div', { class: 'dialog-body' },
      V.el('div', { class: 'export-head kiwi-talk' }, V.mascot.create('wink', 64, { float: false, title: 'Киви' }), V.el('h3', {}, 'Голос Киви')),
      V.el('p', { class: 'hint' }, 'Киви озвучивает подсказки голосом твоего устройства. Выбери, как он будет звучать.'),
      V.el('div', { class: 'chip-row' }, onToggle),
      V.el('h4', { class: 'sub' }, 'Голос'),
      noVoices
        ? V.el('p', { class: 'hint warn' }, 'На устройстве не найден русский голос. Установи его: Настройки → Специальные возможности (или Язык и ввод) → Синтез речи → русский язык. Пока голоса нет, Киви «чирикает».')
        : V.el('label', { class: 'ctl' }, V.el('span', { class: 'cl' }, 'Голос'), sel),
      V.el('h4', { class: 'sub' }, 'Характер'),
      chips,
      slider('Высота', 'pitch', 0.5, 2),
      slider('Скорость', 'rate', 0.5, 2),
      V.el('div', { class: 'dialog-actions' },
        V.el('button', { type: 'button', class: 'btn ghost', onclick: () => { LS('vesna.kiwiVoiceCfg', JSON.stringify(DEFAULT_CFG)); voice = pickVoice(); build(); } }, 'Сбросить'),
        V.el('button', { type: 'button', class: 'btn ghost', 'data-icon': 'play', onclick: () => K.say(SAMPLE, { force: true }) }, 'Послушать'),
        V.el('button', { type: 'button', class: 'btn primary', onclick: () => dlg.close() }, 'Готово')),
    ));
    V.icons.hydrate(dlg);
  };

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
