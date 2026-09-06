/** Ajuda contextual, onde há risco real de não se entender.
 *
 *  Não é um ponto de interrogação ao lado de cada campo: seis lugares no
 *  Content Brain inteiro, e cada um responde a uma pergunta que a Carol faria
 *  em voz alta — «por que estou fazendo isso?», «o que acontece depois?».
 *
 *  `details` nativo de propósito. Abre e fecha por teclado, não prende foco,
 *  não precisa de posicionamento e não abre página nenhuma. Um popover em
 *  JavaScript aqui seria trinta linhas para o browser já fazer melhor. */
export default function HelpNote({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <details className="cbHelp">
      <summary>{question}</summary>
      <div className="cbHelpBody">{children}</div>
    </details>
  );
}
