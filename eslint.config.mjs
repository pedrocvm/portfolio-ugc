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
      // Um argumento que existe só para a assinatura bater certo escreve-se com
      // underscore à frente. Sem isto, a única saída era apagá-lo — e apagá-lo
      // parte quem chama.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];

export default config;
