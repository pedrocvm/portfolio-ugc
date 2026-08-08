type Props = {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  ariaHidden?: boolean;
};

/** <picture> com AVIF/WebP e o JPEG como recurso. Os derivados vivem ao lado do
 *  original, com o mesmo nome. */
export default function Pic({ src, alt, className, eager, ariaHidden }: Props) {
  const base = src.replace(/\.jpg$/, '');
  return (
    <picture>
      <source srcSet={`${base}.avif`} type="image/avif" />
      <source srcSet={`${base}.webp`} type="image/webp" />
      <img
        src={src}
        alt={alt}
        className={className}
        aria-hidden={ariaHidden}
        loading={eager ? undefined : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  );
}
