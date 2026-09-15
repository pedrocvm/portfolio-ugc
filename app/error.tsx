'use client';

/** Fronteira de erro do site público. Antes desta correção uma falha real de
 *  backend (o 402 do Storage, por exemplo) não chegava aqui: content-store.ts
 *  engolia o erro e devolvia DEFAULT_CONTENT, que parecia conteúdo publicado
 *  de verdade. Agora a falha sobe até aqui, e a tela diz que algo falhou em
 *  vez de fingir que é a versão real da Carol. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#f7f3ee',
        color: '#2e2c2a',
      }}
    >
      <p style={{ fontSize: '1.1rem', maxWidth: '32rem' }}>
        Não foi possível carregar o site agora. Não é uma versão antiga nem
        perdida — é uma falha temporária ao ler o conteúdo. Tenta de novo em
        alguns minutos.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          padding: '0.6rem 1.2rem',
          borderRadius: '0.4rem',
          border: '1px solid #4d3d34',
          background: 'transparent',
          color: '#2e2c2a',
          cursor: 'pointer',
        }}
      >
        Tentar de novo
      </button>
    </div>
  );
}
