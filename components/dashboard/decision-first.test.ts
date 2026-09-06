import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** O que a reorganização promete, verificado como texto.
 *
 *  Três promessas, e cada uma tinha uma forma concreta de se quebrar:
 *
 *  - uma verdade: o Hoje, a Inbox e a Marca leem a MESMA próxima ação;
 *  - a conversa à vista: nunca dentro de um `details`;
 *  - telas vazias não dominam: uma análise sem amostra é uma frase, não uma
 *    grelha de traços. */

const ROOT = path.join(import.meta.dirname, '..', '..');
const ler = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/* ── Uma verdade, várias telas ────────────────────────────────────────────── */

test('a triagem grava a próxima ação calculada pela função única', () => {
  const src = ler('modules/email/triage-service.ts');
  assert.match(src, /nextActionForThread\(/);
  assert.match(src, /next_action: asJson\(next\)/);
  assert.match(src, /next_action_type: next\.type/);
});

test('o planeador lê a ação da conversa em vez de opinar por cima', () => {
  const src = ler('modules/actions/service.ts');
  assert.match(src, /from\('thread_intel'\)/);
  assert.match(src, /threadAction: threadAction\.get\(o\.id\)/);
  assert.match(src, /next_action: asJson\(p\.nextAction/);
});

test('a manhã, a gaveta e a marca leem a mesma ação', () => {
  assert.match(ler('modules/morning/service.ts'), /r\.nextAction/);
  assert.match(ler('components/dashboard/os/MailThread.tsx'), /thread\?\.nextAction/);
  assert.match(ler('components/dashboard/os/RelationshipHeader.tsx'), /intel\?\.nextAction \?\? proxima\?\.nextAction/);
  assert.match(ler('app/dashboard/carolos-actions.ts'), /nextAction: intel\?\.nextAction/);
});

test('a Carol AI responde «o que faço» com a mesma ação, não com uma opinião nova', () => {
  const tools = ler('modules/assistant/tools.ts');
  assert.match(tools, /'get_next_action'/);
  assert.match(tools, /MESMA que o Hoje e a Inbox/);
  const prompt = ler('modules/assistant/prompt.ts');
  assert.match(prompt, /get_next_action/);
  assert.match(prompt, /email NOVO para esse contato/);
});

/* ── Um email novo é um email novo ────────────────────────────────────────── */

test('escrever para o contato indicado sai sem thread do Gmail', () => {
  const src = ler('modules/email/send-service.ts');
  const compose = src.slice(src.indexOf('export async function sendCompose'), src.indexOf('export async function chooseReferredContact'));
  // O `sendMessage` do email novo não leva `threadId`: é outra conversa.
  const chamada = compose.slice(compose.indexOf('sendMessage(auth.token'), compose.indexOf(');', compose.indexOf('sendMessage(auth.token')));
  assert.doesNotMatch(chamada, /threadId/);
});

test('a conversa nova fica ligada à antiga, à marca e ao negócio', () => {
  const src = ler('modules/email/send-service.ts');
  assert.match(src, /parent_thread_id: thread\.id/);
  assert.match(src, /referral_message_id: sourceMessageId/);
  assert.match(src, /opportunity_id: thread\.opportunity_id/);
});

test('depois do envio o estado comercial atualiza-se sozinho', () => {
  const src = ler('modules/email/send-service.ts');
  const compose = src.slice(src.indexOf('export async function sendCompose'));
  assert.match(compose, /scheduleFor\(db, \{[\s\S]*?eventType: 'outreach\.sent'/);
  assert.match(compose, /\.in\('type', \['respond', 'compose_to_new_contact', 'confirm_referral'\]\)/);
  assert.match(compose, /replanActions\(db, \[thread\.opportunity_id\]\)/);
  assert.match(compose, /waiting_on: 'brand'/);
  assert.match(compose, /primary_contact_id: contactId/);
});

test('o contato indicado guarda a prova', () => {
  const src = ler('modules/contacts/service.ts');
  for (const col of ['source_message_id', 'source_thread_id', 'source_confidence', 'observed_at', 'provenance']) {
    assert.match(src, new RegExp(col), `falta ${col}`);
  }
});

test('nada sai sem um segundo sim', () => {
  const card = ler('components/dashboard/os/NextActionCard.tsx');
  assert.match(card, /Sim, enviar/);
  assert.match(card, /setConfirmar\(true\)/);
  const morning = ler('components/dashboard/os/MorningFlow.tsx');
  assert.match(morning, /Sim, enviar/);
});

/* ── A conversa à vista ───────────────────────────────────────────────────── */

test('a conversa não vive dentro de um details', () => {
  const mail = ler('components/dashboard/os/MailThread.tsx');
  assert.doesNotMatch(mail, /<details className="mailAll"/);
  assert.match(mail, /<Conversation messages=\{thread\.messages\}/);
  const header = ler('components/dashboard/os/RelationshipHeader.tsx');
  assert.match(header, /<Conversation messages=\{messages\}/);
});

test('a conversa diz quem está nela, quem falou por último, e procura-se', () => {
  const src = ler('components/dashboard/os/Conversation.tsx');
  assert.match(src, /participantes/);
  assert.match(src, /data-latest/);
  assert.match(src, /type="search"/);
  assert.match(src, /data-msg=\{m\.id\}/);
});

test('a prova de uma ação abre a mensagem de origem', () => {
  const card = ler('components/dashboard/os/NextActionCard.tsx');
  assert.match(card, /Ver email original/);
  assert.match(card, /onOpenSource\(action\.evidence\.sourceMessageId!\)/);
});

test('a busca global encontra conversas e mensagens', () => {
  const src = ler('app/dashboard/search-actions.ts');
  assert.match(src, /from\('source_thread'\)/);
  assert.match(src, /from\('source_message'\)/);
  assert.match(src, /\/dashboard\/inbox\?thread=/);
});

test('o link do Hoje para uma conversa abre-a mesmo', () => {
  const page = ler('app/dashboard/(app)/inbox/page.tsx');
  assert.match(page, /searchParams/);
  assert.match(page, /openThreadId=\{thread/);
});

/* ── Telas vazias não dominam ─────────────────────────────────────────────── */

test('a análise sem amostra é uma frase, não doze traços', () => {
  const src = ler('app/dashboard/(app)/analytics/page.tsx');
  assert.match(src, /const cedo = a\.won === 0 && a\.outreach < 20/);
  assert.match(src, /\{cedo \? \(/);
});

test('a marca e o negócio abrem com a situação, não com quatro números', () => {
  for (const f of ['app/dashboard/(app)/brands/[id]/page.tsx', 'app/dashboard/(app)/opportunities/[id]/page.tsx']) {
    const src = ler(f);
    assert.doesNotMatch(src, /className="osStats"/, `${f} ainda abre com a grelha de números`);
    assert.match(src, /<RelationshipHeader/);
  }
});

test('a história separa o que se disse do que o sistema anotou', () => {
  const src = ler('components/dashboard/os/Timeline.tsx');
  assert.match(src, /isCommunicationEvent/);
  assert.match(src, /osTimelineFold/);
});

/* ── Nomes próprios ───────────────────────────────────────────────────────── */

test('CarolOS e CarolAI escrevem-se sempre assim', () => {
  const dirs = ['components/dashboard', 'components/assistant', 'app/dashboard'];
  const arquivos: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(e.name)) arquivos.push(rel);
    }
  };
  dirs.forEach(walk);
  const maus: string[] = [];
  for (const f of arquivos) {
    const src = ler(f);
    for (const m of src.matchAll(/CAROLOS|CAROLAI|Carolos\b|Carolai\b|carolAI|CarolAi/g)) maus.push(`${f} «${m[0]}»`);
  }
  assert.deepEqual(maus, []);
  // E o selo não passa por um `text-transform` de eyebrow.
  assert.match(ler('app/dashboard/dashboard.css'), /\.aiMark \{[\s\S]*?text-transform: none/);
});
