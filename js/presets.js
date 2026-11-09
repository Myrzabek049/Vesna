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
  { id: 'Arial, Helvetica, sans-serif', name: 'Arial' },
  { id: 'Georgia, serif', name: 'Georgia' },
  { id: '"Times New Roman", serif', name: 'Times' },
  { id: '"Courier New", monospace', name: 'Courier' },
  { id: 'Impact, "Arial Black", sans-serif', name: 'Impact' },
  { id: '"Trebuchet MS", sans-serif', name: 'Trebuchet' },
  { id: '"Comic Sans MS", cursive', name: 'Рукописный' },
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
};

V.TEXT_PRESETS = [
  { name: 'Обычный', t: {} },
  { name: 'Заголовок', t: { size: 140, font: 'Impact, "Arial Black", sans-serif', strokeWidth: 6 } },
  { name: 'Субтитры', t: { size: 64, bold: false, bgOpacity: 60 }, y: 0.38 },
  { name: 'Неон', t: { color: '#9dff6e', shadow: 30, size: 110 } },
  { name: 'Плашка', t: { color: '#101413', bgColor: '#ffd84d', bgOpacity: 100, size: 80 } },
  { name: 'Контур', t: { color: '#ffffff', strokeColor: '#ff4d7a', strokeWidth: 10, size: 120 } },
  { name: 'Классика', t: { font: 'Georgia, serif', italic: true, bold: false, size: 100, shadow: 12 } },
  { name: 'Печатная машинка', t: { font: '"Courier New", monospace', bold: false, size: 72, color: '#f5f1e6' } },
];

V.STICKERS = ['😀','😂','🥹','😍','😎','🤯','🥳','😭','😡','🤔','👍','👏','🙏','💪','🔥','✨','⭐','💥','💯','❤️','💚','💙','💜','🖤','🌸','🌷','🌱','🌈','☀️','🌙','⚡','❄️','🎉','🎁','🎵','🎬','📸','🎮','⚽','🏆','🚀','✈️','🍕','🍔','☕','🍰','🐱','🐶','🦊','🐸','👀','💬','➡️','⬅️','⬆️','⬇️','✅','❌','❓','❗'];
