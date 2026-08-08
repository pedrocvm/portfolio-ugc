/** Monograma CQ. A profundidade vem de cópias deslocadas do mesmo traço, a
 *  inclinação e o brilho são CSS: sem bibliotecas de animação. */
export default function Logo() {
  return (
    <span className="logo3d" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="logoSvg">
        <defs>
          <g id="cq">
            <path
              d="M40.5 17.8A15.6 15.6 0 1 0 40.5 46.2"
              fill="none"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="36.5" cy="34" r="9.6" fill="none" strokeWidth="2.4" />
            <path
              d="M43.2 40.8 49.6 47.2"
              fill="none"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
        </defs>

        <g className="logoTilt">
          <circle
            className="logoRing"
            cx="32"
            cy="32"
            r="28.6"
            fill="none"
            strokeWidth="1"
          />
          <use href="#cq" className="logoDepth" x="3" y="3" />
          <use href="#cq" className="logoDepth" x="2" y="2" />
          <use href="#cq" className="logoDepth" x="1" y="1" />
          <use href="#cq" className="logoFace" />
          <use href="#cq" className="logoShine" />
        </g>
      </svg>
    </span>
  );
}
