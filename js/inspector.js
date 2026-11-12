/* Vesna — панель свойств выбранного клипа */
'use strict';

V.inspector = (() => {
  const I = { busy: false };
  let root;
  const P = () => V.project;

  /* Изменение свойства без пересборки панели; одна точка истории на жест */
  let gestureOpen = false;
  const begin = () => { if (!gestureOpen) { P().checkpoint(); gestureOpen = true; } };
  const end = () => { gestureOpen = false; };
  const apply = (fn) => {
    const c = P().selected();
    if (!c) return;
    begin();
    const before = c.kf && c.kf.length ? { x: c.x, y: c.y, scale: c.scale, rotation: c.rotation, opacity: c.opacity } : null;
    fn(c);
    if (before) syncKeyframe(c, before);
    I.busy = true;
    P().changed();
    I.busy = false;
  };

  /* Если у клипа есть ключевые кадры, правка положения/размера записывается в кадр под плейхедом */
  const syncKeyframe = (c, before) => {
    const changed = V.engine.KF_PROPS.filter(p => c[p] !== before[p]);
    if (!changed.length) return;
    const t = V.clamp(V.engine.time - c.start, 0, c.duration);
    let k = c.kf.find(k => Math.abs(k.t - t) < 0.05);
    if (!k) {
      const cur = V.engine.transformAt({ ...c, ...before }, t);
      k = { t: +t.toFixed(3), ...cur };
      c.kf.push(k);
      c.kf.sort((a, b) => a.t - b.t);
    }
    changed.forEach(p => { k[p] = c[p]; });
    Object.assign(c, before); // базовые значения не трогаем — всё в кадрах
  };

  /* --- конструкторы контролов --- */
  const section = (title, ...body) => V.el('details', { class: 'insp-section', open: true },
    V.el('summary', {}, title), V.el('div', { class: 'insp-body' }, ...body));

  const range = (label, value, min, max, step, onInput, fmt = (v) => v) => {
    const out = V.el('span', { class: 'rv' }, fmt(value));
    const inp = V.el('input', { type: 'range', min, max, step, value });
    inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); apply(c => onInput(c, +inp.value)); });
    inp.addEventListener('change', end);
    inp.addEventListener('dblclick', () => {
      // двойной клик — сброс на значение по умолчанию
      const def = inp.dataset.def;
      if (def != null) { inp.value = def; inp.dispatchEvent(new Event('input')); end(); }
    });
    const row = V.el('label', { class: 'ctl range' }, V.el('span', { class: 'cl' }, label), out, inp);
    const paint = () => { const p = (inp.value - inp.min) / (inp.max - inp.min) * 100; inp.style.setProperty('--p', p + '%'); };
    inp.addEventListener('input', paint); paint();
    row.setDefault = (d) => { inp.dataset.def = d; return row; };
    return row;
  };

  const color = (label, value, onInput) => {
    const inp = V.el('input', { type: 'color', value });
    inp.addEventListener('input', () => apply(c => onInput(c, inp.value)));
    inp.addEventListener('change', end);
    return V.el('label', { class: 'ctl' }, V.el('span', { class: 'cl' }, label), inp);
  };

  const select = (label, value, options, onChange) => {
    const s = V.el('select', { class: 'select' }, options.map(o => V.el('option', { value: o.id, selected: o.id === value }, o.name)));
    s.addEventListener('change', () => { apply(c => onChange(c, s.value)); end(); I.render(); });
    return V.el('label', { class: 'ctl' }, V.el('span', { class: 'cl' }, label), s);
  };

  const toggle = (label, value, onChange) => {
    const b = V.el('button', { class: 'chip' + (value ? ' active' : ''), type: 'button' }, label);
    b.addEventListener('click', () => { apply(c => onChange(c, !b.classList.contains('active'))); end(); b.classList.toggle('active'); });
    return b;
  };

  const chips = (options, value, onPick) => V.el('div', { class: 'chip-row' },
    options.map(o => V.el('button', {
      class: 'chip' + (o.id === value ? ' active' : ''), type: 'button',
      onclick: () => { apply(c => onPick(c, o.id)); end(); I.render(); },
    }, o.name)));

  const button = (label, onClick, cls = '') => V.el('button', { class: 'btn ghost sm ' + cls, type: 'button', onclick: onClick }, label);

  /* --- разделы --- */
  const textSection = (c) => {
    const t = c.text;
    const ta = V.el('textarea', { class: 'textarea', rows: 3 }, t.content);
    ta.addEventListener('input', () => apply(c => { c.text.content = ta.value; c.name = ta.value.split('\n')[0]; }));
    ta.addEventListener('change', end);
    return section('Текст',
      ta,
      select('Шрифт', t.font, V.library.fontList(), (c, v) => { c.text.font = v; }),
      range('Размер', t.size, 12, 400, 1, (c, v) => { c.text.size = v; }),
      color('Цвет', t.color, (c, v) => { c.text.color = v; }),
      V.el('div', { class: 'chip-row' },
        toggle('Жирный', t.bold, (c, v) => { c.text.bold = v; }),
        toggle('Курсив', t.italic, (c, v) => { c.text.italic = v; }),
        toggle('⌨ Печатная машинка', !!t.typewriter, (c, v) => { c.text.typewriter = v; }),
      ),
      chips([{ id: 'left', name: '⇤ Влево' }, { id: 'center', name: '≡ Центр' }, { id: 'right', name: 'Вправо ⇥' }], t.align, (c, v) => { c.text.align = v; }),
      range('Межбукв.', t.letterSpacing, -10, 60, 1, (c, v) => { c.text.letterSpacing = v; }),
      range('Интервал', t.lineHeight, 0.8, 2.5, 0.05, (c, v) => { c.text.lineHeight = v; }),
      V.el('h5', { class: 'sub' }, 'Обводка'),
      color('Цвет', t.strokeColor, (c, v) => { c.text.strokeColor = v; }),
      range('Толщина', t.strokeWidth, 0, 30, 1, (c, v) => { c.text.strokeWidth = v; }),
      V.el('h5', { class: 'sub' }, 'Фон'),
      color('Цвет', t.bgColor, (c, v) => { c.text.bgColor = v; }),
      range('Непрозр.', t.bgOpacity, 0, 100, 1, (c, v) => { c.text.bgOpacity = v; }, v => v + '%'),
      range('Свечение', t.shadow, 0, 80, 1, (c, v) => { c.text.shadow = v; }),
    );
  };

  const transformSection = (c) => {
    const visualMedia = c.type === 'video' || c.type === 'image';
    return section('Положение и размер',
      range('X', Math.round(c.x * 100), -100, 100, 1, (c, v) => { c.x = v / 100; }, v => v + '%').setDefault(0),
      range('Y', Math.round(c.y * 100), -100, 100, 1, (c, v) => { c.y = v / 100; }, v => v + '%').setDefault(0),
      range('Масштаб', Math.round(c.scale * 100), 5, 500, 1, (c, v) => { c.scale = v / 100; }, v => v + '%').setDefault(100),
      range('Поворот', c.rotation, -180, 180, 1, (c, v) => { c.rotation = v; }, v => v + '°').setDefault(0),
      range('Непрозр.', c.opacity, 0, 100, 1, (c, v) => { c.opacity = v; }, v => v + '%').setDefault(100),
      V.el('div', { class: 'chip-row' },
        toggle('⇋ Отразить', c.flipH, (c, v) => { c.flipH = v; }),
        toggle('⇵ Перевернуть', c.flipV, (c, v) => { c.flipV = v; }),
        button('Сбросить', () => { apply(c => { c.x = 0; c.y = 0; c.scale = 1; c.rotation = 0; c.opacity = 100; c.flipH = c.flipV = false; }); end(); I.render(); }),
      ),
      visualMedia ? chips([{ id: 'contain', name: 'Вписать' }, { id: 'cover', name: 'Заполнить' }, { id: 'stretch', name: 'Растянуть' }], c.fit, (c, v) => { c.fit = v; }) : null,
      visualMedia ? select('Наложение', c.blend, [
        { id: 'source-over', name: 'Обычное' }, { id: 'screen', name: 'Экран' }, { id: 'multiply', name: 'Умножение' },
        { id: 'overlay', name: 'Перекрытие' }, { id: 'lighten', name: 'Замена светлым' }, { id: 'darken', name: 'Замена тёмным' },
        { id: 'difference', name: 'Разница' }, { id: 'color-dodge', name: 'Осветление основы' },
      ], (c, v) => { c.blend = v; }) : null,
    );
  };

  const colorSection = (c) => {
    const a = c.adjust;
    const adj = (key, label, min, max, def, unit = '') =>
      range(label, a[key] ?? def, min, max, 1, (c, v) => { c.adjust[key] = v; }, v => v + unit).setDefault(def);
    return section('Цвет и фильтры',
      V.el('div', { class: 'chip-row wrap' }, V.FILTERS.map(f => V.el('button', {
        class: 'chip' + (c.filter === f.id ? ' active' : ''), type: 'button',
        onclick: () => { apply(c => { c.filter = f.id; }); end(); I.render(); },
      }, f.name))),
      adj('brightness', 'Яркость', 0, 200, 100, '%'),
      adj('contrast', 'Контраст', 0, 200, 100, '%'),
      adj('saturate', 'Насыщен.', 0, 300, 100, '%'),
      adj('hue', 'Оттенок', -180, 180, 0, '°'),
      adj('sepia', 'Теплота', 0, 100, 0, '%'),
      adj('grayscale', 'Ч/Б', 0, 100, 0, '%'),
      adj('blur', 'Размытие', 0, 40, 0, 'px'),
      adj('vignette', 'Виньетка', 0, 100, 0, '%'),
      adj('invert', 'Инверсия', 0, 100, 0, '%'),
      button('Сбросить цвет', () => { apply(c => { c.adjust = { ...V.DEFAULT_ADJUST }; c.filter = 'none'; }); end(); I.render(); }),
    );
  };

  const setSpeed = (c, v) => {
    const max = (() => { const m = V.media.get(c.mediaId); return m ? (m.duration - c.in) / v : Infinity; })();
    const src = c.duration * c.speed;
    c.speed = v;
    c.duration = Math.max(V.MIN_CLIP, Math.min(src / v, max));
    const tr = V.project.trackOf(c.id);
    if (tr.kind === 'main') V.project.compactMain();
    else {
      // не наезжаем на следующий клип
      const next = tr.clips.filter(o => o.id !== c.id && o.start >= c.start).sort((a, b) => a.start - b.start)[0];
      if (next && c.start + c.duration > next.start) c.duration = Math.max(V.MIN_CLIP, next.start - c.start);
    }
  };

  const speedSection = (c) => section('Скорость',
    V.el('div', { class: 'chip-row wrap' }, [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10].map(s => V.el('button', {
      class: 'chip' + (c.speed === s ? ' active' : ''), type: 'button',
      onclick: () => { apply(c => setSpeed(c, s)); end(); I.render(); },
    }, s + '×'))),
    range('Точно', c.speed, 0.1, 10, 0.05, (c, v) => setSpeed(c, v), v => (+v).toFixed(2) + '×').setDefault(1),
    V.el('p', { class: 'hint' }, 'Высота звука сохраняется при ускорении и замедлении.'),
  );

  const audioSection = (c) => section('Звук',
    range('Громкость', c.volume, 0, 200, 1, (c, v) => { c.volume = v; }, v => v + '%').setDefault(100),
    range('Нарастание', c.fadeInAudio, 0, Math.min(10, c.duration), 0.1, (c, v) => { c.fadeInAudio = v; }, v => (+v).toFixed(1) + ' с').setDefault(0),
    range('Затухание', c.fadeOutAudio, 0, Math.min(10, c.duration), 0.1, (c, v) => { c.fadeOutAudio = v; }, v => (+v).toFixed(1) + ' с').setDefault(0),
    c.type === 'video' ? V.el('div', { class: 'chip-row' },
      button('Без звука', () => { apply(c => { c.volume = 0; }); end(); I.render(); }),
      button('Отделить звук', () => extractAudio(c)),
    ) : null,
  );

  const animSection = (c) => section('Анимация',
    V.el('h5', { class: 'sub' }, 'Появление'),
    chips(V.ANIMS_IN, c.animIn, (c, v) => { c.animIn = v; }),
    range('Длит.', c.animInDur, 0.1, Math.max(0.2, Math.min(5, c.duration)), 0.1, (c, v) => { c.animInDur = v; }, v => (+v).toFixed(1) + ' с'),
    V.el('h5', { class: 'sub' }, 'Исчезновение'),
    chips(V.ANIMS_OUT, c.animOut, (c, v) => { c.animOut = v; }),
    range('Длит.', c.animOutDur, 0.1, Math.max(0.2, Math.min(5, c.duration)), 0.1, (c, v) => { c.animOutDur = v; }, v => (+v).toFixed(1) + ' с'),
  );

  const timeSection = (c) => {
    const fixed = c.type === 'video' || c.type === 'audio';
    const durInput = V.el('input', { type: 'number', class: 'num', min: 0.1, step: 0.1, value: c.duration.toFixed(2), disabled: fixed });
    durInput.addEventListener('change', () => {
      const v = Math.max(V.MIN_CLIP, +durInput.value || 1);
      apply(c => {
        c.duration = v;
        const tr = V.project.trackOf(c.id);
        if (tr.kind === 'main') V.project.compactMain();
      });
      end();
    });
    return section('Время',
      V.el('div', { class: 'kv' }, V.el('span', {}, 'Начало'), V.el('b', {}, V.fmtTime(c.start))),
      V.el('label', { class: 'ctl' }, V.el('span', { class: 'cl' }, 'Длительность, с'), durInput),
      fixed ? V.el('p', { class: 'hint' }, 'Длину видео и аудио меняйте, потянув за края клипа на таймлайне.') : null,
    );
  };

  /* --- действия --- */
  const extractAudio = (c) => {
    P().mutate((s) => {
      const audio = V.deepClone(c);
      audio.id = V.uid('clip');
      audio.type = 'audio';
      let track = s.tracks.find(t => t.kind === 'audio' && !t.clips.some(o => audio.start < o.start + o.duration && audio.start + audio.duration > o.start));
      if (!track) track = P().addTrack('audio');
      track.clips.push(audio);
      P().sortTrack(track);
      c.volume = 0;
    });
    V.toast('Звук отделён на аудиодорожку');
    I.render();
  };

  const freezeFrame = async (c) => {
    const entry = V.engine.pool.get(c.id);
    if (!entry || entry.el.readyState < 2) return V.toast('Поставьте плейхед на этот клип');
    const v = entry.el;
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const media = await V.media.addBlob(blob, 'Стоп-кадр.png', 'image');
    const t = V.engine.time;
    // разрезаем видео в точке и вставляем стоп-кадр между частями
    const P_ = P();
    if (t > c.start + V.MIN_CLIP && t < c.start + c.duration - V.MIN_CLIP) P_.split(c.id, t);
    P_.mutate((s) => {
      const track = P_.trackOf(c.id);
      const img = {
        ...V.deepClone(c), id: V.uid('clip'), type: 'image', mediaId: media.id, name: 'Стоп-кадр',
        duration: 2, in: 0, speed: 1, animIn: 'none', animOut: 'none', start: c.start + c.duration - 1e-3,
      };
      track.clips.push(img);
      if (track.kind === 'main') {
        const others = track.clips.filter(o => o.id !== img.id).sort((a, b) => a.start - b.start);
        const idx = others.indexOf(c) + 1;
        others.splice(idx, 0, img);
        track.clips = others;
        let pos = 0;
        track.clips.forEach(o => { o.start = pos; pos += o.duration; });
      } else {
        img.start = P_.placeClip(img, track, c.start + c.duration);
        P_.sortTrack(track);
      }
      P_.selectedId = img.id;
    });
    V.toast('Стоп-кадр добавлен');
  };

  const replaceMedia = (c) => {
    const inp = V.el('input', { type: 'file', accept: c.type === 'audio' ? 'audio/*' : 'video/*,image/*' });
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      const type = V.media.typeOf(f);
      if (!type || (c.type === 'audio') !== (type === 'audio')) return V.toast('Неподходящий тип файла');
      const m = await V.media.addBlob(f, f.name, type);
      apply(c => {
        c.mediaId = m.id; c.type = type; c.in = 0; c.name = m.name;
        if (type !== 'image') c.duration = Math.min(c.duration, m.duration / c.speed);
        if (V.project.trackOf(c.id).kind === 'main') V.project.compactMain();
      });
      end();
      I.render();
    });
    inp.click();
  };

  /* --- Кадрирование --- */
  const cropSection = (c) => {
    const cr = c.crop || { l: 0, t: 0, r: 0, b: 0 };
    const set = (k) => (c, v) => { c.crop = { ...(c.crop || { l: 0, t: 0, r: 0, b: 0 }), [k]: v / 100 }; };
    const preset = (name, w, h) => V.el('button', { class: 'chip', type: 'button', onclick: () => {
      const m = V.media.get(c.mediaId); if (!m || !m.width) return;
      const ar = m.width / m.height, want = w / h;
      apply(c => { c.crop = ar > want ? { l: (1 - want / ar) / 2, r: (1 - want / ar) / 2, t: 0, b: 0 } : { t: (1 - ar / want) / 2, b: (1 - ar / want) / 2, l: 0, r: 0 }; c.fit = 'contain'; });
      end(); I.render();
    } }, name);
    return section('Кадрирование',
      V.el('div', { class: 'chip-row wrap' }, preset('9:16', 9, 16), preset('16:9', 16, 9), preset('1:1', 1, 1), preset('4:5', 4, 5),
        V.el('button', { class: 'chip', type: 'button', onclick: () => { apply(c => { c.crop = { l: 0, t: 0, r: 0, b: 0 }; }); end(); I.render(); } }, 'Сбросить')),
      range('Слева', Math.round(cr.l * 100), 0, 45, 1, set('l'), v => v + '%').setDefault(0),
      range('Справа', Math.round(cr.r * 100), 0, 45, 1, set('r'), v => v + '%').setDefault(0),
      range('Сверху', Math.round(cr.t * 100), 0, 45, 1, set('t'), v => v + '%').setDefault(0),
      range('Снизу', Math.round(cr.b * 100), 0, 45, 1, set('b'), v => v + '%').setDefault(0),
    );
  };

  /* --- Хромакей --- */
  const chromaSection = (c) => {
    const ck = c.chroma || { on: false, color: '#00ff00', sim: 0.35, smooth: 0.1 };
    const upd = (k) => (c, v) => { c.chroma = { ...(c.chroma || ck), [k]: v }; };
    return section('Хромакей',
      V.el('p', { class: 'hint' }, 'Убирает зелёный (или другой) фон. Положи клип на дорожку оверлея поверх нужного фона.'),
      V.el('div', { class: 'chip-row' },
        toggle(ck.on ? '✓ Включён' : 'Включить', ck.on, (c, v) => { c.chroma = { ...(c.chroma || ck), on: v }; }),
        V.el('button', { class: 'chip', type: 'button', onclick: () => { apply(c => { c.chroma = { ...(c.chroma || ck), on: true, color: '#00ff00' }; }); end(); I.render(); } }, 'Зелёный'),
        V.el('button', { class: 'chip', type: 'button', onclick: () => { apply(c => { c.chroma = { ...(c.chroma || ck), on: true, color: '#0047ff' }; }); end(); I.render(); } }, 'Синий')),
      color('Цвет фона', ck.color, upd('color')),
      range('Сила', Math.round(ck.sim * 100), 5, 80, 1, (c, v) => upd('sim')(c, v / 100), v => v + '%').setDefault(35),
      range('Мягкость', Math.round(ck.smooth * 100), 0, 50, 1, (c, v) => upd('smooth')(c, v / 100), v => v + '%').setDefault(10),
    );
  };

  /* --- Ключевые кадры --- */
  const kfSection = (c) => {
    const local = V.engine.time - c.start;
    const inside = local >= 0 && local <= c.duration;
    const kf = c.kf || [];
    const at = kf.find(k => Math.abs(k.t - local) < 0.05);
    const snapshot = (c, t) => {
      const cur = V.engine.transformAt(c, t);
      const k = { t: +t.toFixed(3) };
      V.engine.KF_PROPS.forEach(p => { k[p] = cur[p]; });
      return k;
    };
    return section('Ключевые кадры',
      V.el('p', { class: 'hint' }, 'Поставь плейхед, измени положение, размер, поворот или прозрачность и нажми «◆ Добавить». Между кадрами клип будет плавно меняться.'),
      V.el('div', { class: 'chip-row wrap' },
        V.el('button', { class: 'btn sm primary', type: 'button', disabled: !inside, onclick: () => {
          apply(c => {
            const t = V.clamp(V.engine.time - c.start, 0, c.duration);
            const list = (c.kf || []).filter(k => Math.abs(k.t - t) >= 0.05);
            list.push(snapshot(c, t));
            c.kf = list.sort((a, b) => a.t - b.t);
          });
          end(); I.render(); V.toast('Ключевой кадр добавлен ◆');
        } }, at ? '◆ Обновить кадр' : '◆ Добавить кадр'),
        at ? V.el('button', { class: 'chip', type: 'button', onclick: () => { apply(c => { c.kf = c.kf.filter(k => k !== c.kf.find(x => Math.abs(x.t - local) < 0.05)); }); end(); I.render(); } }, 'Удалить этот') : null,
        kf.length ? V.el('button', { class: 'chip', type: 'button', onclick: () => { apply(c => { c.kf = []; }); end(); I.render(); } }, 'Очистить все') : null,
      ),
      V.el('div', { class: 'chip-row wrap' },
        V.el('button', { class: 'chip', type: 'button', onclick: () => { apply(c => { c.kf = [{ t: 0, x: c.x, y: c.y, scale: c.scale, rotation: c.rotation, opacity: c.opacity }, { t: c.duration, x: c.x, y: c.y, scale: c.scale * 1.25, rotation: c.rotation, opacity: c.opacity }]; }); end(); I.render(); } }, '🔍 Медленное приближение'),
        V.el('button', { class: 'chip', type: 'button', onclick: () => { apply(c => { c.kf = [{ t: 0, x: c.x - 0.08, y: c.y, scale: c.scale * 1.2, rotation: c.rotation, opacity: c.opacity }, { t: c.duration, x: c.x + 0.08, y: c.y, scale: c.scale * 1.2, rotation: c.rotation, opacity: c.opacity }]; }); end(); I.render(); } }, '↔ Панорама'),
      ),
      kf.length ? V.el('div', { class: 'kf-list' }, kf.map(k => V.el('button', { class: 'chip' + (k === at ? ' active' : ''), type: 'button', onclick: () => V.engine.seek(c.start + k.t) }, '◆ ' + V.fmtTime(k.t)))) : null,
      !inside ? V.el('p', { class: 'hint' }, 'Плейхед сейчас вне клипа.') : null,
    );
  };

  /* --- Переход (только для клипов основной дорожки, кроме первого) --- */
  const transSection = (c) => {
    const tr = V.project.trackOf(c.id);
    if (!tr || tr.kind !== 'main' || tr.clips.indexOf(c) === 0) return null;
    const cur = c.trans || { type: 'none', dur: 0.6 };
    return section('Переход',
      V.el('p', { class: 'hint' }, 'Как этот клип сменяет предыдущий.'),
      V.el('div', { class: 'chip-row wrap' }, V.TRANSITIONS.map(t => V.el('button', {
        class: 'chip' + (cur.type === t.id ? ' active' : ''), type: 'button',
        onclick: () => { apply(c => { c.trans = t.id === 'none' ? null : { type: t.id, dur: cur.dur || 0.6 }; }); end(); I.render(); },
      }, t.name))),
      cur.type !== 'none' ? range('Длит.', cur.dur, 0.2, 2, 0.1, (c, v) => { c.trans = { ...c.trans, dur: v }; }, v => (+v).toFixed(1) + ' с') : null,
    );
  };

  /* --- сборка панели --- */
  I.render = () => {
    const c = P().selected();
    root.innerHTML = '';
    if (!c) {
      root.append(V.el('div', { class: 'inspector-empty' },
        V.mascot.create(P().allClips().length ? 'wink' : 'wow', 96),
        V.el('p', {}, 'Выберите клип на таймлайне, чтобы изменить его свойства.'),
        V.el('p', { class: 'hint' }, 'Пробел — пуск/пауза · S — разрезать · Del — удалить · Ctrl+D — дублировать · Ctrl+Z — отменить'),
        V.el('h5', { class: 'sub' }, 'Фон проекта'),
        (() => {
          const inp = V.el('input', { type: 'color', value: P().state.background || '#000000' });
          inp.addEventListener('input', () => { P().state.background = inp.value; V.engine.dirty = true; });
          inp.addEventListener('change', () => { P().mutate(() => {}); });
          return V.el('label', { class: 'ctl' }, V.el('span', { class: 'cl' }, 'Цвет'), inp);
        })(),
      ));
      return;
    }
    const titles = { video: 'Видео', image: 'Фото', audio: 'Аудио', text: 'Текст' };
    root.append(V.el('div', { class: 'insp-head' },
      V.el('span', { class: 'insp-type ' + c.type }, titles[c.type]),
      V.el('span', { class: 'insp-name', title: c.name || '' }, c.type === 'text' ? '' : (c.name || '')),
    ));
    if (!I.focus) root.append(V.el('div', { class: 'chip-row insp-actions' },
      button('✂ Разрезать', () => V.project.splitAtPlayhead()),
      button('⧉ Копия', () => V.project.duplicate(c.id)),
      c.type === 'video' ? button('❄ Стоп-кадр', () => freezeFrame(c)) : null,
      c.mediaId ? button('⇄ Заменить', () => replaceMedia(c)) : null,
      button('🗑', () => V.project.remove(c.id), 'danger'),
    ));
    const secs = [];
    if (c.type === 'text') secs.push(textSection(c));
    if (c.type !== 'audio') secs.push(transformSection(c));
    if (c.type !== 'audio') secs.push(kfSection(c));
    if (c.type === 'video' || c.type === 'image') secs.push(colorSection(c), cropSection(c), chromaSection(c));
    if (c.type === 'video' || c.type === 'audio') secs.push(speedSection(c), audioSection(c));
    secs.push(transSection(c));
    if (c.type !== 'audio') secs.push(animSection(c));
    secs.push(timeSection(c));
    // на телефоне можно показать только один раздел
    const focus = I.focus;
    secs.filter(Boolean).forEach(sec => {
      if (focus && !sec.querySelector('summary').textContent.startsWith(focus)) return;
      root.append(sec);
    });
  };

  I.init = () => {
    root = document.getElementById('inspector');
    let lastSel = null;
    V.bus.on('select', () => { lastSel = P().selectedId; I.render(); });
    V.bus.on('project', () => {
      if (I.busy) return;
      // не пересобираем панель, пока пользователь двигает ползунок
      if (gestureOpen && P().selectedId === lastSel) return;
      lastSel = P().selectedId;
      I.render();
    });
    V.bus.on('trim', () => {});
    V.bus.on('fonts', () => I.render());
    // секция ключевых кадров зависит от положения плейхеда
    let lastKfState = '';
    V.bus.on('time', () => {
      const c = P().selected();
      if (!c || !c.kf || gestureOpen || V.engine.playing) return;
      const local = V.engine.time - c.start;
      const st = (c.kf.find(k => Math.abs(k.t - local) < 0.05) ? 'on' : 'off') + (local >= 0 && local <= c.duration);
      if (st !== lastKfState) { lastKfState = st; I.render(); }
    });
    I.render();
  };

  I.syncKeyframe = (c, before) => { if (c.kf && c.kf.length) syncKeyframe(c, before); };
  return I;
})();
