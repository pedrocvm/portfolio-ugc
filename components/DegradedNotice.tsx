/** Mostrado só quando a leitura do conteúdo publicado falhou e a página caiu
 *  para DEFAULT_CONTENT. Existe para nunca repetir o incidente do R2: uma
 *  falha de backend não pode parecer, na tela, o trabalho real da Carol. */
export default function DegradedNotice() {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '0.5rem 1rem',
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.85rem',
        background: '#4d3d34',
        color: '#f7f3ee',
      }}
    >
      Não foi possível carregar o conteúdo mais recente agora — isto pode não
      estar atualizado. Atualiza a página em alguns minutos.
    </div>
  );
}
