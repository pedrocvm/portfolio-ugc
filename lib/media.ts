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
