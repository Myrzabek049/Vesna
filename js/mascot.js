/* Vesna — маскот: персонаж с каре и квадратом-«экраном» вместо лица.
   Настроение показывается на квадрате: wink, happy, wow, focus (с прогрессом), sad. */
'use strict';

V.mascot = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const LINE = '#141716';

  // Лица: белые линии на чёрном квадрате (система координат всего рисунка 0..200 × 0..230)
  const FACES = {
    wink: `
      <path d="M70 94 L85 101 L70 108"/>
      <circle cx="119" cy="99" r="10"/>
      <path d="M84 125 L113 121"/>`,
    happy: `
      <path d="M68 104 L77 94 L86 104"/>
      <path d="M110 104 L119 94 L128 104"/>
      <path d="M84 119 Q98 131 113 119"/>`,
    wow: `
      <circle cx="78" cy="99" r="9"/>
      <circle cx="119" cy="99" r="9"/>
      <circle cx="98" cy="124" r="5"/>`,
    focus: `
      <path d="M68 99 L87 99"/>
      <path d="M109 99 L128 99"/>
      <rect class="vm-track" x="72" y="117" width="52" height="8" rx="4"/>
      <rect class="vm-bar" x="72" y="117" width="0" height="8" rx="4"/>`,
    sad: `
      <circle class="vm-dot" cx="78" cy="101" r="3.5"/>
      <circle class="vm-dot" cx="119" cy="101" r="3.5"/>
      <path d="M85 126 Q98 116 112 126"/>
      <path class="vm-tear" d="M76 109 Q73 116 76 119 Q79 116 76 109"/>`,
  };

  const BODY = `
    <g class="vm-body" stroke="${LINE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M40 232 C40 196 62 178 100 176 C138 178 160 196 160 232" fill="#fff"/>
      <path d="M80 180 C88 190 112 190 120 180" fill="none"/>
      <path d="M89 140 L89 182 L111 182 L111 140" fill="#fff"/>
      <path d="M111 152 L111 180" stroke="#c9ccd6" stroke-width="5"/>
    </g>
    <g class="vm-hair" stroke="${LINE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path fill="#fff" d="M100 26 C134 26 158 46 162 80 C164 104 162 124 170 150
        L157 141 L160 158 L147 145 L145 160 L135 147 L132 158 L124 148 L112 152
        L88 152 L76 148 L68 158 L65 147 L55 160 L53 145 L40 158 L43 141 L30 150
        C38 124 36 104 38 80 C42 46 66 26 100 26 Z"/>
      <path fill="#dcdfe8" stroke="none" d="M150 70 C158 96 156 126 166 146 L156 138 C150 118 152 96 146 78 Z"/>
      <path fill="#fff" d="M40 104 L14 124 L44 114 Z"/>
      <path fill="#fff" d="M160 108 L188 134 L158 120 Z"/>
      <path fill="none" d="M100 28 L98 52"/>
      <path fill="none" d="M128 36 L148 58" stroke-width="4"/>
      <path fill="none" d="M72 40 C64 50 60 60 58 70" stroke-width="2"/>
      <path fill="none" d="M92 22 C98 16 108 16 114 22" stroke-width="2.5"/>
    </g>`;

  const css = `
    .vm{overflow:visible}
    .vm-face path,.vm-face circle{fill:none;stroke:#fff;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}
    .vm-face .vm-dot{fill:#fff;stroke:none}
    .vm-face .vm-tear{fill:#7ec8ff;stroke:none}
    .vm-face .vm-track{fill:#2a2f2d;stroke:none}
    .vm-face .vm-bar{fill:#7ee08a;stroke:none;transition:width .25s}
    .vm-float{animation:vm-float 4s ease-in-out infinite;transform-origin:50% 100%}
    .vm-head{transform-origin:100px 150px;transition:transform .3s}
    .vm[data-mood=wow] .vm-head{transform:rotate(-6deg) translateY(-3px)}
    .vm[data-mood=happy] .vm-head{animation:vm-bounce .9s ease-in-out infinite}
    .vm[data-mood=sad] .vm-head{transform:rotate(5deg) translateY(4px)}
    .vm[data-mood=focus] .vm-head{transform:rotate(-2deg)}
    .vm-shake .vm-head{animation:vm-shake .5s}
    @keyframes vm-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
    @keyframes vm-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px) rotate(3deg)}}
    @keyframes vm-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}50%{transform:rotate(7deg)}75%{transform:rotate(-4deg)}}
    @media (prefers-reduced-motion: reduce){.vm-float,.vm[data-mood=happy] .vm-head{animation:none}}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  /* Создать маскота. size — ширина в пикселях. */
  const create = (mood = 'wink', size = 120, { float = true, title = 'Киви, маскот Vesna' } = {}) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 232');
    svg.setAttribute('width', size);
    svg.setAttribute('height', Math.round(size * 232 / 200));
    svg.setAttribute('class', 'vm');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
    svg.innerHTML = `<g class="${float ? 'vm-float' : ''}">${BODY}
      <g class="vm-head">
        <rect x="52" y="58" width="96" height="94" rx="7" fill="#101211" stroke="${LINE}" stroke-width="2" transform="rotate(-5 100 105)"/>
        <rect x="56" y="62" width="88" height="14" rx="5" fill="#fff" opacity=".06" transform="rotate(-5 100 105)"/>
        <g class="vm-face" transform="rotate(-5 100 105)"></g>
      </g></g>`;
    // нажатие — персонаж встряхивает головой
    svg.addEventListener('click', () => {
      svg.classList.remove('vm-shake');
      void svg.getBoundingClientRect();
      svg.classList.add('vm-shake');
    });
    set(svg, mood);
    return svg;
  };

  const set = (svg, mood) => {
    if (!svg || svg.dataset.mood === mood) return;
    svg.dataset.mood = mood;
    svg.querySelector('.vm-face').innerHTML = FACES[mood] || FACES.wink;
  };

  /* Прогресс на «экране» в настроении focus (0..1) */
  const progress = (svg, p) => {
    const bar = svg && svg.querySelector('.vm-bar');
    if (bar) bar.setAttribute('width', (52 * Math.max(0, Math.min(1, p))).toFixed(1));
  };

  return { create, set, progress, FACES };
})();
