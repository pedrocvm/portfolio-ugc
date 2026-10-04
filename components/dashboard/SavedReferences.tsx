'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  useCallback, useEffect, useId, useRef, useState,
  type FormEvent, type ReactNode,
} from 'react';
import {
  attachReferenceMediaAction,
  cancelReferenceUploadAction,
  completeReferenceUploadAction,
  createReferenceAction,
  createReferenceConnectionAction,
  createReferenceDraftAction,
  deleteReferenceAction,
  getReferenceAction,
  listReferenceScreenAction,
  retryReferenceAction,
  saveReferenceSettingsAction,
  setReferenceConnectionEnabledAction,
  updateReferenceAction,
} from '@/app/dashboard/reference-actions';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { ContentPillar } from '@/modules/content-board/domain';
import {
  ASSET_MIMES, MAX_ASSETS, MAX_ASSET_BYTES, MAX_TOTAL_BYTES, REFERENCE_BUCKET,
  REFERENCE_STATUSES, STATUS_LABELS, ZONES, ZONE_LABELS, canonicalInstagramUrl,
  connectionState, draftFromAnalysis, draftSchema, intakeSchema,
  type AssetSpec, type IntakeResult, type ReferenceConnection,
  type ReferenceDraft, type ReferenceScreen, type ReferenceStatus,
  type ReferenceZone, type SavedReference, type UploadTarget,
} from '@/modules/saved-references/domain';

const CONNECTOR_GUIDE = 'https://github.com/pedrocvm/portfolio-ugc/blob/main/docs/instagram-saved-references.md';
const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short',
});
const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const MEDIA_LABELS = { reel: 'Reel', carousel: 'Carrossel', image: 'Imagem', unknown: 'Post' };
const CONNECTION_LABELS = {
  unconfigured: 'Pasta ainda não conectada', waiting: 'Aguardando o conector',
  connected: 'Conector ativo', paused: 'Sincronização pausada',
  offline: 'Conector sem sinal', error: 'Conexão precisa de atenção',
};
const CONNECTION_ERRORS: Record<string, string> = {
  instagram_action_required: 'O Instagram pediu uma confirmação na sua conta. Abra o app oficial, conclua a verificação e renove o login no conector seguindo o guia.',
  instagram_two_factor_required: 'O Instagram pediu seu código de autenticação. Conclua o login pelo conector seguindo o guia.',
  instagram_rate_limited: 'O Instagram limitou as consultas. O conector vai aguardar antes de tentar novamente.',
  instagram_temporarily_unavailable: 'O Instagram está indisponível no momento. O conector manteve o progresso para continuar depois.',
  instagram_collection_not_found: 'A coleção não foi encontrada. Confira se ela existe nos Salvos do Instagram e se o nome corresponde ao configurado aqui.',
  instagram_collection_mismatch: 'A coleção mudou ou não foi encontrada. Confira o nome da pasta no Instagram e atualize a configuração do conector.',
  instagram_account_mismatch: 'A sessão do conector está vinculada a outra conta. Confira a conta conectada pelo conector.',
  instagram_session_missing: 'A sessão do Instagram precisa ser renovada no conector. Siga a etapa de login no guia.',
  login_required: 'Entre no Instagram pelo conector seguindo a etapa de login do guia de instalação.',
  setup_required: 'Conclua a instalação do conector seguindo o guia antes de iniciar a sincronização.',
  cms_connection_refused: 'A conexão foi recusada. Confira se a sincronização está ativa e se o conector usa a chave mais recente.',
  media_unavailable: 'Um material salvo não pôde ser acessado. Ele continua na fila do conector para uma nova tentativa.',
  reference_pending_retry: 'Algumas referências ainda estão na fila do conector e serão enviadas em uma nova tentativa.',
  media_temporarily_unavailable: 'O Instagram não entregou um dos arquivos agora. A referência continua na fila do conector.',
  network_unavailable: 'A conexão de internet do conector falhou. O progresso foi mantido para continuar depois.',
  network_timeout: 'A conexão demorou a responder. O conector manteve o progresso para a próxima tentativa.',
  upload_temporarily_unavailable: 'Um envio de arquivos foi interrompido. O conector vai retomar o material pendente.',
  instagram_client_incompatible: 'O Instagram mudou uma resposta usada pelo conector. A integração precisa de revisão antes de continuar.',
};

function connectionErrorText(value: string) {
  return CONNECTION_ERRORS[value] || (/^[a-z][a-z0-9_.-]+$/.test(value)
    ? 'O conector encontrou um problema e manteve o progresso. Consulte a mensagem do conector e o guia de instalação.'
    : value);
}

type IconName = 'bookmark' | 'arrow' | 'plus' | 'search' | 'link' | 'upload' | 'check' | 'play' | 'copy' | 'close';
function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    bookmark: <path d="M6 4h12v17l-6-4-6 4V4Z" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    link: <><path d="m9 15 6-6M9 8l2-2a4 4 0 0 1 6 6l-2 2M15 16l-2 2a4 4 0 0 1-6-6l2-2" /></>,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    play: <path d="m9 5 11 7-11 7V5Z" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="1" /><path d="M15 8V3H3v13h5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function dateLabel(value: string | null, withTime = false) {
  if (!value) return 'Ainda não aconteceu';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : (withTime ? TIME_FORMAT : DATE_FORMAT).format(date);
}

function brief(value: string, max = 170) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function titleFor(reference: SavedReference) {
  return reference.analysis?.title || reference.title || brief(reference.caption, 82) || 'Uma nova referência';
}

function displayedStatus(reference: SavedReference) {
  return reference.uploadBatchId ? 'upload_pending' : reference.status;
}

function statusLabel(reference: SavedReference) {
  return reference.uploadBatchId ? 'Envio pendente' : STATUS_LABELS[reference.status];
}

function fileSpecs(files: File[]): AssetSpec[] {
  return files.map((file) => ({ mimeType: file.type as AssetSpec['mimeType'], size: file.size }));
}

function validateFiles(files: File[]) {
  if (files.length > MAX_ASSETS) return `Você pode enviar até ${MAX_ASSETS} arquivos por referência.`;
  for (const file of files) {
    if (!(ASSET_MIMES as readonly string[]).includes(file.type)) return `O formato de ${file.name} não é aceito. Use uma das opções indicadas abaixo.`;
    if (!file.size) return `O arquivo ${file.name} está vazio.`;
    if (file.size > MAX_ASSET_BYTES) return `O arquivo ${file.name} precisa ter até 50 MB.`;
  }
  return files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES
    ? 'Os arquivos juntos precisam ter até 80 MB.' : '';
}

type UploadSession = { result: IntakeResult & { uploadBatchId?: string | null }; sent: Set<number> };
async function uploadFiles(session: UploadSession, files: File[], onProgress: (value: string) => void) {
  const storage = supabaseBrowser().storage.from(REFERENCE_BUCKET);
  for (let position = 0; position < session.result.uploads.length; position++) {
    const target = session.result.uploads[position] as UploadTarget & { index?: number };
    const index = target.index ?? position;
    if (session.sent.has(index)) continue;
    const file = files[index];
    if (!file || file.type !== target.mimeType || file.size !== target.size) {
      throw new Error('Os arquivos mudaram durante o envio. Feche esta janela e anexe o material novamente na referência salva.');
    }
    onProgress(`Enviando arquivo ${position + 1} de ${session.result.uploads.length}…`);
    const { error } = await storage.uploadToSignedUrl(target.path, target.token, file, { contentType: target.mimeType });
    if (error) throw new Error('O envio foi interrompido. Confira sua conexão e use Retomar envio para continuar.');
    session.sent.add(index);
  }
  onProgress('Conferindo os arquivos…');
  const complete = await completeReferenceUploadAction(session.result.id, session.result.uploadBatchId);
  if (!complete.ok) throw new Error(complete.error);
}

function FilePicker({ files, onChange, disabled = false }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const inputId = useId();
  const helpId = useId();
  const [error, setError] = useState('');
  return (
    <div className="srFilePicker">
      <label className="srUploadTarget" htmlFor={inputId} data-disabled={disabled || undefined}>
        <Icon name="upload" />
        <span><strong>Adicionar vídeo, imagens ou áudio</strong><small>Selecione os arquivos no seu dispositivo</small></span>
        <input id={inputId} type="file" multiple accept={ASSET_MIMES.join(',')} disabled={disabled} aria-describedby={helpId} onChange={(event) => {
          const next = [...files, ...Array.from(event.target.files ?? [])];
          const issue = validateFiles(next);
          setError(issue);
          if (!issue) onChange(next);
          event.target.value = '';
        }} />
      </label>
      <p className="srHint" id={helpId}>Até 10 arquivos, 50 MB por arquivo e 80 MB no total. Vídeo MP4, MOV ou WEBM. Imagem JPG, PNG ou WEBP. Áudio MP3, M4A, WAV, WEBM ou OGG.</p>
      {files.length ? <ul className="srFiles">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span>{file.name}<small>{(file.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</small></span><button type="button" disabled={disabled} aria-label={`Remover ${file.name}`} onClick={() => { onChange(files.filter((_, position) => position !== index)); setError(''); }}><Icon name="close" /></button></li>)}</ul> : null}
      {error ? <p className="srError" role="alert">{error}</p> : null}
    </div>
  );
}

function ReferenceDialog({ title, eyebrow, children, busy, onClose }: {
  title: string; eyebrow: string; children: ReactNode; busy: boolean; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [title]);
  return (
    <dialog className="srDialog" ref={ref} aria-labelledby={titleId} aria-modal="true" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="srDrawer">
        <header className="srDrawerHead">
          <div><span className="cmEyebrow">{eyebrow}</span><h2 ref={heading} id={titleId} tabIndex={-1}>{title}</h2></div>
          <button type="button" className="srIconButton" disabled={busy} aria-label="Fechar janela" onClick={onClose}><Icon name="close" /></button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function AddReference({ collectionName, onSaved, onBusy }: { collectionName: string; onSaved: (id: string, duplicate?: boolean) => void; onBusy: (busy: boolean) => void }) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [collection, setCollection] = useState(collectionName);
  const [caption, setCaption] = useState('');
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const upload = useRef<UploadSession | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError('');
    const parsed = intakeSchema.safeParse({ sourceUrl, collectionName: collection, caption, transcript, notes, assets: fileSpecs(files) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Confira os campos antes de salvar.'); return; }
    setPending(true); onBusy(true);
    try {
      const resuming = !!upload.current;
      setProgress(resuming ? 'Conferindo o envio anterior…' : 'Salvando sua referência…');
      const result = await createReferenceAction(parsed.data);
      if (!result.ok) throw new Error(result.error);
      if (result.duplicate && !result.uploads.length) { onSaved(result.id, !resuming); return; }
      upload.current = { result, sent: new Set() };
      setLocked(true);
      if (upload.current.result.uploads.length) await uploadFiles(upload.current, files, setProgress);
      onSaved(upload.current.result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar agora. Tente novamente.');
    } finally { setPending(false); onBusy(false); setProgress(''); }
  };
  return (
    <form className="srForm" onSubmit={submit} aria-busy={pending}>
      <p className="srIntro">Cole o link do que você salvou. O vídeo, as imagens ou a transcrição ajudam a analisar o conteúdo de verdade.</p>
      <fieldset disabled={pending || locked}>
        <label><span>Link do Instagram</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.instagram.com/reel/…" autoComplete="off" required maxLength={2048} /></label>
        <label><span>Coleção</span><input value={collection} onChange={(event) => setCollection(event.target.value)} required maxLength={100} /></label>
        <label><span>O que chamou sua atenção <small>opcional</small></span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={6000} placeholder="O gancho, uma cena, o jeito de contar a história…" /></label>
      </fieldset>
      <FilePicker files={files} onChange={setFiles} disabled={pending || locked} />
      <details className="srDisclosure srSourceInputs">
        <summary>Já tenho a legenda ou a transcrição <span aria-hidden="true">+</span></summary>
        <fieldset disabled={pending || locked}>
          <label><span>Legenda do post <small>opcional</small></span><textarea rows={5} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={30000} placeholder="O texto publicado junto ao conteúdo" /></label>
          <label><span>Transcrição da fala <small>opcional</small></span><textarea rows={6} value={transcript} onChange={(event) => setTranscript(event.target.value)} maxLength={60000} placeholder="O que é falado no vídeo, palavra por palavra" /></label>
          <p className="srHint">A legenda fica separada da fala. Se o áudio não estiver disponível, isso aparecerá na referência.</p>
        </fieldset>
      </details>
      {error ? <p className="srError" role="alert">{error}</p> : null}
      {progress ? <p className="srProgressText" role="status">{progress}</p> : null}
      <footer className="srFormFooter"><p>A referência entra na análise assim que o material estiver disponível.</p><button className="cmPrimary" disabled={pending} type="submit">{pending ? 'Salvando…' : locked ? 'Retomar envio' : 'Salvar referência'}<Icon name={pending ? 'upload' : 'arrow'} /></button></footer>
    </form>
  );
}

function ReferenceMedia({ reference, compact = false, index = 0 }: { reference: SavedReference; compact?: boolean; index?: number }) {
  const [failed, setFailed] = useState(false);
  const first = reference.assets[index];
  const source = `/api/references/${reference.id}/media?index=${index}&v=${encodeURIComponent(first?.path || 'none')}`;
  if (!first || failed || (compact && !first.mimeType.startsWith('image/'))) {
    return <div className={`srMediaPlaceholder ${compact ? 'srMediaCompact' : ''}`} aria-hidden="true"><Icon name={reference.mediaKind === 'reel' ? 'play' : 'bookmark'} /><span>{MEDIA_LABELS[reference.mediaKind]}</span></div>;
  }
  if (first.mimeType.startsWith('image/')) return <Image src={source} alt={compact ? '' : reference.visualDescription ? brief(reference.visualDescription, 240) : 'Imagem enviada como referência'} width={680} height={800} unoptimized className={compact ? 'srThumb' : 'srFullImage'} onError={() => setFailed(true)} />;
  if (first.mimeType.startsWith('video/')) return <video className="srVideo" src={source} controls playsInline preload="metadata" aria-label="Vídeo da referência. A transcrição disponível aparece abaixo, na seção Transcrição da fala." onError={() => setFailed(true)} />;
  return <audio className="srAudio" src={source} controls preload="metadata" onError={() => setFailed(true)} />;
}

function ReferenceGallery({ reference }: { reference: SavedReference }) {
  const [index, setIndex] = useState(0);
  if (!reference.assets.length) return null;
  const activeIndex = Math.min(index, reference.assets.length - 1);
  return <div className="srGallery"><ReferenceMedia key={reference.assets[activeIndex].path} reference={reference} index={activeIndex} />{reference.assets.length > 1 ? <div className="srGalleryNav" aria-label="Arquivos da referência">{reference.assets.map((asset, position) => <button key={asset.path} type="button" aria-pressed={position === activeIndex} onClick={() => setIndex(position)} aria-label={`Ver arquivo ${position + 1}`}>{String(position + 1).padStart(2, '0')}</button>)}</div> : null}</div>;
}

function TextList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  if (!items.length) return null;
  const Tag = ordered ? 'ol' : 'ul';
  return <Tag className={ordered ? 'srOrderedList' : 'srTextList'}>{items.map((item, index) => <li key={`${index}-${item.slice(0, 30)}`}>{item}</li>)}</Tag>;
}

function AnalysisContent({ reference, pillars, onDraft }: { reference: SavedReference; pillars: ContentPillar[]; onDraft: () => void }) {
  const analysis = reference.analysis;
  if (!analysis) return (
    <div className="srPendingAnalysis">
      <span className="srPendingMark" aria-hidden="true"><Icon name="bookmark" /></span>
      <h3>{reference.uploadBatchId ? 'Seu envio está incompleto.' : reference.status === 'processing' ? 'Seu material está em análise.' : reference.status === 'queued' ? 'Sua referência está na fila.' : 'Falta material para a análise.'}</h3>
      <p>{reference.uploadBatchId ? 'Abra Conteúdo original para retomar o envio dos arquivos ou cancelar o lote pendente.' : reference.status === 'processing' || reference.status === 'queued' ? 'A explicação e a aplicação para sua rotina vão aparecer aqui quando o processamento terminar.' : 'Abra Conteúdo original para adicionar o vídeo, as imagens, a legenda ou a transcrição. A análise usa apenas o que foi recebido.'}</p>
      {reference.lastError ? <p className="srError">{reference.lastError}</p> : null}
    </div>
  );
  const adaptation = analysis.adaptation;
  const pillar = pillars.find((item) => item.id === adaptation.pillarId);
  return (
    <div className="srAnalysis">
      <section className="srAnalysisSection"><span className="srSectionIndex">01</span><h3>O que esse conteúdo faz</h3><p className="srProse">{analysis.explanation}</p>{analysis.hook ? <blockquote><span>O gancho</span><p>{analysis.hook}</p></blockquote> : null}{analysis.structure.length ? <><h4>Como a história se organiza</h4><TextList items={analysis.structure} ordered /></> : null}{analysis.whyItWorks ? <><h4>A leitura da estrutura</h4><p className="srProse">{analysis.whyItWorks}</p></> : null}<p className="srHint">Esta leitura identifica escolhas do conteúdo. Ela não confirma alcance, vendas ou desempenho.</p></section>
      <section className="srAdaptation"><span className="srSectionIndex">02</span><h3>Como isso cabe no seu conteúdo</h3><dl className="srVariables"><div><dt>Tema central</dt><dd>{pillar?.name || 'Escolha ao revisar'}</dd></div><div><dt>Assunto</dt><dd>{adaptation.subject}</dd></div><div><dt>Zona</dt><dd>{adaptation.zone ? `${adaptation.zone} · ${ZONE_LABELS[adaptation.zone]}` : 'Escolha ao revisar'}</dd></div><div><dt>Formato</dt><dd>{adaptation.format || 'Escolha ao revisar'}</dd></div></dl>{adaptation.angle ? <p className="srProse">{adaptation.angle}</p> : null}{adaptation.whyItFits ? <p className="srProse">{adaptation.whyItFits}</p> : null}{adaptation.hook ? <blockquote><span>Um gancho para você revisar</span><p>{adaptation.hook}</p></blockquote> : null}{adaptation.outline.length ? <><h4>Um caminho para o roteiro</h4><TextList items={adaptation.outline} ordered /></> : null}</section>
      {adaptation.recordingPlan.length || adaptation.effort ? <section className="srAnalysisSection"><span className="srSectionIndex">03</span><h3>Na hora de gravar</h3><TextList items={adaptation.recordingPlan} ordered />{adaptation.effort ? <p className="srEffort">{adaptation.effort}</p> : null}</section> : null}
      {analysis.transferableElements.length || adaptation.whatToAvoid.length ? <section className="srAnalysisSection"><h3>O que vale levar com você</h3><TextList items={analysis.transferableElements} />{adaptation.whatToAvoid.length ? <><h4>O que evitar na adaptação</h4><TextList items={adaptation.whatToAvoid} /></> : null}</section> : null}
      {adaptation.needsConfirmation.length ? <section className="srConfirmation"><h3>Confirme antes de seguir</h3><TextList items={adaptation.needsConfirmation} /></section> : null}
      {analysis.limitations.length ? <section className="srLimitations"><h4>O que não foi possível verificar</h4><TextList items={analysis.limitations} /></section> : null}
      <div className="srDraftCta"><div><h3>Faça essa ideia ser sua.</h3><p>Revise o tema, o gancho e o roteiro. Você escolhe a data antes de salvar no calendário.</p></div>{reference.contentBoardItemId ? <Link className="cmGhostBtn" href="/dashboard/content">Abrir calendário<Icon name="arrow" /></Link> : <button className="cmPrimary" type="button" onClick={onDraft}>Transformar em rascunho<Icon name="arrow" /></button>}</div>
    </div>
  );
}

function SourceEditor({ reference, onSaved, onCancel, onBusy }: { reference: SavedReference; onSaved: () => Promise<void>; onCancel: () => void; onBusy: (busy: boolean) => void }) {
  const [caption, setCaption] = useState(reference.caption);
  const [transcript, setTranscript] = useState(reference.transcript);
  const [notes, setNotes] = useState(reference.notes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); onBusy(true); setError('');
    try {
      const result = await updateReferenceAction(reference.id, { caption, transcript, notes });
      if (!result.ok) throw new Error(result.error);
      await onSaved(); onCancel();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar os textos.'); }
    finally { setPending(false); onBusy(false); }
  };
  return <form className="srForm srInlineForm" onSubmit={submit} aria-busy={pending}><fieldset disabled={pending}><label><span>Legenda do post</span><textarea rows={5} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={30000} /></label><label><span>Transcrição da fala</span><textarea rows={8} value={transcript} onChange={(event) => setTranscript(event.target.value)} maxLength={60000} /></label><label><span>O que chamou sua atenção</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={6000} /></label></fieldset><p className="srHint">Ao salvar, a referência volta para análise com o material atualizado.</p>{error ? <p className="srError" role="alert">{error}</p> : null}<div className="srButtonRow"><button className="cmGhostBtn" type="button" disabled={pending} onClick={onCancel}>Cancelar</button><button className="cmPrimary" disabled={pending} type="submit">{pending ? 'Salvando…' : 'Salvar textos e analisar'}</button></div></form>;
}

function AttachMedia({ reference, onSaved, onBusy }: { reference: SavedReference; onSaved: () => Promise<void>; onBusy: (busy: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const upload = useRef<UploadSession | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !files.length) return;
    setPending(true); onBusy(true); setError(''); setSuccess('');
    try {
      setProgress(upload.current ? 'Conferindo o envio anterior…' : 'Preparando o envio…');
      const result = await attachReferenceMediaAction(reference.id, fileSpecs(files), upload.current?.result.uploadBatchId || reference.uploadBatchId);
      if (!result.ok) throw new Error(result.error);
      upload.current = { result, sent: new Set() }; setLocked(true);
      if (upload.current.result.uploads.length) await uploadFiles(upload.current, files, setProgress);
      await onSaved();
      upload.current = null; setFiles([]); setLocked(false); setSuccess('Material recebido. A análise será atualizada.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o material.'); }
    finally { setPending(false); onBusy(false); setProgress(''); }
  };
  const cancel = async () => {
    const batch = upload.current?.result.uploadBatchId || reference.uploadBatchId;
    if (!batch || pending) return;
    setPending(true); onBusy(true); setError(''); setSuccess(''); setProgress('Cancelando o envio pendente…');
    try {
      const result = await cancelReferenceUploadAction(reference.id, batch);
      if (!result.ok) throw new Error(result.error);
      upload.current = null; setFiles([]); setLocked(false);
      await onSaved(); setSuccess('Envio cancelado. O que já estava salvo foi mantido.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar o envio.'); }
    finally { setPending(false); onBusy(false); setProgress(''); }
  };
  return (
    <details className="srDisclosure" open={reference.uploadBatchId ? true : undefined}>
      <summary>{reference.uploadBatchId ? 'Retomar envio pendente' : reference.assets.length ? 'Enviar outro material' : 'Adicionar o material original'}<span aria-hidden="true">+</span></summary>
      <form className="srInlineForm" onSubmit={submit} aria-busy={pending}>
        {reference.uploadBatchId ? <>
          <p className="srHint">Selecione os mesmos arquivos do envio interrompido, na mesma ordem. Para trocar o material, cancele este envio primeiro.</p>
          {reference.pendingAssets.length ? <ol className="srPendingFiles">{reference.pendingAssets.map((asset, index) => <li key={asset.path}>Arquivo {index + 1} · {asset.mimeType.split('/')[1].toUpperCase()} · {(asset.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</li>)}</ol> : null}
        </> : <p className="srHint">Os arquivos enviados aqui passam a ser o material desta referência. Envie todas as partes que quer incluir na análise.</p>}
        <FilePicker files={files} onChange={setFiles} disabled={pending || locked} />
        {error ? <p className="srError" role="alert">{error}</p> : null}
        {success ? <p className="srSuccess" role="status">{success}</p> : null}
        {progress ? <p className="srProgressText" role="status">{progress}</p> : null}
        <div className="srButtonRow">
          <button className="cmPrimary" disabled={pending || !files.length} type="submit">{pending ? 'Aguarde…' : locked || reference.uploadBatchId ? 'Retomar envio' : 'Enviar material'}</button>
          {reference.uploadBatchId || locked ? <button className="srTextButton" type="button" disabled={pending} onClick={() => void cancel()}>Cancelar envio pendente</button> : null}
        </div>
      </form>
    </details>
  );
}

function OriginalContent({ reference, busy, onSaved, onBusy }: { reference: SavedReference; busy: boolean; onSaved: () => Promise<void>; onBusy: (busy: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  return <div className="srOriginal"><ReferenceGallery reference={reference} /><div className="srSectionHead"><div><h3>O material recebido</h3><p>Fala, legenda e imagens ficam registradas separadamente.</p></div>{!editing ? <button className="cmGhostBtn" type="button" disabled={busy} onClick={() => setEditing(true)}>Editar textos</button> : null}</div>{editing ? <SourceEditor reference={reference} onBusy={onBusy} onSaved={onSaved} onCancel={() => setEditing(false)} /> : <><section className="srEvidence"><div className="srEvidenceTitle"><h4>Transcrição da fala</h4>{reference.transcript ? <span>{reference.transcriptSource === 'manual' ? 'Informada por você' : 'Extraída do áudio'}</span> : null}</div>{reference.transcript ? <p className="srProse srTranscript">{reference.transcript}</p> : <p className="srEmptyText">{reference.transcriptStatus === 'silent' ? 'Não foi identificada fala no material enviado.' : reference.transcriptStatus === 'pending' ? 'A transcrição aparece aqui quando o áudio for processado.' : 'O áudio não estava disponível. Nenhuma fala foi transcrita.'}</p>}</section><section className="srEvidence"><h4>Legenda do post</h4><p className={reference.caption ? 'srProse' : 'srEmptyText'}>{reference.caption || 'A legenda não foi recebida.'}</p></section><section className="srEvidence"><h4>O que aparece nas imagens</h4><p className={reference.visualDescription ? 'srProse' : 'srEmptyText'}>{reference.visualDescription || 'Ainda não há uma descrição visual disponível.'}</p></section><section className="srEvidence"><h4>Texto visível na tela</h4><p className={reference.onScreenText ? 'srProse' : 'srEmptyText'}>{reference.onScreenText || 'Nenhum texto de tela foi registrado.'}</p></section>{reference.notes ? <section className="srPersonalNote"><h4>Sua observação</h4><p className="srProse">{reference.notes}</p></section> : null}</>}{!editing ? <AttachMedia reference={reference} onSaved={onSaved} onBusy={onBusy} /> : null}</div>;
}

function ReferenceDetail({ reference, pillars, busy, onBusy, onRefresh, onDraft, onDeleted }: { reference: SavedReference; pillars: ContentPillar[]; busy: boolean; onBusy: (busy: boolean) => void; onRefresh: () => Promise<void>; onDraft: () => void; onDeleted: () => void }) {
  const [view, setView] = useState<'application' | 'original'>(() => reference.uploadBatchId && !reference.analysis ? 'original' : 'application');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'retry' | 'delete' | null>(null);
  const mutate = async (kind: 'retry' | 'delete') => {
    if (busy) return;
    setAction(kind); onBusy(true); setError('');
    try {
      const result = await (kind === 'retry' ? retryReferenceAction(reference.id) : deleteReferenceAction(reference.id));
      if (!result.ok) throw new Error(result.error);
      if (kind === 'delete') onDeleted(); else await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir agora.'); }
    finally { setAction(null); onBusy(false); }
  };
  return <div className="srDetail"><div className="srDetailMeta"><span className="srStatus" data-status={displayedStatus(reference)}>{statusLabel(reference)}</span><span>{reference.collectionName}</span>{reference.creatorHandle ? <span>@{reference.creatorHandle.replace(/^@/, '')}</span> : null}<a className="srSourceLink" href={canonicalInstagramUrl(reference.sourceUrl) || undefined} target="_blank" rel="noreferrer">Ver no Instagram<Icon name="arrow" /></a></div><h3 className="srDetailTitle">{titleFor(reference)}</h3>{reference.uploadBatchId ? <div className="srPendingUpload"><p>Existe um envio de arquivos pendente. Você pode retomar ou cancelar em Conteúdo original.</p>{view !== 'original' ? <button className="srTextButton" type="button" disabled={busy} onClick={() => setView('original')}>Retomar envio</button> : null}</div> : null}<div className="srDetailSwitch" aria-label="Parte da referência"><button type="button" disabled={busy} aria-pressed={view === 'application'} onClick={() => setView('application')}>Aplicação para você</button><button type="button" disabled={busy} aria-pressed={view === 'original'} onClick={() => setView('original')}>Conteúdo original</button></div>{view === 'application' ? <AnalysisContent reference={reference} pillars={pillars} onDraft={onDraft} /> : <OriginalContent reference={reference} busy={busy} onSaved={onRefresh} onBusy={onBusy} />}{error ? <p className="srError" role="alert">{error}</p> : null}<footer className="srDetailFooter"><span>Salva em {dateLabel(reference.createdAt)}{reference.processedAt ? ` · Analisada em ${dateLabel(reference.processedAt)}` : ''}</span><div className="srButtonRow"><button type="button" className="srTextButton" disabled={busy || !!reference.uploadBatchId || reference.status === 'processing' || reference.status === 'queued'} onClick={() => void mutate('retry')}>{action === 'retry' ? 'Enviando para análise…' : 'Analisar novamente'}</button><button type="button" className="srTextButton srDeleteButton" disabled={busy} onClick={() => setConfirmDelete(true)}>Excluir referência</button></div></footer>{confirmDelete ? <div className="srDeleteConfirm" role="group" aria-label="Confirmar exclusão"><h4>Excluir esta referência?</h4><p>O material salvo será removido desta área. Se você criou um rascunho no calendário, ele continua lá.</p><div className="srButtonRow"><button className="cmGhostBtn" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Manter referência</button><button className="cmPrimary" type="button" disabled={busy} onClick={() => void mutate('delete')}>{action === 'delete' ? 'Excluindo…' : 'Excluir referência'}</button></div></div> : null}</div>;
}

function DraftEditor({ reference, pillars, onSaved, onBusy }: { reference: SavedReference; pillars: ContentPillar[]; onSaved: (date: string) => void; onBusy: (busy: boolean) => void }) {
  const adaptation = reference.analysis?.adaptation;
  const activePillars = pillars.filter((pillar) => pillar.active);
  const [pillarId, setPillarId] = useState(activePillars.some((pillar) => pillar.id === adaptation?.pillarId) ? adaptation?.pillarId || '' : '');
  const [subject, setSubject] = useState(adaptation?.subject || '');
  const [zone, setZone] = useState<ReferenceZone | ''>(adaptation?.zone || '');
  const [format, setFormat] = useState(adaptation?.format || '');
  const [script, setScript] = useState(() => draftFromAnalysis(reference));
  const [date, setDate] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const parsed = draftSchema.safeParse({ referenceId: reference.id, pillarId, subject, zone, format, script, scheduledFor: date });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Confira os campos do rascunho.'); return; }
    setPending(true); onBusy(true); setError('');
    try {
      const result = await createReferenceDraftAction(parsed.data satisfies ReferenceDraft);
      if (!result.ok) throw new Error(result.error);
      onSaved(date);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar o rascunho.'); }
    finally { setPending(false); onBusy(false); }
  };
  return <form className="srForm srDraftForm" onSubmit={submit} aria-busy={pending}><p className="srIntro">A proposta é um ponto de partida. Edite até fazer sentido para você e escolha quando quer trabalhar nela.</p><fieldset className="srFormGrid" disabled={pending}><label><span>Tema central</span><select required value={pillarId} onChange={(event) => setPillarId(event.target.value)}><option value="">Escolha um tema</option>{activePillars.map((pillar) => <option key={pillar.id} value={pillar.id}>{pillar.name}</option>)}</select></label><label><span>Data no calendário</span><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="srWide"><span>Assunto</span><input required maxLength={240} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label><span>Zona</span><select required value={zone} onChange={(event) => setZone(event.target.value as ReferenceZone)}><option value="">Escolha uma zona</option>{ZONES.map((item) => <option key={item} value={item}>{item} · {ZONE_LABELS[item]}</option>)}</select></label><label><span>Formato</span><input required maxLength={100} value={format} onChange={(event) => setFormat(event.target.value)} placeholder="Reel, carrossel, story…" /></label><label className="srWide"><span>Gancho e roteiro</span><textarea rows={15} maxLength={40000} value={script} onChange={(event) => setScript(event.target.value)} /></label></fieldset>{!activePillars.length ? <p className="srError">Você precisa adicionar um tema no <Link href="/dashboard/content">calendário</Link>, antes de salvar.</p> : null}{error ? <p className="srError" role="alert">{error}</p> : null}<footer className="srFormFooter"><p>Será salvo na etapa Ideia. Você continua a revisão no calendário.</p><button className="cmPrimary" type="submit" disabled={pending || !activePillars.length}>{pending ? 'Criando rascunho…' : 'Salvar rascunho no calendário'}<Icon name="arrow" /></button></footer></form>;
}

function ReferenceSettings({ screen, onRefresh, onConnection }: { screen: ReferenceScreen; onRefresh: () => Promise<void>; onConnection: (connection: ReferenceConnection) => void }) {
  const { connection, settings } = screen;
  const [editingRoutine, setEditingRoutine] = useState(false);
  const [routine, setRoutine] = useState(settings.realityNotes);
  const [collection, setCollection] = useState(connection?.collectionName || 'Referências UGC');
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState<'routine' | 'connection' | 'pause' | null>(null);
  const [routineError, setRoutineError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [routineSaved, setRoutineSaved] = useState(false);
  const state = connectionState(connection);
  const saveRoutine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy('routine'); setRoutineError(''); setRoutineSaved(false);
    try {
      const result = await saveReferenceSettingsAction(routine);
      if (!result.ok) throw new Error(result.error);
      await onRefresh(); setEditingRoutine(false); setRoutineSaved(true);
    } catch (cause) { setRoutineError(cause instanceof Error ? cause.message : 'Não foi possível salvar sua rotina.'); }
    finally { setBusy(null); }
  };
  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (connection && !replace) { setReplace(true); return; }
    setBusy('connection'); setConnectionError('');
    try {
      const result = await createReferenceConnectionAction(collection.trim());
      if (!result.ok) throw new Error(result.error);
      setToken(result.token); setCopied(false); setReplace(false); onConnection(result.connection);
    } catch (cause) { setConnectionError(cause instanceof Error ? cause.message : 'Não foi possível gerar a chave.'); }
    finally { setBusy(null); }
  };
  const pause = async () => {
    if (!connection || busy) return;
    setBusy('pause'); setConnectionError('');
    try {
      const result = await setReferenceConnectionEnabledAction(!connection.enabled);
      if (!result.ok) throw new Error(result.error);
      onConnection({ ...connection, enabled: !connection.enabled }); await onRefresh();
    } catch (cause) { setConnectionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a conexão.'); }
    finally { setBusy(null); }
  };
  return <div className="srSettings">
    <details className="srSetupPanel"><summary><span className="srSetupSymbol" aria-hidden="true">01</span><span><strong>Minha rotina agora</strong><small>{settings.realityNotes ? 'Seu contexto para as próximas análises' : 'Conte o que cabe no seu dia a dia'}</small></span><span className="srPlus" aria-hidden="true">+</span></summary><div className="srSetupBody"><p>Os temas cadastrados no calendário entram na análise. Aqui você complementa com o que está vivendo, o tempo que tem e o que faz sentido gravar agora.</p>{editingRoutine ? <form className="srInlineForm" onSubmit={saveRoutine}><label><span>O que a análise precisa considerar</span><textarea rows={7} value={routine} onChange={(event) => setRoutine(event.target.value)} maxLength={20000} disabled={busy === 'routine'} placeholder="O que você quer registrar, onde consegue gravar, o tempo disponível, o que prefere não expor…" /></label><div className="srButtonRow"><button className="cmGhostBtn" type="button" disabled={busy === 'routine'} onClick={() => setEditingRoutine(false)}>Cancelar</button><button className="cmPrimary" type="submit" disabled={busy === 'routine'}>{busy === 'routine' ? 'Salvando…' : 'Salvar minha rotina'}</button></div></form> : <>{settings.realityNotes ? <p className="srRoutineText">{settings.realityNotes}</p> : null}<button className="cmGhostBtn" type="button" onClick={() => { setRoutine(settings.realityNotes); setEditingRoutine(true); setRoutineSaved(false); }}>{settings.realityNotes ? 'Atualizar minha rotina' : 'Contar sobre minha rotina'}</button></>}{routineError ? <p className="srError" role="alert">{routineError}</p> : null}{routineSaved ? <p className="srSuccess" role="status">Rotina atualizada para as próximas análises. Para aplicar a mudança a uma referência anterior, abra a referência e use Analisar novamente.</p> : null}</div></details>
    <details className="srSetupPanel"><summary><span className="srSetupSymbol" aria-hidden="true"><Icon name="link" /></span><span><strong>Pasta do Instagram</strong><small className="srConnectionSummary" data-state={state}>{CONNECTION_LABELS[state]}</small></span><span className="srPlus" aria-hidden="true">+</span></summary><div className="srSetupBody"><p>Depois da configuração inicial, o conector consulta sua pasta automaticamente, em intervalos de pelo menos 5 minutos.</p><p className="srHint">No modo servidor, funciona com os computadores desligados. Esta conexão não oficial pode precisar de uma nova confirmação no Instagram.</p><ol className="srSetupSteps"><li>Crie uma coleção nos Salvos do Instagram.</li><li>Use o mesmo nome abaixo e gere uma chave de conexão.</li><li><a href={CONNECTOR_GUIDE} target="_blank" rel="noreferrer">Abra o guia de instalação</a> para ativar a sincronização automática com a chave.</li></ol><form className="srInlineForm" onSubmit={connect}><label><span>Nome exato da coleção</span><input value={collection} onChange={(event) => { setCollection(event.target.value); setReplace(false); }} required maxLength={100} disabled={busy !== null} /></label>{replace ? <div className="srReplaceConfirm"><p>A chave anterior será revogada. Depois, atualize a chave e o nome da coleção no conector para continuar a sincronização.</p><div className="srButtonRow"><button className="cmGhostBtn" type="button" disabled={busy !== null} onClick={() => setReplace(false)}>Cancelar</button><button className="cmPrimary" type="submit" disabled={busy !== null}>{busy === 'connection' ? 'Gerando…' : 'Substituir chave'}</button></div></div> : <button className="cmGhostBtn" type="submit" disabled={busy !== null}>{busy === 'connection' ? 'Gerando…' : connection ? 'Gerar nova chave' : 'Gerar chave de conexão'}</button>}</form>{token ? <div className="srToken"><label><span>Guarde sua chave agora</span><textarea rows={3} value={token} readOnly spellCheck={false} onFocus={(event) => event.target.select()} /></label><p>Ela só aparece nesta sessão. Cole no conector e guarde em um lugar privado.</p><div className="srButtonRow"><button type="button" className="cmPrimary" onClick={async () => { try { await navigator.clipboard.writeText(token); setCopied(true); setConnectionError(''); } catch { setConnectionError('Não foi possível copiar automaticamente. Selecione a chave e copie pelo seu dispositivo.'); } }}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Chave copiada' : 'Copiar chave'}</button><button type="button" className="cmGhostBtn" onClick={() => setToken(null)}>Já guardei</button></div></div> : null}{connection ? <div className="srConnectionDetails"><div className="srConnectionLine" data-state={state}><i aria-hidden="true" /><strong>{CONNECTION_LABELS[state]}</strong></div><dl><div><dt>Último sinal do conector</dt><dd>{dateLabel(connection.lastSeenAt, true)}</dd></div><div><dt>Última sincronização</dt><dd>{dateLabel(connection.lastSyncAt, true)}</dd></div></dl>{connection.lastError ? <p className="srError">{connectionErrorText(connection.lastError)}</p> : null}<button className="srTextButton" type="button" disabled={busy !== null} onClick={() => void pause()}>{busy === 'pause' ? 'Atualizando…' : connection.enabled ? 'Pausar sincronização' : 'Retomar sincronização'}</button></div> : null}{connectionError ? <p className="srError" role="alert">{connectionError}</p> : null}</div></details>
  </div>;
}

type DrawerState = { kind: 'add' } | { kind: 'detail'; id: string; reference?: SavedReference } | { kind: 'draft'; reference: SavedReference } | null;
type SuccessMessage = { text: string; href?: string } | null;
type ReferenceQuery = {
  page: number;
  search: string;
  status: ReferenceStatus | 'all' | 'upload_pending';
  collection: string;
};

const queryKey = (query: ReferenceQuery) => JSON.stringify([query.page, query.search, query.status, query.collection]);

export default function SavedReferences({ initialScreen, pillars }: { initialScreen: ReferenceScreen; pillars: ContentPillar[] }) {
  const initialParameters: ReferenceQuery = { page: initialScreen.page ?? 0, search: '', status: 'all', collection: 'all' };
  const [screen, setScreen] = useState(initialScreen);
  const [query, setQuery] = useState('');
  const [parameters, setParameters] = useState(initialParameters);
  const [visibleQueryKey, setVisibleQueryKey] = useState(() => queryKey(initialParameters));
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [success, setSuccess] = useState<SuccessMessage>(null);
  const parametersRef = useRef(initialParameters);
  const inFlight = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const requestVersion = useRef(0);
  const detailVersion = useRef(0);
  const openReferenceId = useRef<string | null>(null);
  const mounted = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (!mounted.current) return;
    const requested = parametersRef.current;
    const requestedKey = queryKey(requested);
    if (inFlight.current?.key === requestedKey) {
      await inFlight.current.promise;
      if (!force || !mounted.current || queryKey(parametersRef.current) !== requestedKey) return;
    }
    const version = ++requestVersion.current;
    const isCurrentRequest = () => mounted.current && requestVersion.current === version && queryKey(parametersRef.current) === requestedKey;
    const request = (async () => {
      setRefreshing(true);
      try {
        const result = await listReferenceScreenAction({
          page: requested.page,
          search: requested.search,
          status: requested.status,
          collection: requested.collection === 'all' ? undefined : requested.collection,
        });
        if (!isCurrentRequest()) return;
        if (!result.ok) { setRefreshError(result.error); return; }
        const resolved = { ...requested, page: result.screen.page ?? requested.page };
        if (resolved.page !== requested.page) {
          parametersRef.current = resolved;
          setParameters(resolved);
        }
        setScreen(result.screen);
        setVisibleQueryKey(queryKey(resolved));
        setRefreshError('');
      } catch {
        if (isCurrentRequest()) setRefreshError('Não foi possível atualizar agora. Seus textos em edição continuam aqui.');
      } finally { if (mounted.current && requestVersion.current === version) setRefreshing(false); }
    })();
    inFlight.current = { key: requestedKey, promise: request };
    try { await request; } finally { if (inFlight.current?.promise === request) inFlight.current = null; }
  }, []);

  const refreshSelected = useCallback(async () => {
    const id = openReferenceId.current;
    if (!id || !mounted.current) return;
    const version = ++detailVersion.current;
    try {
      const result = await getReferenceAction(id);
      if (!mounted.current || openReferenceId.current !== id || detailVersion.current !== version) return;
      if (!result.ok) { setDetailError(result.error); return; }
      setDrawer((current) => current?.kind === 'detail' && current.id === id
        ? { ...current, reference: result.reference } : current);
      setDetailError('');
    } catch {
      if (mounted.current && openReferenceId.current === id && detailVersion.current === version) {
        setDetailError('Não foi possível atualizar esta referência. O que você está editando continua aqui.');
      }
    }
  }, []);

  const refreshAll = useCallback(async (force = false) => {
    await Promise.all([refresh(force), refreshSelected()]);
  }, [refresh, refreshSelected]);
  const refreshNow = useCallback(() => refreshAll(true), [refreshAll]);
  const changeQuery = useCallback((patch: Partial<ReferenceQuery>) => {
    const next = { ...parametersRef.current, ...patch };
    if (queryKey(next) === queryKey(parametersRef.current)) return;
    parametersRef.current = next;
    setParameters(next);
    setRefreshError('');
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timeout = setTimeout(() => changeQuery({ search: query.trim(), page: 0 }), 300);
    return () => clearTimeout(timeout);
  }, [query, changeQuery]);

  useEffect(() => {
    mounted.current = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const poll = () => {
      if (interval) clearInterval(interval);
      interval = document.hidden ? null : setInterval(() => { void refreshAll(); }, 15_000);
    };
    const onVisible = () => { poll(); if (!document.hidden) void refreshAll(); };
    const onFocus = () => { if (!document.hidden) void refreshAll(); };
    const onChange = () => {
      if (document.hidden) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void refreshAll(); }, 250);
    };
    poll();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    const client = supabaseBrowser();
    const channel = client.channel(`saved-references-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_reference' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_reference_connection' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_reference_settings' }, onChange)
      .subscribe();
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      detailVersion.current += 1;
      if (interval) clearInterval(interval);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      void client.removeChannel(channel);
    };
  }, [refreshAll]);

  const collections = screen.collections ?? [...new Set(screen.references.map((reference) => reference.collectionName))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filtered = screen.references;
  const total = screen.total ?? filtered.length;
  const pageSize = screen.pageSize ?? 60;
  const page = screen.page ?? parameters.page;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = !!query.trim() || parameters.status !== 'all' || parameters.collection !== 'all';
  const showBrowser = collections.length > 0 || filtered.length > 0 || hasFilters || parameters.page > 0;
  const loadingResults = visibleQueryKey !== queryKey(parameters) || query.trim() !== parameters.search;
  const selected = drawer?.kind === 'detail' ? drawer.reference : null;
  const state = connectionState(screen.connection);
  const clearFilters = () => {
    setQuery('');
    changeQuery({ search: '', status: 'all', collection: 'all', page: 0 });
  };
  const closeDrawer = () => {
    if (busy) return;
    openReferenceId.current = null;
    setDrawer(null);
    setDetailError('');
  };
  const add = () => {
    openReferenceId.current = null;
    setDetailError(''); setBusy(false); setDrawer({ kind: 'add' });
  };
  const openDetail = (reference: SavedReference) => {
    openReferenceId.current = reference.id;
    setDetailError(''); setBusy(false); setDrawer({ kind: 'detail', id: reference.id, reference });
    void refreshSelected();
  };
  const saved = (id: string, duplicate = false) => {
    openReferenceId.current = id;
    setDetailError(''); setBusy(false); setDrawer({ kind: 'detail', id });
    setSuccess({ text: duplicate ? 'Essa referência já estava salva. Você pode continuar por aqui.' : 'Referência salva. A análise acompanha o material disponível.' });
    void refreshNow();
  };

  return <section className="sr">
    <header className="srTop"><div><span className="cmEyebrow">Seu repertório</span><h1>Referências</h1><p>Dos seus salvos para o seu próximo conteúdo.</p></div><button className="cmPrimary srAddButton" type="button" onClick={add}><Icon name="plus" />Adicionar referência</button></header>
    <ReferenceSettings screen={screen} onRefresh={refreshNow} onConnection={(connection) => setScreen((current) => ({ ...current, connection }))} />
    {!screen.aiAvailable || !screen.transcriptionAvailable ? <div className="srAvailability"><Icon name="bookmark" /><p>{!screen.aiAvailable ? 'Suas referências ficam salvas. A análise automática estará disponível quando a conexão de IA for configurada.' : 'A transcrição automática ainda não está ativa. Você pode adicionar a transcrição junto ao material.'}</p></div> : null}
    {success ? <div className="srNotice" role="status"><Icon name="check" /><p>{success.text}{success.href ? <> <Link href={success.href}>Abrir no calendário</Link></> : null}</p><button className="srIconButton" type="button" aria-label="Fechar aviso" onClick={() => setSuccess(null)}><Icon name="close" /></button></div> : null}
    {refreshError ? <div className="srRefreshError" role="alert"><p>{refreshError}</p><button type="button" className="srTextButton" disabled={refreshing} onClick={() => void refreshNow()}>Tentar atualizar</button></div> : null}
    <div className="srCollectionHeading"><div><h2>O que você guardou</h2><p>{loadingResults ? 'Buscando no seu repertório…' : total ? `${total} ${total === 1 ? 'referência' : 'referências'}${hasFilters ? ' nesta seleção' : ' no seu repertório'}` : 'Um espaço para salvar, entender e adaptar.'}</p></div><div className="srActivity"><span className="srConnectionDot" data-state={state} aria-hidden="true" /><span>{refreshing ? 'Atualizando…' : state === 'connected' ? 'Conector ativo' : 'Atualização automática'}</span><button type="button" className="srTextButton" disabled={refreshing} onClick={() => void refreshNow()}>Atualizar</button></div></div>
    {showBrowser ? <>
      <div className="srFilters">
        <label className="srSearch"><span className="srVisuallyHidden">Buscar referências</span><Icon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="Buscar em todo o seu repertório" /></label>
        <label className="srFilterSelect"><span>Estado</span><select value={parameters.status} onChange={(event) => changeQuery({ status: event.target.value as ReferenceQuery['status'], page: 0 })}><option value="all">Todos os estados</option><option value="upload_pending">Envio pendente</option>{REFERENCE_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label>
        <label className="srFilterSelect"><span>Coleção</span><select value={parameters.collection} onChange={(event) => changeQuery({ collection: event.target.value, page: 0 })}><option value="all">Todas as coleções</option>{collections.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      <p className="srResultCount" role="status">{loadingResults ? 'Atualizando resultados…' : `${total} ${total === 1 ? 'referência encontrada' : 'referências encontradas'}${hasFilters ? ' nesta busca' : ''}`}</p>
      <div className="srResults" aria-busy={loadingResults} data-loading={loadingResults || undefined}>
        {filtered.length ? <div className="srGrid">{filtered.map((reference) => {
          const adaptation = reference.analysis?.adaptation;
          const pillar = pillars.find((item) => item.id === adaptation?.pillarId);
          return <article className="srCard" key={reference.id} data-status={displayedStatus(reference)}><div className="srCardMedia"><ReferenceMedia key={reference.assets[0]?.path || reference.id} reference={reference} compact /><span className="srCardMediaLabel">{MEDIA_LABELS[reference.mediaKind]}</span></div><div className="srCardBody"><div className="srCardMeta"><span>{reference.collectionName}</span><time dateTime={reference.createdAt}>{dateLabel(reference.createdAt)}</time></div><h3><button type="button" disabled={loadingResults} onClick={() => openDetail(reference)}>{titleFor(reference)}</button></h3><p>{brief(reference.analysis?.explanation || reference.notes || reference.caption || (reference.status === 'processing' || reference.status === 'queued' ? 'O material recebido está sendo preparado para análise.' : 'Adicione o material para entender e adaptar esta referência.'))}</p>{pillar || adaptation?.format ? <span className="srCardApplication">{[pillar?.name, adaptation?.format].filter(Boolean).join(' · ')}</span> : null}<footer><span className="srStatus" data-status={displayedStatus(reference)}>{statusLabel(reference)}</span><Icon name="arrow" /></footer></div></article>;
        })}</div> : <div className="srNoResults"><h3>{loadingResults ? 'Buscando suas referências…' : 'Nenhuma referência por aqui.'}</h3><p>{parameters.page > 0 && !hasFilters ? 'Esta página ficou vazia. Volte para a página anterior.' : 'Tente outro termo ou ajuste os filtros.'}</p><button className="cmGhostBtn" type="button" onClick={clearFilters}>Limpar filtros</button></div>}
      </div>
      <nav className="srPagination" aria-label="Paginação das referências">
        <div><span>{loadingResults ? 'Carregando a seleção…' : total ? `${page * pageSize + 1} a ${Math.min((page + 1) * pageSize, total)} de ${total}` : 'Nenhuma referência nesta seleção'}</span><small>{loadingResults ? 'Aguarde os resultados' : `Página ${page + 1} de ${pageCount}`}</small></div>
        <div className="srButtonRow"><button className="cmGhostBtn srPreviousPage" type="button" disabled={loadingResults || page <= 0} onClick={() => changeQuery({ page: Math.max(0, page - 1) })}><Icon name="arrow" />Anterior</button><button className="cmGhostBtn" type="button" disabled={loadingResults || (page + 1) * pageSize >= total} onClick={() => changeQuery({ page: page + 1 })}>Próxima<Icon name="arrow" /></button></div>
      </nav>
    </> : <div className="srEmpty"><div className="srEmptyIllustration" aria-hidden="true"><div className="srPaper srPaperBack" /><div className="srPaper srPaperFront"><span>REFERÊNCIAS</span><Icon name="bookmark" /><i /><i /><span>CAROL OS</span></div></div><div className="srEmptyCopy"><span className="srSmallLabel">O começo do seu repertório</span><h2>Algo chamou sua atenção.<br />Guarde o que vem depois.</h2><p>Traga um post que você salvou. Aqui ele ganha transcrição, uma explicação do que foi feito e uma proposta para você adaptar à sua rotina, conforme o material disponível.</p><button className="cmPrimary" type="button" onClick={add}>Adicionar minha primeira referência<Icon name="arrow" /></button><span className="srEmptyNote">Você também pode conectar uma pasta do Instagram acima.</span></div></div>}
    {drawer ? <ReferenceDialog eyebrow={drawer.kind === 'add' ? 'Salvar uma ideia' : drawer.kind === 'draft' ? 'Do repertório ao calendário' : 'Seu repertório'} title={drawer.kind === 'add' ? 'Nova referência' : drawer.kind === 'draft' ? 'Revisar rascunho' : 'Por dentro da referência'} busy={busy} onClose={closeDrawer}>
      {detailError && drawer.kind === 'detail' ? <div className="srDetailRefreshError" role="alert"><p>{detailError}</p><button className="srTextButton" type="button" onClick={() => void refreshSelected()}>Tentar atualizar a referência</button></div> : null}
      {drawer.kind === 'add' ? <AddReference collectionName={screen.connection?.collectionName || 'Referências'} onSaved={saved} onBusy={setBusy} /> : drawer.kind === 'draft' ? <DraftEditor reference={drawer.reference} pillars={pillars} onBusy={setBusy} onSaved={(date) => { openReferenceId.current = null; setBusy(false); setDrawer(null); setSuccess({ text: 'Seu rascunho foi salvo na etapa Ideia.', href: `/dashboard/content?view=day&date=${date}` }); void refreshNow(); }} /> : selected ? <ReferenceDetail key={selected.id} reference={selected} pillars={pillars} busy={busy} onBusy={setBusy} onRefresh={refreshNow} onDraft={() => { openReferenceId.current = null; setDetailError(''); setDrawer({ kind: 'draft', reference: selected }); }} onDeleted={() => { openReferenceId.current = null; setBusy(false); setDrawer(null); setSuccess({ text: 'Referência excluída.' }); void refreshNow(); }} /> : <div className="srAwaiting"><p role="status">{detailError ? 'A referência não pôde ser carregada agora.' : 'Buscando a referência salva…'}</p><button className="cmGhostBtn" type="button" onClick={() => void refreshSelected()}>Atualizar</button></div>}
    </ReferenceDialog> : null}
  </section>;
}
