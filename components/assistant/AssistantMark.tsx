/** A marca do Carol AI.
 *
 *  Um balão de conversa dizia «isto é um chatbot» e não dizia nada sobre ela.
 *  A casa dela já tem um vocabulário: a letra manuscrita e a pena que a
 *  desenha. Isto é a inicial na mesma letra, dentro de um traço fechado à mão —
 *  raios desiguais, apoios ligeiramente fora, e a abertura onde a caneta
 *  levantou. */
export default function AssistantMark({ state }: { state: 'idle' | 'busy' }) {
  return (
    <span className="aiMark" data-state={state} aria-hidden="true">
      <svg viewBox="0 0 44 44" focusable="false">
        <path
          className="aiMarkRing"
          d="M23.4 4.6c9.3.3 16.7 7.2 16.6 16.1-.1 9.8-7.9 18.6-18.4 18.7C11.6 39.5 4.1 32.2 4.4 22.3 4.7 13 11.7 5.4 21 4.6"
        />
      </svg>
      <b>C</b>
    </span>
  );
}
