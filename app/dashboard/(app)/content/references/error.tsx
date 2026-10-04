'use client';

export default function ReferencesError({ reset }: { reset: () => void }) {
  return (
    <section className="sr srRouteError" role="alert">
      <span className="cmEyebrow">Referências</span>
      <h1>Não foi possível abrir seus salvos.</h1>
      <p>Confira sua conexão e tente novamente. Se continuar, a configuração desta área precisa ser verificada.</p>
      <button className="cmPrimary" type="button" onClick={reset}>Tentar novamente</button>
    </section>
  );
}
