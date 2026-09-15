/** Compartilhado entre o campo de upload (cliente) e a rota que assina o
 *  upload (servidor): os dois têm de aplicar o mesmo teto, ou o cliente
 *  aceita um arquivo que o servidor depois rejeita sem explicação. */

/** Teto de upload. Não é mais o do plano gratuito do Supabase — é só um
 *  limite razoável para o que este projeto sobe. Ajustar aqui move os dois
 *  lados de uma vez. */
export const MAX_UPLOAD = 50 * 1024 * 1024;
/** O que ela pode escolher: acima disto o navegador engasga-se a descodificar. */
export const MAX_PICK = 100 * 1024 * 1024;
/** Acima disto o vídeo é reencodado antes de subir. */
export const COMPRESS_OVER = 4 * 1024 * 1024;

export const mb = (n: number) => Math.round(n / 1024 / 1024);

/** Mesmo slug em cliente e servidor: o cliente só usa isto para mostrar o
 *  nome; quem decide o caminho final gravado é sempre o servidor, em
 *  app/api/media/upload/route.ts. */
export const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9.]+/g, '-')
    .toLowerCase();
