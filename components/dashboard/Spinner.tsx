/** Um arco fino a girar. O traço encurta e alonga enquanto roda, o que dá a
 *  sensação de progresso sem fingir uma porcentagem que não sabemos. */
export default function Spinner({ label }: { label?: string }) {
  return (
    <span className="spin" role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle className="spinTrack" cx="12" cy="12" r="9" />
        <circle className="spinArc" cx="12" cy="12" r="9" />
      </svg>
      <span className="visually-hidden">{label ?? 'Carregando'}</span>
    </span>
  );
}
