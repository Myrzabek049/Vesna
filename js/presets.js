/* Vesna — пресеты: стили текста, фильтры, анимации, стикеры */
'use strict';

V.DEFAULT_ADJUST = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, vignette: 0 };

V.FILTERS = [
  { id: 'none',    name: 'Оригинал',  adj: {} },
  { id: 'vivid',   name: 'Сочный',    adj: { saturate: 145, contrast: 112 } },
  { id: 'warm',    name: 'Тёплый',    adj: { sepia: 25, saturate: 120, hue: -8 } },
  { id: 'cold',    name: 'Холодный',  adj: { hue: 15, saturate: 90, brightness: 104 } },
  { id: 'bw',      name: 'Ч/Б',       adj: { grayscale: 100, contrast: 115 } },
  { id: 'noir',    name: 'Нуар',      adj: { grayscale: 100, contrast: 150, brightness: 90, vignette: 60 } },
  { id: 'retro',   name: 'Ретро',     adj: { sepia: 55, contrast: 90, saturate: 80, vignette: 40 } },
  { id: 'fade',    name: 'Пастель',   adj: { contrast: 80, saturate: 75, brightness: 110 } },
  { id: 'drama',   name: 'Драма',     adj: { contrast: 135, saturate: 85, brightness: 95, vignette: 45 } },
  { id: 'spring',  name: 'Весна',     adj: { saturate: 125, hue: -12, brightness: 106 } },
  { id: 'dusk',    name: 'Закат',     adj: { sepia: 35, hue: -20, saturate: 140, contrast: 108 } },
  { id: 'dream',   name: 'Мечта',     adj: { blur: 1, brightness: 112, saturate: 115, contrast: 90 } },
];

V.ANIMS_IN = [
  { id: 'none', name: 'Нет' },
  { id: 'fade', name: 'Проявление' },
  { id: 'zoom', name: 'Приближение' },
  { id: 'pop', name: 'Пружина' },
  { id: 'slide-left', name: 'Слева' },
  { id: 'slide-right', name: 'Справа' },
  { id: 'slide-up', name: 'Снизу' },
  { id: 'spin', name: 'Вращение' },
  { id: 'blur', name: 'Из размытия' },
];
V.ANIMS_OUT = [
  { id: 'none', name: 'Нет' },
  { id: 'fade', name: 'Затухание' },
  { id: 'zoom', name: 'Отдаление' },
  { id: 'slide-left', name: 'Влево' },
  { id: 'slide-right', name: 'Вправо' },
  { id: 'slide-down', name: 'Вниз' },
  { id: 'spin', name: 'Вращение' },
  { id: 'blur', name: 'В размытие' },
];

V.FONTS = [
  { id: 'system-ui, sans-serif', name: 'Системный' },
  { id: '"Montserrat", sans-serif', name: 'Montserrat' },
  { id: '"Rubik", sans-serif', name: 'Rubik' },
  { id: '"Oswald", sans-serif', name: 'Oswald' },
  { id: '"Russo One", sans-serif', name: 'Russo One' },
  { id: '"Comfortaa", sans-serif', name: 'Comfortaa' },
  { id: '"Playfair Display", serif', name: 'Playfair Display' },
  { id: '"Lobster", cursive', name: 'Lobster' },
  { id: '"Caveat", cursive', name: 'Caveat (рукописный)' },
  { id: '"Amatic SC", cursive', name: 'Amatic SC' },
  { id: '"Press Start 2P", monospace', name: 'Press Start 2P (пиксели)' },
  { id: 'Georgia, serif', name: 'Georgia' },
  { id: '"Courier New", monospace', name: 'Courier' },
  { id: 'Impact, "Arial Black", sans-serif', name: 'Impact' },
];

V.TEXT_DEFAULT = {
  content: 'Ваш текст',
  font: 'system-ui, sans-serif',
  size: 96,
  color: '#ffffff',
  bold: true,
  italic: false,
  align: 'center',
  strokeColor: '#000000',
  strokeWidth: 0,
  bgColor: '#000000',
  bgOpacity: 0,
  shadow: 0,
  letterSpacing: 0,
  lineHeight: 1.2,
  typewriter: false,
};

V.TRANSITIONS = [
  { id: 'none', name: 'Без перехода' },
  { id: 'fade', name: 'Наплыв' },
  { id: 'black', name: 'Через чёрный' },
  { id: 'white', name: 'Вспышка' },
  { id: 'slide', name: 'Сдвиг' },
  { id: 'wipe', name: 'Шторка' },
  { id: 'zoom', name: 'Приближение' },
];

V.TEXT_PRESETS = [
  { name: 'Обычный', t: {} },
  { name: 'Заголовок', t: { size: 140, font: '"Russo One", sans-serif', strokeWidth: 6 } },
  { name: 'Субтитры', t: { size: 64, bold: false, bgOpacity: 60 }, y: 0.38 },
  { name: 'Неон', t: { color: '#9dff6e', shadow: 30, size: 110 } },
  { name: 'Плашка', t: { color: '#101413', bgColor: '#ffd84d', bgOpacity: 100, size: 80 } },
  { name: 'Контур', t: { color: '#ffffff', strokeColor: '#ff4d7a', strokeWidth: 10, size: 120 } },
  { name: 'Классика', t: { font: '"Playfair Display", serif', italic: true, bold: false, size: 100, shadow: 12 } },
  { name: 'Печатная машинка', t: { font: '"Courier New", monospace', bold: false, size: 72, color: '#f5f1e6', typewriter: true } },
  { name: 'Рукопись', t: { font: '"Caveat", cursive', bold: true, size: 120, color: '#ffe9a8' } },
  { name: 'Мягкий', t: { font: '"Comfortaa", sans-serif', size: 96, color: '#ffffff', bgColor: '#ff7eb6', bgOpacity: 90 } },
  { name: 'Ретро-игра', t: { font: '"Press Start 2P", monospace', bold: false, size: 56, color: '#7ee08a', strokeWidth: 4 } },
  { name: 'Лобстер', t: { font: '"Lobster", cursive', bold: false, size: 120, color: '#ffffff', shadow: 18 } },
];

V.STICKERS = ['😀','😂','🥹','😍','😎','🤯','🥳','😭','😡','🤔','👍','👏','🙏','💪','🔥','✨','⭐','💥','💯','❤️','💚','💙','💜','🖤','🌸','🌷','🌱','🌈','☀️','🌙','⚡','❄️','🎉','🎁','🎵','🎬','📸','🎮','⚽','🏆','🚀','✈️','🍕','🍔','☕','🍰','🐱','🐶','🦊','🐸','👀','💬','➡️','⬅️','⬆️','⬇️','✅','❌','❓','❗'];
