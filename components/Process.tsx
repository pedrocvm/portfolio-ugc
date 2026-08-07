const STEPS = [
  ['01', 'Contas-me o produto, o objetivo e onde vai o vídeo.'],
  ['02', 'Proponho o formato, a abordagem e o que preciso de receber.'],
  ['03', 'Validamos o conceito antes de gravar.'],
  ['04', 'Gravo e edito, e envias comentários sobre a primeira versão.'],
  ['05', 'Entrego o ficheiro final no formato combinado.'],
];

export default function Process() {
  return (
    <section id="processo" className="chap band" aria-label="Como funciona">
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">03</span>
          <span className="mono eyebrow">Processo</span>
          <i />
        </div>
        <div className="chapGrid split">
          <h2 className="disp">
            Como <em className="serif-it">funciona.</em>
          </h2>
          <div className="tline">
            <span className="rail" aria-hidden="true" />
            <span className="fill" aria-hidden="true" />
            <ol className="tsteps">
              {STEPS.map(([n, text]) => (
                <li key={n}>
                  <span className="node" aria-hidden="true" />
                  <span className="n mono">{n}</span>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
