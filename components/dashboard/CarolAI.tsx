/** O selo da CarolAI. Discreto, e só onde o modelo trabalhou de verdade —
 *  um rascunho escrito, uma leitura de conversa, uma estrutura montada.
 *
 *  Um selo em todas as telas seria decoração; a CarolAI não é uma marca a
 *  promover, é uma autoria a assumir. E a grafia é fixa: «CarolAI», nunca
 *  passada a maiúsculas por um `text-transform` de eyebrow. */
export default function CarolAI({ what }: { what?: string }) {
  return (
    <span className="aiBadge" title={what ? `${what} pela CarolAI` : 'Pela CarolAI'}>
      <i aria-hidden="true" />
      Powered by CarolAI
    </span>
  );
}
