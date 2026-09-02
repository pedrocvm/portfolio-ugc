/** Que tipo de coisa é isto que ela colou.
 *
 *  Havia sete botões — Link, Conversa, Perfil, Produto, Briefing, Print, Outro
 *  — e escolher entre eles é uma decisão técnica que não é dela. Pior: é uma
 *  decisão que o sistema consegue tomar quase sempre, e nas vezes em que não
 *  consegue não importa muito, porque a extração olha para o conteúdo na mesma.
 *
 *  Puro de propósito: é a regra, e tem teste. O seletor continua existindo
 *  atrás de «não é isso», para as vezes em que o palpite sai ao lado. */

import type { CaptureKind } from './service';

export type Guess = {
  kind: CaptureKind;
  /** O que dizer à Carol sobre o que foi percebido. Uma frase, sem jargão. */
  label: string;
  /** Falso quando o palpite é o fallback e não uma leitura do conteúdo. */
  sure: boolean;
};

const PERFIS = [
  { host: 'instagram.com', nome: 'um perfil de Instagram' },
  { host: 'tiktok.com', nome: 'um perfil de TikTok' },
  { host: 'linkedin.com', nome: 'um perfil de LinkedIn' },
  { host: 'facebook.com', nome: 'uma página de Facebook' },
  { host: 'youtube.com', nome: 'um canal de YouTube' },
];

/** Palavras que só aparecem quando alguém está descrevendo um trabalho. */
const BRIEF = [
  'briefing', 'brief', 'entregáveis', 'entregaveis', 'deliverables',
  'campanha', 'deadline', 'prazo de entrega', 'guidelines', 'moodboard',
  'shotlist', 'shot list', 'roteiro', 'script',
];

/** Marcas de uma conversa colada: cabeçalhos de email, horas, «disse». */
const CONVERSA = [
  /^\s*(de|from|para|to|assunto|subject|enviado|sent)\s*:/im,
  /\bescreveu\s*:/i,
  /\bwrote\s*:/i,
  /^\s*>.+/m,
  /\b\d{1,2}:\d{2}\b.*\n.*\b\d{1,2}:\d{2}\b/s,
];

const URL_SOZINHO = /^https?:\/\/\S+$/i;

const semAcento = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Um endereço dentro do texto, mesmo que não esteja sozinho. */
function primeiroUrl(text: string): URL | null {
  const m = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (!m) return null;
  try {
    return new URL(m[0]);
  } catch {
    return null;
  }
}

export function detectKind(raw: string, fileName?: string | null): Guess {
  const text = raw.trim();

  // Uma imagem é sempre um print, venha de onde vier.
  if (fileName && /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(fileName)) {
    return { kind: 'screenshot', label: 'uma imagem', sure: true };
  }

  if (!text) return { kind: 'text', label: 'uma nota', sure: false };

  const url = primeiroUrl(text);
  const soUrl = URL_SOZINHO.test(text);

  if (url && soUrl) {
    const host = url.hostname.replace(/^www\./, '');
    const perfil = PERFIS.find((p) => host.endsWith(p.host));
    if (perfil) return { kind: 'profile', label: perfil.nome, sure: true };

    // Um endereço com caminho de loja é um produto, não a marca inteira. É a
    // diferença entre «esta marca interessa» e «este é o produto que me deram».
    if (/\/(produto|product|products|shop|store|p)\//i.test(url.pathname)) {
      return { kind: 'product', label: 'uma página de produto', sure: true };
    }
    return { kind: 'url', label: `o site ${host}`, sure: true };
  }

  const plano = semAcento(text);
  if (CONVERSA.some((re) => re.test(text))) {
    return { kind: 'conversation', label: 'uma conversa', sure: true };
  }

  // Um briefing é longo e traz vocabulário de trabalho. Uma frase com a palavra
  // «campanha» é uma nota, não um briefing.
  const palavras = BRIEF.filter((p) => plano.includes(semAcento(p))).length;
  if (palavras >= 2 && text.length > 200) {
    return { kind: 'brief', label: 'um briefing', sure: true };
  }

  if (url) return { kind: 'url', label: `o site ${url.hostname.replace(/^www\./, '')}`, sure: true };

  return { kind: 'text', label: 'uma nota', sure: false };
}
