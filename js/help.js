/* Vesna — режим подсказок: Киви объясняет, что делает любая кнопка.
   Включается кнопкой «?» (или клавишей F1). В этом режиме нажатие не выполняет действие,
   а показывает объяснение. */
'use strict';

V.help = (() => {
  const H = { on: false };

  /* Подсказки: [селектор или функция(el) → bool, заголовок, текст]. Проверяются по порядку. */
  const TIPS = [
    // --- Хаб ---
    ['#hubNew', 'Новый проект', 'Создаёт пустой проект. Сначала выбери формат кадра: 9:16 для TikTok, Reels и Shorts, 16:9 для YouTube, квадрат или 4:5 для ленты.'],
    ['.hub-format', 'Формат кадра', 'Соотношение сторон будущего видео. Потом его можно поменять в редакторе.'],
    ['.hub-more', 'Действия с проектом', 'Здесь можно открыть, переименовать, сделать копию, сохранить проект в файл или удалить его.'],
    ['.hub-card', 'Проект', 'Твой сохранённый проект: превью, формат и длительность. Нажми, чтобы продолжить монтаж.'],

    ['#hubImport', 'Открыть из файла', 'Восстанавливает проект из файла .vesna, например из копии с другого телефона или компьютера.'],
    [(el) => !!el.closest('.hub-open-file'), 'Открыть из файла', 'Восстанавливает проект из файла .vesna, например из копии с другого телефона или компьютера.'],
    ['#hubCheckUpd', 'Проверить обновления', 'Киви посмотрит, не вышла ли новая версия Vesna. Нужен интернет.'],

    // --- Нижняя панель (телефон) ---
    [(el) => el.matches('.mb-btn.back'), 'Назад', 'Снимает выделение с клипа и возвращает панель материалов.'],
    [(el) => el.matches('.mb-btn') && el.dataset.tool === 'Медиа', 'Медиа', 'Твои видео и фото. Отсюда их добавляют в проект.'],
    [(el) => el.matches('.mb-btn') && el.dataset.tool === 'Аудио', 'Аудио', 'Бесплатная музыка, звуковые эффекты и запись озвучки.'],
    [(el) => el.matches('.mb-btn') && el.dataset.tool === 'Озвучка', 'Озвучка', 'Записывает твой голос с микрофона поверх видео, начиная с места плейхеда.'],
    [(el) => el.matches('.mb-btn') && el.dataset.tool === 'Кадр', 'Кадрирование', 'Обрезает края кадра, например чтобы из горизонтального видео сделать вертикальное.'],
    [(el) => el.matches('.mb-btn') && el.dataset.tool === 'Хромакей', 'Хромакей', 'Убирает зелёный фон с видео, чтобы подставить другой.'],
    [(el) => el.matches('.mb-btn') && el.dataset.tool === 'Ключ. кадры', 'Ключевые кадры', 'Плавное движение: клип сам меняет положение и размер между отмеченными моментами.'],
    [(el) => el.matches('.mb-btn') && el.dataset.tool === 'Все настройки', 'Все настройки', 'Открывает все настройки выбранного клипа сразу.'],
    ['.mb-btn', 'Инструмент', 'Нажми, чтобы открыть этот инструмент для выбранного клипа.'],

    // --- Верхняя панель ---
    ['#btnHome', 'Мои проекты', 'Возвращает к списку проектов. Текущий проект сохраняется автоматически.'],
    ['#projectName', 'Название проекта', 'Нажми и впиши своё название. С этим именем сохранится и готовое видео.'],
    ['#btnUndo', 'Отменить', 'Отменяет последнее действие (Ctrl+Z). Можно отменить до 150 шагов назад.'],
    ['#btnRedo', 'Повторить', 'Возвращает то, что ты отменил (Ctrl+Shift+Z).'],
    ['#aspectSelect', 'Формат кадра', '16:9 — горизонтальное видео, 9:16 — вертикальное для телефона, 1:1 — квадрат.'],
    ['#btnExport', 'Экспорт', 'Сохраняет готовое видео в MP4 или WebM, до 4K. Водяных знаков нет.'],

    // --- Левая панель ---
    ['[data-tab=media]', 'Медиа', 'Твои видео, фото и музыка для этого проекта. Отсюда их добавляют на таймлайн.'],
    ['[data-tab=text]', 'Текст', 'Готовые стили надписей: заголовки, субтитры, неон и другие. Нажми на стиль, и текст появится под плейхедом.'],
    ['[data-tab=stickers]', 'Стикеры', 'Эмодзи-наклейки. Их можно двигать, увеличивать и анимировать, как текст.'],
    ['[data-tab=filters]', 'Фильтры', 'Цветовые фильтры. Сначала выбери видео или фото на таймлайне, потом фильтр.'],
    ['[data-tab=effects]', 'Эффекты', 'Анимации появления и исчезновения выбранного клипа: проявление, сдвиг, вращение и другие.'],
    ['#dropzone', 'Импорт', 'Добавляет файлы с устройства. Можно выбрать сразу несколько или перетащить их сюда. Файлы никуда не загружаются.'],
    ['[data-tab=audio]', 'Аудио', 'Озвучка с микрофона, бесплатная музыка без авторских прав и звуковые эффекты.'],
    ['#btnVoice', 'Записать озвучку', 'После отсчёта 3-2-1 начнётся запись с микрофона. Видео играет без звука, чтобы не было эха. «Готово» кладёт запись на аудиодорожку.'],
    ['.lib-play', 'Прослушать', 'Включает трек, чтобы послушать перед добавлением.'],
    ['.lib-add', 'Добавить музыку', 'Кладёт трек на аудиодорожку с места плейхеда. Музыка своя, её можно использовать где угодно.'],
    ['.sfx-add', 'Добавить звук', 'Кладёт звуковой эффект в место плейхеда.'],
    ['.sfx-name', 'Прослушать звук', 'Проигрывает эффект, чтобы его услышать.'],
    ['#subsAdd', 'Добавить субтитры', 'Каждая строка из поля выше станет отдельной надписью внизу кадра, одна за другой.'],
    ['#subsText', 'Текст субтитров', 'Вставь или напиши текст. Каждая новая строка — новый субтитр.'],
    [(el) => !!el.closest('.upload-btn') && !!el.closest('.upload-btn').querySelector('#fontInput'), 'Свой шрифт', 'Загрузи файл шрифта (.ttf, .otf, .woff). Он появится в списке шрифтов у всех текстов во всех проектах.'],
    [(el) => !!el.closest('.upload-btn') && !!el.closest('.upload-btn').querySelector('#stickerInput'), 'Свои стикеры', 'Загрузи свои картинки, лучше всего PNG с прозрачным фоном. Они сохранятся для всех проектов.'],
    ['.my-sticker .sticker', 'Мой стикер', 'Нажми, чтобы добавить этот стикер на видео.'],
    ['.trans-btn', 'Переход', 'Нажми, чтобы выбрать, как один клип сменяет другой: наплыв, шторка, сдвиг, вспышка…'],
    ['.media-card .mini.danger', 'Удалить файл', 'Убирает файл из проекта вместе со всеми его клипами.'],
    [(el) => el.matches('.media-card .mini') && el.title.includes('оверлей'), 'Как оверлей', 'Кладёт видео или фото поверх основного: эффект «картинка в картинке».'],
    ['.media-card .mini', 'Добавить на таймлайн', 'Ставит файл в конец основной дорожки (или на аудиодорожку для музыки).'],
    ['.media-card', 'Файл', 'Нажми «+», чтобы добавить на таймлайн, или перетащи карточку на нужную дорожку. Зелёная точка значит, что файл уже используется.'],
    ['.text-preset', 'Стиль текста', 'Добавляет надпись в этом стиле. Текст, цвет и шрифт потом меняются справа, в свойствах.'],
    ['.sticker', 'Стикер', 'Добавляет эмодзи на видео в месте плейхеда.'],
    ['.filter-card', 'Фильтр', 'Меняет цвета выбранного клипа. Силу и детали можно подстроить в свойствах: яркость, контраст и т. д.'],

    // --- Превью и транспорт ---
    ['.sel-handle.scale', 'Масштаб', 'Потяни за уголок, чтобы увеличить или уменьшить выбранный клип прямо на экране.'],
    ['.sel-handle.rotate', 'Поворот', 'Потяни за кружок сверху, чтобы повернуть клип. У 0°, 90° и 180° он «прилипает».'],
    ['#previewStage', 'Превью', 'Так будет выглядеть видео. Нажми на клип, чтобы выбрать его, и тащи, чтобы подвинуть. Колесо мыши меняет размер.'],
    ['#btnPlay', 'Воспроизведение', 'Запускает и останавливает просмотр (клавиша Пробел).'],
    ['#btnToStart', 'В начало', 'Переносит плейхед в начало видео.'],
    ['#btnToEnd', 'В конец', 'Переносит плейхед в конец видео.'],
    ['#btnPrevFrame', 'Кадр назад', 'Сдвигает на один кадр назад, чтобы точно найти момент (стрелка ←).'],
    ['#btnNextFrame', 'Кадр вперёд', 'Сдвигает на один кадр вперёд (стрелка →).'],
    ['#timeCurrent', 'Текущее время', 'Где сейчас стоит плейхед: минуты, секунды и сотые.'],
    ['#timeTotal', 'Длительность', 'Сколько будет длиться всё видео.'],

    // --- Таймлайн ---
    ['#btnSplit', 'Разрезать', 'Режет клип в месте плейхеда на две части (клавиша S). Так убирают лишнее из середины.'],
    ['#btnDuplicate', 'Дублировать', 'Делает копию выбранного клипа сразу после него (Ctrl+D).'],
    ['#btnDelete', 'Удалить', 'Удаляет выбранный клип (клавиша Delete). На основной дорожке остальные клипы сдвигаются, и пустого места не остаётся.'],
    ['#btnAddTrack', 'Новая дорожка', 'Добавляет дорожку оверлея, чтобы положить ещё одно видео или фото поверх основного.'],
    [(el) => !!el.closest('label') && !!el.closest('label').querySelector('#snapToggle'), 'Магнит', 'Когда включено, клипы при перетаскивании «прилипают» к краям других клипов и к плейхеду.'],
    ['#zoomRange', 'Масштаб таймлайна', 'Растягивает или сжимает шкалу времени. Удобно для точной обрезки. Ещё работает Ctrl+колесо мыши.'],
    ['.ruler', 'Шкала времени', 'Нажми или проведи по шкале, чтобы перейти к нужному моменту.'],
    ['.playhead-knob', 'Плейхед', 'Белая линия показывает текущий момент. Его можно таскать.'],
    ['.clip .handle', 'Край клипа', 'Потяни за край, чтобы обрезать клип: убрать лишнее в начале или в конце.'],
    ['.clip.video', 'Видеоклип', 'Нажми, чтобы выбрать и настроить справа. Перетаскивай, чтобы переставить или перенести на другую дорожку.'],
    ['.clip.image', 'Фото', 'Фото на таймлайне. Его длительность меняется за край или в свойствах.'],
    ['.clip.text', 'Текст или стикер', 'Надпись поверх видео. Выбери её, чтобы изменить текст, шрифт и анимацию.'],
    ['.clip.audio', 'Аудио', 'Музыка или звук. Можно обрезать, менять громкость и делать плавное затухание.'],
    ['.th-btn', 'Звук и видимость дорожки', '🔊 включает и выключает звук всей дорожки, ◉ показывает или скрывает её на видео.'],
    ['.track-head.main', 'Основная дорожка', 'Главная последовательность видео. Клипы на ней идут встык, без пустот.'],
    ['.track-head.overlay', 'Дорожка оверлея', 'Видео и фото поверх основного: «картинка в картинке», логотипы, вставки.'],
    ['.track-head.text', 'Дорожка текста', 'Надписи и стикеры. Верхние дорожки рисуются поверх нижних.'],
    ['.track-head.audio', 'Аудиодорожка', 'Музыка и звуки. Их может быть несколько.'],
    ['.track-row', 'Дорожка', 'Сюда можно перетащить файл из медиатеки. Пустое место, если на него нажать, снимает выделение.'],

    // --- Инспектор ---
    [(el) => sectionIs(el, 'Текст'), 'Текст', 'Пиши текст (Enter — новая строка), выбирай шрифт, размер, цвет, обводку, плашку и свечение.'],
    [(el) => sectionIs(el, 'Положение'), 'Положение и размер', 'Двигает, масштабирует и поворачивает клип. «Вписать», «Заполнить» и «Растянуть» решают, как видео ложится в кадр. Двойное нажатие на ползунок сбрасывает его.'],
    [(el) => sectionIs(el, 'Цвет'), 'Цвет и фильтры', 'Готовые фильтры и ручная цветокоррекция: яркость, контраст, насыщенность, теплота, размытие, виньетка.'],
    [(el) => sectionIs(el, 'Скорость'), 'Скорость', 'Ускоряет (2×, 5×) или замедляет (0.5×) клип. Голос при этом не становится писклявым.'],
    [(el) => sectionIs(el, 'Звук'), 'Звук', 'Громкость до 200 %, плавное нарастание в начале и затухание в конце. «Отделить звук» выносит звук видео на отдельную дорожку.'],
    [(el) => sectionIs(el, 'Анимация'), 'Анимация', 'Как клип появляется и исчезает: проявление, приближение, сдвиг, вращение. Длительность регулируется ползунком.'],
    [(el) => sectionIs(el, 'Кадрирование'), 'Кадрирование', 'Обрезает края кадра. Кнопки 9:16, 16:9, 1:1 сразу вырезают нужный формат из центра.'],
    [(el) => sectionIs(el, 'Хромакей'), 'Хромакей', 'Убирает фон выбранного цвета (обычно зелёный). «Сила» — сколько оттенков убрать, «Мягкость» — плавность краёв.'],
    [(el) => sectionIs(el, 'Ключевые'), 'Ключевые кадры', 'Отметь начальное и конечное положение клипа, и он плавно переместится, увеличится или повернётся. Кнопки ниже делают это за тебя.'],
    [(el) => sectionIs(el, 'Переход'), 'Переход', 'Как этот клип появляется после предыдущего. «Длит.» — сколько длится переход.'],
    [(el) => sectionIs(el, 'Время'), 'Время', 'Где начинается клип и сколько длится. Длину фото и текста можно вписать числом.'],
    [(el) => btnText(el, 'Стоп-кадр'), 'Стоп-кадр', 'Замораживает текущий кадр видео на 2 секунды и вставляет его в место плейхеда.'],
    [(el) => btnText(el, 'Заменить'), 'Заменить', 'Подставляет другой файл в этот клип. Все настройки (фильтры, анимации) сохранятся.'],
    [(el) => btnText(el, 'Копия'), 'Копия', 'Дублирует клип со всеми настройками.'],
    [(el) => btnText(el, 'Отделить звук'), 'Отделить звук', 'Переносит звук из видео на аудиодорожку, чтобы его можно было отдельно обрезать или сдвинуть.'],
    ['.insp-actions .danger', 'Удалить клип', 'Удаляет выбранный клип с таймлайна.'],

    // --- Экспорт ---
    [(el) => !!el.closest('.field') && !!el.closest('.field').querySelector('#exportMode'), 'Режим экспорта', '«Точный» собирает видео кадр за кадром: без рывков, можно свернуть приложение. «Быстрый» записывает в реальном времени, пока видео играет.'],
    [(el) => !!el.closest('.field') && !!el.closest('.field').querySelector('#exportRes'), 'Разрешение', 'Чёткость видео. 1080p подходит для соцсетей, 4K для больших экранов, но файл будет тяжелее.'],
    [(el) => !!el.closest('.field') && !!el.closest('.field').querySelector('#exportFps'), 'Частота кадров', 'Сколько кадров в секунду. 30 — стандарт, 60 — очень плавно, 24 — «киношно».'],
    [(el) => !!el.closest('.field') && !!el.closest('.field').querySelector('#exportQuality'), 'Качество', 'Чем выше, тем лучше картинка и тем больше файл.'],
    [(el) => !!el.closest('.field') && !!el.closest('.field').querySelector('#exportFormat'), 'Формат', 'MP4 открывается везде. WebM легче, но некоторые телефоны и программы его не понимают.'],
    ['#exportStart', 'Экспортировать', 'Запускает сохранение. Видео рендерится в реальном времени, не сворачивай приложение.'],
  ];

  function sectionIs(el, word) {
    const sec = el.closest('.insp-section');
    return !!sec && sec.querySelector('summary').textContent.startsWith(word) && !el.closest('.insp-body button, .insp-body input, .insp-body select, .insp-body textarea');
  }
  function btnText(el, word) {
    const b = el.closest('button');
    return !!b && b.textContent.includes(word);
  }

  const find = (target) => {
    for (let el = target; el && el !== document.body; el = el.parentElement) {
      for (const [sel, title, text] of TIPS) {
        const ok = typeof sel === 'function' ? sel(el) : el.matches(sel);
        if (ok) return { el, title, text };
      }
    }
    // ползунки и поля внутри раздела инспектора — объясняем раздел
    const sec = target.closest && target.closest('.insp-section');
    if (sec) return find(sec.querySelector('summary'));
    return null;
  };

  /* --- Интерфейс --- */
  let bar, bubble, mascot, lit;
  const build = () => {
    bar = V.el('div', { class: 'help-bar', role: 'status' },
      V.el('span', {}, '🥝 Нажми на любую кнопку, и Киви объяснит, что она делает'),
      V.el('button', { class: 'btn sm', onclick: () => H.toggle(false) }, 'Готово'));
    mascot = V.mascot.create('wink', 64, { float: false, title: 'Киви' });
    bubble = V.el('div', { class: 'help-bubble', role: 'dialog', 'aria-live': 'polite' },
      V.el('div', { class: 'hb-m' }, mascot),
      V.el('div', { class: 'hb-body' },
        V.el('div', { class: 'hb-who' }, 'Киви объясняет'),
        V.el('b', { class: 'hb-title' }),
        V.el('p', { class: 'hb-text' }),
        V.el('div', { class: 'hb-actions' },
          V.el('button', { class: 'btn sm ghost hb-voice', title: 'Голос Киви', onclick: () => { V.kiwi.setVoice(!V.kiwi.voiceOn()); syncVoiceBtn(); if (V.kiwi.voiceOn()) V.kiwi.say(bubble.querySelector('.hb-text').textContent); } }, '🔊'),
          V.el('button', { class: 'btn sm ghost hb-skip', hidden: true }, 'Пропустить'),
          V.el('button', { class: 'btn sm primary hb-ok', onclick: () => okHandler() }, 'Понятно'))));
    bar.hidden = true; bubble.hidden = true;
    document.body.append(bar, bubble);
  };

  const syncVoiceBtn = () => {
    const b = bubble.querySelector('.hb-voice');
    b.textContent = V.kiwi.voiceOn() ? '🔊' : '🔇';
    b.title = V.kiwi.voiceOn() ? 'Голос Киви включён. Нажми, чтобы выключить' : 'Голос Киви выключен. Нажми, чтобы включить';
  };
  let okHandler = () => hideBubble();
  const hideBubble = () => {
    V.kiwi && V.kiwi.stop();
    bubble.hidden = true;
    document.body.classList.remove('help-sheet');
    if (lit) { lit.classList.remove('help-lit'); lit = null; }
  };

  const show = (tip) => {
    hideBubble();
    lit = tip.el;
    lit.classList.add('help-lit');
    bubble.querySelector('.hb-title').textContent = tip.title;
    bubble.querySelector('.hb-text').textContent = tip.text;
    V.mascot.set(mascot, 'happy');
    setTimeout(() => { if (!V.kiwi.speaking) V.mascot.set(mascot, 'wink'); }, 900);
    syncVoiceBtn();
    if (!tip.step) {
      bubble.querySelector('.hb-skip').hidden = true;
      bubble.querySelector('.hb-ok').textContent = 'Понятно';
      okHandler = () => hideBubble();
    }
    V.kiwi.say(tip.title + '. ' + tip.text);
    // диалог экспорта открыт модально — пузырь кладём внутрь него, иначе он окажется под фоном
    const host = document.querySelector('dialog[open]') || document.body;
    if (bubble.parentElement !== host) host.append(bubble);
    bubble.hidden = false;
    const mobile = window.innerWidth < 700;
    bubble.classList.toggle('sheet', mobile);
    document.body.classList.toggle('help-sheet', mobile);
    if (mobile) { bubble.style.left = bubble.style.top = ''; return; }
    const r = tip.el.getBoundingClientRect(), b = bubble.getBoundingClientRect();
    const hr = host === document.body ? { left: 0, top: 0 } : host.getBoundingClientRect();
    let top = r.bottom + 10;
    if (top + b.height > window.innerHeight - 10) top = Math.max(10, r.top - b.height - 10);
    const left = V.clamp(r.left + r.width / 2 - b.width / 2, 10, window.innerWidth - b.width - 10);
    bubble.style.left = (left - hr.left) + 'px';
    bubble.style.top = (top - hr.top) + 'px';
  };

  /* Шаг тура: показать пузырь у элемента и дождаться «Далее» или «Пропустить» */
  H.showStep = (el, title, text) => new Promise((res) => {
    show({ el, title, text, step: true });
    const skip = bubble.querySelector('.hb-skip');
    skip.hidden = false;
    bubble.querySelector('.hb-ok').textContent = 'Далее';
    okHandler = () => { hideBubble(); res(true); };
    skip.onclick = () => { hideBubble(); res(false); };
  });

  const isHelpUI = (t) => t.closest('.help-bar, .help-bubble, .help-btn');

  /* Перехват нажатий в режиме подсказок */
  const isControl = (t) => !!t.closest('input, select, textarea');
  const intercept = (e) => {
    if (!H.on || isHelpUI(e.target)) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    // На сенсорных экранах preventDefault у touchstart отменяет «click», поэтому
    // касания обрабатываем отдельно: обычные элементы — через click, поля ввода — по touchend.
    if (e.type === 'touchstart') { if (isControl(e.target)) e.preventDefault(); return; }
    if (e.type === 'touchend') {
      if (isControl(e.target)) { e.preventDefault(); explain(e.target); }
      return;
    }
    if (e.cancelable) e.preventDefault();
    if (e.type === 'click') explain(e.target);
  };
  const explain = (target) => {
    const tip = find(target);
    if (tip) show(tip);
    else {
      hideBubble();
      V.toast('Киви не знает, что это. Нажми на кнопку или элемент управления.');
    }
  };

  H.toggle = (on = !H.on) => {
    H.on = on;
    document.body.classList.toggle('help-mode', on);
    bar.hidden = !on;
    document.querySelectorAll('.help-btn').forEach(b => b.classList.toggle('active', on));
    if (!on) hideBubble();
    if (on && V.engine.playing) V.engine.pause();
  };

  H.init = () => {
    build();
    ['pointerdown', 'mousedown', 'touchstart', 'touchend', 'click', 'dblclick', 'dragstart', 'wheel', 'change', 'input'].forEach(ev =>
      window.addEventListener(ev, intercept, { capture: true, passive: false }));
    document.querySelectorAll('.help-btn').forEach(b => b.addEventListener('click', () => H.toggle()));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F1') { e.preventDefault(); H.toggle(); }
      else if (e.key === 'Escape' && H.on) { e.preventDefault(); e.stopImmediatePropagation(); H.toggle(false); }
    }, true);
  };

  H.TIPS = TIPS;
  return H;
})();
