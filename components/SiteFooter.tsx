import { IMAGES, INSTAGRAM, WHATSAPP } from '@/lib/site';

export default function SiteFooter() {
  return (
    <footer
      id="fim"
      className="scene on-dark"
      data-bg="#2e2c2a"
      data-mode="dark"
    >
      <div className="wrap">
        <div className="fimGrid">
          <figure className="fimShot">
            <img
              src={IMAGES.footer}
              alt="Retrato de Carol Queiroz ao fim da tarde"
            />
            <figcaption className="mono">
              Fig. 03 · Carol Queiroz<i />
              Lisboa
            </figcaption>
          </figure>
          <div>
            <p className="mono ey">Fim da sessão</p>
            <h2 className="disp">
              Diz-me o que precisas de <em className="script">gravar.</em>
            </h2>
            <p className="lead">
              Não precisas de trazer briefing nem guião. Ajuda se me disseres a
              marca, o produto, o tipo de vídeo, quantos e para onde vão.
            </p>
            <a
              className="cta-btn"
              href={WHATSAPP}
              target="_blank"
              rel="noopener"
            >
              Contar o que precisas gravar
            </a>
            <p className="ig">
              Ou manda mensagem no Instagram,{' '}
              <a href={INSTAGRAM} target="_blank" rel="noopener">
                @carolxqueiroz
              </a>
            </p>
          </div>
        </div>
        <div className="fimBar mono">
          <span>Carol Queiroz · UGC Creator</span>
          <span>Lisboa · © 2026</span>
        </div>
      </div>
    </footer>
  );
}
