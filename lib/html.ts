/** Entidades HTML para texto.
 *
 *  Vive aqui, e não dentro do cliente do Gmail, porque tem dois clientes: o
 *  corpo em HTML de um email, e o `snippet` que a API do Gmail devolve já
 *  escapado mesmo quando a mensagem é texto simples. Só o primeiro passava por
 *  uma descodificação, e era por isso que a Inbox mostrava
 *  «I&#39;m sharing my portfolio» e endereços dentro de «&lt;…&gt;».
 *
 *  O `&amp;` é o último de propósito. Descodificando primeiro, «&amp;lt;»
 *  virava «&lt;» e à passagem seguinte virava «<» — texto que o remetente
 *  escreveu à mão a transformar-se em marcação. */
export const decodeEntities = (text: string) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#0*(\d{2,5});/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, '&');
