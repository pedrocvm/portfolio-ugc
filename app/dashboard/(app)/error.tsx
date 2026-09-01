'use client';

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="routeLoad">
      <p>
        Não consegui ler o conteúdo guardado. Nada foi alterado — volta a tentar
        e, se continuar, sai e entra outra vez.
      </p>
      <button className="btn" type="button" onClick={reset}>
        Tentar outra vez
      </button>
    </div>
  );
}
