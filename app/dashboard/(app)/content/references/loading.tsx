export default function ReferencesLoading() {
  return (
    <section className="sr srLoading" aria-busy="true" aria-label="Carregando referências">
      <span className="cmEyebrow">Seu repertório</span>
      <h1>Referências</h1>
      <p role="status">Buscando o que você salvou…</p>
      <div className="srSkeleton srSkeletonBar" aria-hidden="true" />
      <div className="srSkeletonGrid" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div className="srSkeletonCard" key={index}>
            <div className="srSkeleton srSkeletonMedia" />
            <div className="srSkeleton" />
            <div className="srSkeleton srSkeletonShort" />
          </div>
        ))}
      </div>
    </section>
  );
}
