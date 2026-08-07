import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'public/**'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // O layout depende da estrutura exacta do <img> (position:absolute,
      // object-fit e alvos do GSAP). next/image envolve o elemento e parte-a.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;
