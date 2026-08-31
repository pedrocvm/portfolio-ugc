import 'server-only';

import { supabaseService } from '@/lib/supabase/service';
import type { OutreachResearch } from '@/modules/ai/schemas';
import type { Discovered } from './discovery';
import { fetchOutreachHistory, type StyleProfile } from './style';

/** Escrever a abordagem.
 *
 *  A voz vem de dois sítios: o perfil medido e emails reais parecidos. Os
 *  exemplos servem para saber como ela escreve — não para reciclar frases. */

export type Written = {
  subject: string;
  body: string;
  claims: { text: string; source: string | null }[];
  portfolio: { title: string; url: string | null } | null;
  language: 'pt' | 'en';
};

/** Português para Portugal e Brasil; inglês para o resto. Traduzir à letra um
 *  email português dá um inglês que ninguém escreveria. */
function languageFor(country: string | null): 'pt' | 'en' {
  const c = (country ?? '').toLowerCase();
  return c.includes('portug') || c.includes('brasil') || c.includes('brazil') ? 'pt' : 'en';
}

/** O melhor exemplo do portfólio para esta marca: mesmo nicho primeiro, mesmo
 *  idioma a seguir. Mandar sempre o mesmo link é não ter escolhido. */
async function pickPortfolio(nicheId: string | null, language: string) {
  const db = supabaseService();
  const { data } = await db
    .from('content_asset')
    .select('title, language, funnel_role, capabilities, media_item_id, brand:brand_id ( category_primary )')
    .eq('portfolio_permission', true)
    .limit(30);

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const sameNiche = rows.find((r) => {
    const b = r.brand as { category_primary: string | null } | null;
    return nicheId && b?.category_primary === nicheId;
  });
  const sameLanguage = rows.find((r) => r.language === language);
  const chosen = sameNiche ?? sameLanguage ?? rows[0];
  return { title: chosen.title, url: null as string | null };
}

export async function writeOutreachEmail(
  input: { candidate: Discovered; research: OutreachResearch },
  style: StyleProfile | null,
): Promise<Written | null> {
  const { runPrompt } = await import('@/modules/ai/gateway');
  const { outreachEmail } = await import('@/modules/ai/prompts/registry');

  const language = languageFor(input.research.country ?? input.candidate.country);
  const portfolio = await pickPortfolio(input.candidate.nicheId, language);

  // Exemplos reais dela, para o modelo apanhar a estrutura e o tom.
  const { mails } = await fetchOutreachHistory(8);
  const exemplars = mails
    .slice(0, 4)
    .map((m) => `Assunto: ${m.subject}\n\n${m.body}`)
    .join('\n\n---\n\n');

  const run = await runPrompt(
    outreachEmail,
    {
      brand: input.candidate.name,
      product: input.research.product,
      language: language === 'pt' ? 'português (a voz dela)' : 'inglês',
      creativeOpportunity: input.research.creative_opportunity,
      ideas: input.research.content_ideas.map((i) => `- ${i.title}: ${i.angle}`).join('\n'),
      sources: input.research.sources.map((s) => `- ${s.label}${s.url ? ` (${s.url})` : ''}`).join('\n'),
      contactName: input.research.contact?.name ?? null,
      portfolio: portfolio ? `${portfolio.title}` : 'carolqueiroz.pt',
      style: style ? JSON.stringify(style, null, 1).slice(0, 4000) : '(sem perfil aprendido — usa a voz natural dela)',
      exemplars: exemplars || '(sem exemplos disponíveis)',
    },
    { entityType: 'outreach_candidate' },
  );

  if (!run.ok) return null;

  return {
    subject: run.output.subject,
    body: run.output.body,
    claims: run.output.claims,
    portfolio,
    language,
  };
}
