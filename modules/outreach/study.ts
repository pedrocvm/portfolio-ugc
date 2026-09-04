import 'server-only';

import { normalizeDomain, normalizeHandle, normalizeName } from '@/modules/brands/identity';
import { guessNiche } from '@/modules/brands/niches';
import { scoreBrandFit, type FitSignals } from '@/modules/brands/fit';
import type { HospitalityProfile } from '@/modules/ai/schemas';
import type { Discovered } from './discovery';
import { familyFor, opportunityFor } from './intent';
import { parseLine, RESOLUTION_LABEL, isResolution, type Resolution } from './import';
import { dedupFor } from './import-dedup';
import { chooseFromResearch } from './mailcheck';
import { gatherFacts, researchCandidate } from './research';

/** Estudar UMA marca, a fundo, porque ela perguntou.
 *
 *  Isto não é prospecção: é a resposta a «o que sabes da Quinta da Pacheca?».
 *  Não abre lote, não cria candidata, não escreve email e não toca no CRM —
 *  quando ela quiser mandar a marca para a fila, o caminho é outro e é o dela.
 *
 *  Reutiliza as mesmas peças do lote, pela mesma ordem e pelas mesmas regras:
 *  identidade com prova, histórico antes de tratar como nova, e o encaixe a
 *  descrever em vez de excluir. Uma segunda noção de «quem é esta marca» seria
 *  uma que um dia discordava da primeira.
 *
 *  Custa uma pesquisa na web e duas a três chamadas ao modelo. As respostas
 *  ficam em cache: se ela mandar a marca para um lote a seguir, não se paga
 *  outra vez. */

export type BrandStudy = {
  /** O que ela escreveu, tal como escreveu. */
  asked: string;
  identity: {
    name: string;
    website: string | null;
    domain: string | null;
    instagram: string | null;
    city: string | null;
    country: string | null;
    parentGroup: string | null;
    category: string | null;
    confidence: 'high' | 'medium' | 'low';
    evidence: { claim: string; url: string | null }[];
    /** Mais do que uma empresa responde a este nome. */
    ambiguity: { name: string; why: string; url: string | null }[];
  };
  relationship: {
    resolution: Resolution;
    label: string;
    note: string;
    evidence: string[];
    /** Falso quando não deu para perguntar ao Gmail. */
    checked: boolean;
  };
  business: {
    product: string | null;
    whyFit: string;
    whyNow: string;
    whyMayPay: string;
    risk: string;
    paidMedia: string | null;
    ugc: string | null;
    redFlags: string[];
    sources: { label: string; url: string | null }[];
  } | null;
  creative: {
    opportunity: string;
    ideas: { title: string; angle: string }[];
    /** Só quando é hotelaria: a experiência que dá vídeo. */
    experiences: { experience: string; whyItFilmsWell: string; season: string | null }[];
    highlights: { aspect: string; detail: string }[];
  } | null;
  contact: {
    email: string | null;
    role: string | null;
    name: string | null;
    whatsapp: string | null;
    instagram: string | null;
    /** O endereço não é do domínio da marca. */
    offDomain: boolean;
    note: string;
  };
  scores: { fit: number | null; fitBand: string | null; opportunity: number | null } | null;
  /** O que não se conseguiu apurar, dito por palavras. */
  gaps: string[];
};

export async function studyBrand(asked: string): Promise<{ ok: true; study: BrandStudy } | { ok: false; error: string }> {
  const linha = parseLine(asked);
  if (!linha) return { ok: false, error: 'Não percebi que marca é essa.' };

  const gaps: string[] = [];

  const partida: Discovered = {
    name: linha.detectedName,
    normalizedName: normalizeName(linha.detectedName),
    website: linha.detectedWebsite,
    domain: linha.detectedDomain,
    country: linha.countryHint,
    description: '',
    why: '',
    source: linha.rawInput,
    nicheId: guessNiche(linha.detectedName, linha.detectedName)?.id ?? null,
  };

  const pistaHotelaria =
    familyFor([linha.detectedName, linha.rawInput, linha.cityHint ?? ''].join(' '))?.id === 'hospitality';

  const facts = await gatherFacts(partida, { identity: true, hospitality: pistaHotelaria });
  if (!facts) gaps.push('A pesquisa na web não devolveu nada, por isso isto é mais pobre do que devia.');

  const { runPrompt } = await import('@/modules/ai/gateway');
  const { resolveBrandIdentity } = await import('@/modules/ai/prompts/registry');
  const run = await runPrompt(
    resolveBrandIdentity,
    {
      raw: linha.rawInput,
      name: linha.detectedName,
      domain: linha.detectedDomain,
      instagram: linha.detectedInstagram,
      tiktok: linha.detectedTiktok,
      linkedin: linha.detectedLinkedin,
      cityHint: linha.cityHint,
      countryHint: linha.countryHint,
      facts,
      today: new Date().toISOString().slice(0, 10),
    },
    { cache: true, entityType: 'brand_study' },
  );

  if (!run.ok) return { ok: false, error: 'Não consegui identificar a marca agora. Tente outra vez daqui a pouco.' };
  const ident = run.output;

  const nome = ident.official_name?.trim() || linha.detectedName;
  const domain = normalizeDomain(ident.domain ?? ident.website) ?? linha.detectedDomain;
  const website = ident.website ?? linha.detectedWebsite ?? (domain ? `https://${domain}` : null);
  const instagram = normalizeHandle(ident.instagram) ?? linha.detectedInstagram;
  const certa = ident.confidence === 'high' || (ident.confidence === 'medium' && Boolean(domain || instagram));
  if (!certa) gaps.push('Não confirmei de que empresa se trata: um nome parecido não chega.');

  // ── O histórico vem antes de qualquer conclusão sobre a marca ───────────
  const dedup = await dedupFor({ name: nome, domain, website, instagram, identityCertain: certa });
  if (!dedup.dedupComplete) gaps.push('Não consegui confirmar no Gmail se já houve conversa.');

  const identity: BrandStudy['identity'] = {
    name: nome, website, domain, instagram,
    city: ident.city, country: ident.country, parentGroup: ident.parent_group,
    category: ident.category, confidence: ident.confidence,
    evidence: ident.evidence, ambiguity: ident.ambiguity,
  };

  const relationship: BrandStudy['relationship'] = {
    resolution: dedup.resolution,
    label: isResolution(dedup.resolution) ? RESOLUTION_LABEL[dedup.resolution] : dedup.resolution,
    note: dedup.note,
    evidence: dedup.lines,
    checked: dedup.dedupComplete,
  };

  // Identidade por confirmar pára aqui: pesquisar a fundo a empresa errada é
  // pior do que devolver menos.
  if (!certa) {
    return {
      ok: true,
      study: {
        asked, identity, relationship, business: null, creative: null,
        contact: { email: null, role: null, name: null, whatsapp: null, instagram, offDomain: false,
          note: 'Não procurei contato: primeiro é preciso saber de que empresa se trata.' },
        scores: null, gaps,
      },
    };
  }

  const hotelaria = pistaHotelaria || familyFor(`${ident.category ?? ''} ${nome}`)?.id === 'hospitality';
  const pesquisado = await researchCandidate(
    { ...partida, name: nome, normalizedName: normalizeName(nome), website, domain, description: ident.description },
    { facts, hospitality: hotelaria },
  );

  if (!pesquisado) {
    gaps.push('A pesquisa de fundo não respondeu desta vez.');
    return {
      ok: true,
      study: {
        asked, identity, relationship, business: null, creative: null,
        contact: { email: null, role: null, name: null, whatsapp: null, instagram, offDomain: false,
          note: 'Sem a pesquisa não há contato para dar.' },
        scores: null, gaps,
      },
    };
  }

  const r = pesquisado.research;
  const escolha = chooseFromResearch(r.contact, domain);
  const perfil: HospitalityProfile | null = pesquisado.hospitality;

  // Ela perguntou por esta marca. O encaixe descreve o que a espera do outro
  // lado; não decide se a marca presta.
  const fit = scoreBrandFit(r.fit_signals as FitSignals, {
    inFocus: true,
    focusLabel: ident.category ?? undefined,
  });
  const oportunidade = opportunityFor({
    paidMedia: r.paid_media_signal,
    ugc: r.ugc_signal,
    demonstrable: r.fit_signals?.demo_potential ?? null,
    creativeGap: r.fit_signals?.authentic_context ?? null,
    digitalPresence: r.fit_signals?.paid_maturity ?? null,
    reachable: Boolean(escolha.chosen || r.contact?.whatsapp || r.contact?.instagram),
    sameLanguage: true,
  });

  if (!escolha.chosen) gaps.push('Não encontrei um endereço em que confie.');
  if (hotelaria && !perfil) gaps.push('É hotelaria mas o perfil da casa não saiu desta vez.');

  return {
    ok: true,
    study: {
      asked,
      identity: { ...identity, city: r.city ?? identity.city, country: r.country ?? identity.country },
      relationship,
      business: {
        product: r.product,
        whyFit: r.why_fit,
        whyNow: r.why_now,
        whyMayPay: r.why_may_pay,
        risk: r.risk,
        paidMedia: r.paid_media_signal,
        ugc: r.ugc_signal,
        redFlags: r.red_flags,
        sources: r.sources,
      },
      creative: {
        opportunity: r.creative_opportunity,
        ideas: r.content_ideas,
        experiences: (perfil?.content_experiences ?? []).map((e) => ({
          experience: e.experience,
          whyItFilmsWell: e.why_it_films_well,
          season: e.season,
        })),
        highlights: perfil?.highlights ?? [],
      },
      contact: {
        email: escolha.chosen?.address ?? null,
        role: r.contact?.role ?? null,
        name: r.contact?.name ?? null,
        whatsapp: r.contact?.whatsapp ?? null,
        instagram: normalizeHandle(r.contact?.instagram ?? r.socials?.instagram) ?? instagram,
        offDomain: escolha.offDomain,
        note: escolha.because,
      },
      scores: { fit: fit.score, fitBand: fit.band, opportunity: oportunidade.score },
      gaps,
    },
  };
}
