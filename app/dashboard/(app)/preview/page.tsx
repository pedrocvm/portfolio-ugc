import PreviewFrame from '@/components/dashboard/PreviewFrame';

export const dynamic = 'force-dynamic';

export default function PreviewPage() {
  return (
    <>
      <div className="dashBar">
        <h1>Pré-visualização</h1>
        <span className="dashState">Rascunho · fora do ar</span>
        <a className="btn quiet" href="/preview" target="_blank" rel="noopener">
          Abrir em separado
        </a>
        <a className="btn" href="/" target="_blank" rel="noopener">
          Ver site publicado
        </a>
      </div>
      <PreviewFrame />
    </>
  );
}
