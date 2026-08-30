import 'server-only';

import { aiTaskEnabled, type Flags } from '@/lib/flags';
import { asJson } from '@/lib/supabase/json';
import { supabaseServer } from '@/lib/supabase/server';
import { replanActions } from '@/modules/actions/service';
import { recordEvent, type Db } from '@/modules/activity/service';
import { runPrompt, type ImageInput } from '@/modules/ai/gateway';
import { parseCapture } from '@/modules/ai/prompts/registry';
import type { CaptureExtraction } from '@/modules/ai/schemas';
import { normalizeDomain, normalizeEmail, normalizeHandle } from '@/modules/brands/identity';
import { guessNiche, prospectableNiches } from '@/modules/brands/niches';
import { resolveOrCreateBrand } from '@/modules/brands/service';
import { ensureOpportunity } from '@/modules/opportunities/service';

/** Captura rápida: o caminho para tudo o que não passa pelo Gmail.
 *
 *  A Carol cola um link, um print ou uma conversa e o sistema faz o resto. A
 *  interação tem de caber em segundos — se exigisse um formulário, seria o
 *  mesmo CRM manual que este produto existe para não ser.
 *
 *  Funciona sem IA: um URL sozinho já dá domínio, handle e nome provável.
 *  A IA acrescenta contacto, produto e pedidos quando está ligada. */

export type CaptureKind = 'url' | 'text' | 'screenshot' | 'profile' | 'product' | 'conversation' | 'brief';

export type CaptureDraft = {
  id: string;
  kind: CaptureKind;
  status: string;
  rawInput: string;
  note: string;
  storagePath: string | null;
  extracted: CaptureExtraction | null;
  confidence: number | null;
  brandId: string | null;
  createdAt: string;
};

const SELECT = 'id, kind, status, raw_input, note, storage_path, extracted, confidence, brand_id, created_at, error_summary';

type RawCapture = {
  id: string; kind: string; status: string; raw_input: string; note: string;
  storage_path: string | null; extracted: unknown; confidence: number | null;
  brand_id: string | null; created_at: string; error_summary: string | null;
};

const toDraft = (r: RawCapture): CaptureDraft => ({
  id: r.id,
  kind: r.kind as CaptureKind,
  status: r.status,
  rawInput: r.raw_input,
  note: r.note,
  storagePath: r.storage_path,
  extracted: (r.extracted ?? null) as CaptureExtraction | null,
  confidence: r.confidence,
  brandId: r.brand_id,
  createdAt: r.created_at,
});

export async function listCaptures(): Promise<CaptureDraft[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('capture_item')
    .select(SELECT)
    .in('status', ['pending', 'processed', 'failed'])
    .order('created_at', { ascending: false })
    .limit(30);
  return ((data ?? []) as RawCapture[]).map(toDraft);
}

/** Extracção sem modelo: só o que o texto contém de forma inequívoca.
 *  Não adivinha nome de marca a partir de prosa — para isso serve a IA. */
function deterministicExtract(raw: string): Partial<CaptureExtraction> {
  const urls = raw.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  const emails = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
  const handles = raw.match(/(?:^|\s)@([\w.]{2,30})/g) ?? [];

  const social = urls.find((u) => /instagram\.com|tiktok\.com/i.test(u));
  const site = urls.find((u) => !/instagram\.com|tiktok\.com|facebook\.com|linkedin\.com/i.test(u));
  const domain = normalizeDomain(site ?? null);
  const handle = normalizeHandle(social ?? handles[0]?.trim() ?? null);

  const nameFromDomain = domain?.split('.')[0];
  const brandName = nameFromDomain
    ? nameFromDomain.charAt(0).toUpperCase() + nameFromDomain.slice(1)
    : handle
      ? handle.charAt(0).toUpperCase() + handle.slice(1)
      : null;

  return {
    brand_name: brandName,
    website: site ?? null,
    instagram_handle: handle,
    contact_email: normalizeEmail(emails[0] ?? null),
    niche_id: guessNiche(raw)?.id ?? null,
    summary: raw.slice(0, 200),
  };
}

export async function createCapture(input: {
  kind: CaptureKind;
  raw: string;
  note?: string;
  storagePath?: string | null;
  flags: Flags;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = await supabaseServer();

  if (!input.raw.trim() && !input.storagePath) {
    return { ok: false, error: 'Cola alguma coisa: um link, uma mensagem ou um print.' };
  }

  const { data, error } = await db
    .from('capture_item')
    .insert({
      kind: input.kind,
      raw_input: input.raw.slice(0, 20_000),
      note: input.note ?? '',
      storage_path: input.storagePath ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: 'Não foi possível guardar a captura.' };

  await processCapture(db, data.id, input.flags);
  return { ok: true, id: data.id };
}

/** O print vive num bucket privado, nunca no `media` que o site serve. Vem
 *  daqui para o modelo em base64 e não é guardado outra vez em lado nenhum. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function loadScreenshot(db: Db, storagePath: string): Promise<ImageInput | null> {
  const { data, error } = await db.storage.from('capture').download(storagePath);
  if (error || !data) return null;
  if (data.size > MAX_IMAGE_BYTES) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  return { mediaType: data.type || 'image/png', base64: buffer.toString('base64') };
}

export async function processCapture(db: Db, captureId: string, flags: Flags) {
  const { data: capture } = await db
    .from('capture_item')
    .select('id, kind, raw_input, note, storage_path')
    .eq('id', captureId)
    .maybeSingle();
  if (!capture) return;

  const deterministic = deterministicExtract(capture.raw_input);
  let extracted: Partial<CaptureExtraction> = { ...deterministic, confidence: 0.4 };

  if (aiTaskEnabled(flags, 'ai_classification')) {
    const screenshot = capture.storage_path ? await loadScreenshot(db, capture.storage_path) : null;
    const images = screenshot ? [screenshot] : [];

    const { data: brands } = await db.from('brand').select('name').limit(200);
    const result = await runPrompt(
      parseCapture,
      {
        kind: capture.kind,
        raw: capture.raw_input || (screenshot ? '(sem texto: o material é a imagem em anexo)' : ''),
        note: capture.note,
        niches: prospectableNiches().map((n) => n.id).join(', '),
        knownBrands: (brands ?? []).map((b) => b.name).join(', '),
      },
      { entityType: 'capture_item', entityId: capture.id, cache: true, images },
    );

    if (result.ok) {
      // O determinístico ganha onde é prova dura: um URL colado não se
      // interpreta, lê-se.
      extracted = {
        ...result.output,
        website: deterministic.website ?? result.output.website,
        instagram_handle: deterministic.instagram_handle ?? result.output.instagram_handle,
        contact_email: deterministic.contact_email ?? result.output.contact_email,
      };
    }
  }

  await db
    .from('capture_item')
    .update({
      status: 'processed',
      extracted: asJson(extracted),
      confidence: extracted.confidence ?? 0.4,
    })
    .eq('id', captureId);
}

/** A Carol confirma e o sistema escreve. Só aqui é que a captura vira marca:
 *  criar antes da confirmação enchia o CRM de fichas a partir de links
 *  colados por engano. */
export async function applyCapture(
  captureId: string,
  overrides: { brandName?: string; nicheId?: string | null; note?: string },
  actorUserId: string,
): Promise<{ ok: boolean; brandId?: string; opportunityId?: string; error?: string }> {
  const db = await supabaseServer();
  const { data: capture } = await db
    .from('capture_item')
    .select('id, kind, raw_input, note, extracted')
    .eq('id', captureId)
    .maybeSingle();

  if (!capture) return { ok: false, error: 'Captura não encontrada.' };

  const extracted = (capture.extracted ?? {}) as Partial<CaptureExtraction>;
  const name = overrides.brandName?.trim() || extracted.brand_name;
  if (!name) return { ok: false, error: 'Falta o nome da marca. Escreve-o e confirma.' };

  const resolved = await resolveOrCreateBrand(db, {
    name,
    website: extracted.website ?? null,
    email: extracted.contact_email ?? null,
    instagram: extracted.instagram_handle ?? null,
    countryCode: extracted.country_code ?? null,
    source: `capture:${capture.kind}`,
    notes: overrides.note ?? capture.note,
    nicheHint: overrides.nicheId ?? extracted.niche_id ?? null,
  });

  if (extracted.contact_email) {
    await db.from('contact').upsert(
      {
        brand_id: resolved.brandId,
        name: extracted.contact_name ?? '',
        role: extracted.contact_role ?? '',
        email: extracted.contact_email,
        preferred_channel: 'email' as const,
        source: `capture:${capture.kind}`,
      },
      { onConflict: 'email', ignoreDuplicates: true },
    );
  }

  if (extracted.product_name) {
    await db.from('product').insert({
      brand_id: resolved.brandId,
      name: extracted.product_name,
      retail_price_cents: extracted.product_price_cents ?? null,
      url: extracted.website ?? null,
    });
  }

  const opp = await ensureOpportunity(db, resolved.brandId, {
    title: extracted.product_name || name,
    source: `capture:${capture.kind}`,
    productName: extracted.product_name ?? '',
  });

  await db
    .from('capture_item')
    .update({
      status: 'applied',
      brand_id: resolved.brandId,
      opportunity_id: opp.id,
    })
    .eq('id', captureId);

  await recordEvent(db, {
    eventType: 'capture.received',
    brandId: resolved.brandId,
    opportunityId: opp.id,
    actorType: 'carol',
    actorUserId,
    channel: capture.kind,
    summary: extracted.summary ?? `Captura rápida (${capture.kind}) aplicada.`,
    payload: {
      captureId,
      kind: capture.kind,
      asks: extracted.asks ?? [],
      unknowns: extracted.unknowns ?? [],
      mergeCandidate: resolved.mergeCandidate,
    },
    confidence: extracted.confidence ?? null,
    dedupeKey: `capture:${captureId}:applied`,
  });

  await replanActions(db, [opp.id]);
  return { ok: true, brandId: resolved.brandId, opportunityId: opp.id };
}

export async function discardCapture(captureId: string) {
  const db = await supabaseServer();
  await db.from('capture_item').update({ status: 'discarded' }).eq('id', captureId);
}
