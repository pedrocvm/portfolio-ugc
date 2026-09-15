/** Único lugar que sabe montar o endereço de um arquivo da Biblioteca a
 *  partir do `storage_path`. Upload novo e migração dos antigos passam por
 *  aqui — nenhum dos dois escreve o domínio do R2 à mão. Lida com o valor a
 *  cada chamada (em vez de uma constante de módulo) para o teste poder trocar
 *  a variável por caso — o bundler do Next substitui `process.env.NEXT_PUBLIC_*`
 *  onde ele aparecer no texto, não só no topo do arquivo. */
export const publicMediaUrl = (storagePath: string): string => {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('Falta NEXT_PUBLIC_R2_PUBLIC_BASE_URL.');
  return `${base}/${storagePath}`;
};

/** Os derivados AVIF/WebP existem apenas para os JPEG servidos de /img, que são
 *  gerados fora da aplicação. Média carregada pela área privada é servida tal
 *  como veio, sem derivados. */
export const hasDerivatives = (src: string) =>
  src.startsWith('/img/') && src.endsWith('.jpg');

export const derive = (src: string, ext: 'avif' | 'webp') =>
  src.replace(/\.jpg$/, `.${ext}`);

export const isVideo = (src: string) =>
  /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);

/** Um endereço só serve de retrato se apontar mesmo para um arquivo: sem
 *  isto, o destino de um link entrava como imagem e dava o ícone partido. */
export const isMedia = (src: string) =>
  /\.(jpe?g|png|webp|avif|gif|svg|mp4|webm|mov|m4v)(\?|$)/i.test(src);
