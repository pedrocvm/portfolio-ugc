import { derive, hasDerivatives } from '@/lib/media';

type Props = {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  ariaHidden?: boolean;
};

export default function Pic({ src, alt, className, eager, ariaHidden }: Props) {
  const derived = hasDerivatives(src);
  return (
    <picture>
      {derived && (
        <source srcSet={derive(src, 'avif')} type="image/avif" />
      )}
      {derived && (
        <source srcSet={derive(src, 'webp')} type="image/webp" />
      )}
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
