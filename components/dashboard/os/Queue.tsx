import type { ActionRow } from '@/modules/actions/service';
import ActionCard from './ActionCard';

/** O que precisa dela, por ordem.
 *
 *  Saiu daqui a paginação com escolha de 5, 10 ou 20 por página. Era uma
 *  preferência a manter, guardada no browser, para resolver um problema que a
 *  fila não tem: quem quer resolver o dia carrega em «Resolver agora» e nunca
 *  vê esta lista inteira. Quem quer ver, rola.
 *
 *  Saíram também os dois cabeçalhos, «Primeiro isto» e «Depois». A lista já vem
 *  ordenada pela pontuação, e o cartão já diz o risco e o atraso — os títulos
 *  repetiam isso e partiam-se quando nenhum cartão era urgente: a primeira
 *  secção ficava vazia e a segunda ficava sem nome.
 *
 *  Deixou de ser um componente cliente: não sobrou estado nenhum. */

export default function Queue({ actions }: { actions: ActionRow[] }) {
  const urgentes = actions.filter((a) => a.priorityScore >= 90).length;
  // Dizer «as 16 primeiras de 17 são urgentes» não separa nada: quando é quase
  // tudo, a frase deixa de informar e passa a ser mais uma linha a ler.
  const vaiAPena = urgentes > 0 && urgentes < actions.length * 0.7;

  return (
    <section className="osSection">
      <h2>
        Precisa de si <span className="osCount">{actions.length}</span>
      </h2>
      {vaiAPena ? (
        <p className="osNote">
          {urgentes === 1
            ? 'A primeira tem alguém à espera, ou dinheiro em risco.'
            : `As ${urgentes} primeiras têm alguém à espera, ou dinheiro em risco.`}
        </p>
      ) : null}
      <div className="osQueue">
        {actions.map((a, i) => (
          <ActionCard key={a.id} action={a} index={i} />
        ))}
      </div>
    </section>
  );
}
