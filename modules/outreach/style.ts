import 'server-only';

import { supabaseService } from '@/lib/supabase/service';

/** A voz da Carol, medida — não inventada.
 *
 *  A parte que não pode ser um resumo de modelo: números não se discutem e
 *  comparam-se entre versões. O que um modelo faz aqui é ler o que ela escreve
 *  e nomear os padrões; o que é contável, conta-se em código.
 *
 *  Privacidade: procura-se primeiro e só se trazem as mensagens que parecem
 *  prospecção. A caixa dela não vai inteira para lado nenhum. */

export type StyleProfile = {
  language: 'pt' | 'en';
  sampleCount: number;
  /** Medidos, não estimados. */
  measured: {
    medianWords: number;
    medianParagraphs: number;
    questionRate: number;
    exclamationRate: number;
    emojiRate: number;
    linkRate: number;
    greetings: string[];
    signoffs: string[];
    commonPhrases: string[];
  };
  /** Nomeados pelo modelo a partir das mesmas mensagens. */
  observed: {
    formality: string;
    opening: string;
    howSheIntroducesHerself: string;
    howSheExplainsUgc: string;
    howMuchOfTheIdeaSheReveals: string;
    ctaStyle: string;
    avoids: string[];
  } | null;
};

/** As buscas que encontram prospecção e deixam de fora o resto da caixa. */
const OUTREACH_QUERIES = [
  'in:sent (ugc OR "creator" OR "conteúdo" OR "content creation")',
  'in:sent (parceria OR colaboração OR collaboration OR partnership)',
  'in:sent (portfolio OR portfólio OR "media kit")',
];

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const median = (ns: number[]) => {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const rate = (ns: boolean[]) => (ns.length ? +(ns.filter(Boolean).length / ns.length).toFixed(2) : 0);

/** Frases que ela repete. Três ocorrências é padrão; duas é coincidência. */
function repeatedPhrases(bodies: string[]): string[] {
  const counts = new Map<string, number>();
  for (const body of bodies) {
    const seen = new Set<string>();
    for (const raw of body.split(/[.!?\n]+/)) {
      const phrase = raw.trim().toLowerCase().replace(/\s+/g, ' ');
      if (phrase.length < 12 || phrase.length > 80 || seen.has(phrase)) continue;
      seen.add(phrase);
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([p]) => p);
}

const firstLine = (body: string) => body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
const lastLines = (body: string) =>
  body.split('\n').map((l) => l.trim()).filter(Boolean).slice(-2).join(' ');

export type SentMail = { subject: string; body: string; to: string; sentAt: string };

/** Traz da caixa dela só o que parece prospecção. */
export async function fetchOutreachHistory(limit = 40): Promise<{ mails: SentMail[]; checked: boolean }> {
  try {
    const { accessTokenFor } = await import('@/modules/integrations/gmail/oauth');
    const { listMessages, getMessage, parseMessage } = await import('@/modules/integrations/gmail/client');

    const auth = await accessTokenFor();
    if (!auth) return { mails: [], checked: false };

    const seen = new Set<string>();
    const mails: SentMail[] = [];

    for (const query of OUTREACH_QUERIES) {
      const { messages } = await listMessages(auth.token, query, Math.ceil(limit / OUTREACH_QUERIES.length));
      for (const ref of messages) {
        if (seen.has(ref.id) || mails.length >= limit) continue;
        seen.add(ref.id);
        const p = parseMessage(await getMessage(auth.token, ref.id));
        // Uma linha não é uma abordagem; um tratado também não.
        const n = words(p.bodyText);
        if (n < 40 || n > 600) continue;
        mails.push({ subject: p.subject, body: p.bodyText, to: p.to[0] ?? '', sentAt: p.sentAt });
      }
    }
    return { mails, checked: true };
  } catch {
    return { mails: [], checked: false };
  }
}

/** A parte contável do perfil. Pura de propósito: dá para testar. */
export function measure(mails: readonly SentMail[]): StyleProfile['measured'] {
  const bodies = mails.map((m) => m.body);
  return {
    medianWords: median(bodies.map(words)),
    medianParagraphs: median(bodies.map((b) => b.split(/\n\s*\n/).filter((p) => p.trim()).length)),
    questionRate: rate(bodies.map((b) => b.includes('?'))),
    exclamationRate: rate(bodies.map((b) => b.includes('!'))),
    emojiRate: rate(bodies.map((b) => /\p{Extended_Pictographic}/u.test(b))),
    linkRate: rate(bodies.map((b) => /https?:\/\//.test(b))),
    greetings: [...new Set(bodies.map(firstLine).filter((l) => l.length < 60))].slice(0, 6),
    signoffs: [...new Set(bodies.map(lastLines).filter((l) => l.length < 90))].slice(0, 6),
    commonPhrases: repeatedPhrases(bodies),
  };
}

/** Constrói e guarda o perfil. Sem Gmail não se inventa um: devolve null e
 *  quem escreve o email fica sabendo que não tem voz de referência. */
export async function buildStyleProfile(language: 'pt' | 'en' = 'pt'): Promise<StyleProfile | null> {
  const { mails, checked } = await fetchOutreachHistory();
  if (!checked || mails.length < 3) return null;

  const measured = measure(mails);
  let observed: StyleProfile['observed'] = null;

  try {
    const { runPrompt } = await import('@/modules/ai/gateway');
    const { outreachStyle } = await import('@/modules/ai/prompts/registry');
    const run = await runPrompt(
      outreachStyle,
      { samples: mails.slice(0, 12).map((m) => `Assunto: ${m.subject}\n\n${m.body}`).join('\n\n---\n\n') },
      { cache: true },
    );
    if (run.ok) observed = run.output;
  } catch {
    /* sem modelo, fica só a parte medida — que já é a metade que não se discute */
  }

  const profile: StyleProfile = { language, sampleCount: mails.length, measured, observed };

  const db = supabaseService();
  const { data: me } = await db.from('app_user').select('id').limit(1).maybeSingle();
  if (me) {
    const { data: last } = await db
      .from('outreach_style_profile')
      .select('version')
      .eq('app_user_id', me.id)
      .eq('language', language)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    await db.from('outreach_style_profile').insert({
      app_user_id: me.id,
      language,
      version: (last?.version ?? 0) + 1,
      sample_count: mails.length,
      profile: profile as never,
    });
  }

  return profile;
}

export async function latestStyleProfile(language: 'pt' | 'en' = 'pt'): Promise<StyleProfile | null> {
  const db = supabaseService();
  const { data } = await db
    .from('outreach_style_profile')
    .select('profile')
    .eq('language', language)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.profile as StyleProfile | undefined) ?? null;
}
