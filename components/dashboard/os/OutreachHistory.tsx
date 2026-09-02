import Link from 'next/link';
import { nicheShort } from '@/modules/brands/niches';
import {
  CONF_LABEL, PAID_LABEL, UGC_LABEL, countryLabel, dayLabel, dayTotals,
  groupByDay, statusLabel, summarize, summarySentence, type HistoryRow,
} from '@/modules/outreach/history';

/** Quem já foi prospectado, e se a prospeção presta.
 *
 *  A revisão diária esconde as recusadas, porque lá só interessa o que falta
 *  decidir. Aqui aparecem todas: o que ficou de fora é metade do que diz se
 *  isto está acertando. */

export type HistoryCandidate = HistoryRow & {
  website: string | null;
  socials: Record<string, string | null> | null;
  product: string | null;
  why_fit: string | null;
  why_now: string | null;
  why_may_pay: string | null;
  risk: string | null;
  paid_media_signal: string | null;
  ugc_signal: string | null;
  creative_opportunity: string | null;
  content_ideas: { title: string; angle: string }[] | null;
  sources: { label: string; url: string | null }[] | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_source: string | null;
  subject: string | null;
  body: string | null;
  rank: number | null;
};

export type Run = {
  id: string; run_date: string; kind: string; status: string;
  discovered: number; screened: number; researched: number; selected: number;
  partial_failures: string[] | null;
};

const FILTERS = [
  ['todas', 'Todas'],
  ['sent', 'Enviadas'],
  ['needs_review', 'Precisando de olhos'],
  ['ready', 'Prontas'],
  ['rejected', 'Recusadas'],
  ['skipped', 'De lado'],
] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="histField">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const SOCIALS: [string, string, (v: string) => string][] = [
  ['instagram', 'Instagram', (v) => `https://instagram.com/${v.replace(/^@/, '')}`],
  ['tiktok', 'TikTok', (v) => `https://tiktok.com/@${v.replace(/^@/, '')}`],
  ['youtube', 'YouTube', (v) => `https://youtube.com/${v.replace(/^@/, '@')}`],
  ['linkedin', 'LinkedIn', (v) => `https://linkedin.com/company/${v}`],
];

function Socials({ socials }: { socials: HistoryCandidate['socials'] }) {
  const links = SOCIALS.flatMap(([key, label, build]) => {
    const v = socials?.[key]?.trim();
    // O modelo tanto devolve `@marca` como o URL inteiro; os dois têm de abrir.
    return v ? [{ key, label, url: v.startsWith('http') ? v : build(v) }] : [];
  });
  if (links.length === 0) return null;
  return (
    <>
      {links.map((l) => (
        <a className="histSocial" key={l.key} href={l.url} target="_blank" rel="noopener noreferrer">
          {l.label}
        </a>
      ))}
    </>
  );
}

function Detail({ c }: { c: HistoryCandidate }) {
  const ideas = c.content_ideas ?? [];
  const sources = c.sources ?? [];
  const flags = c.red_flags ?? [];

  return (
    <dl className="histDetail">
      <Field label="Produto">{c.product}</Field>
      <Field label="Porquê ela">{c.why_fit}</Field>
      <Field label="Porquê agora">{c.why_now}</Field>
      <Field label="Porque pode pagar">{c.why_may_pay}</Field>
      <Field label="Sinais">
        {[c.paid_media_signal && (PAID_LABEL[c.paid_media_signal] ?? c.paid_media_signal),
          c.ugc_signal && (UGC_LABEL[c.ugc_signal] ?? c.ugc_signal)]
          .filter(Boolean)
          .join(' · ')}
      </Field>
      <Field label="Oportunidade">{c.creative_opportunity}</Field>

      {ideas.length ? (
        <Field label="Ideias">
          <ul className="histList">
            {ideas.map((i, n) => (
              <li key={n}>
                <b>{i.title}</b> — {i.angle}
              </li>
            ))}
          </ul>
        </Field>
      ) : null}

      {flags.length ? (
        <Field label="Bandeiras">
          <ul className="histList" data-tone="warn">
            {flags.map((f, n) => (
              <li key={n}>{f}</li>
            ))}
          </ul>
        </Field>
      ) : null}

      {/* Ver o que já publicam é metade da decisão, e é o primeiro lugar onde
          ela vai olhar antes de escrever seja o que for. */}
      <Field label="Onde publicam">
        <Socials socials={c.socials} />
      </Field>

      <Field label="contato">
        {c.contact_email ? (
          <>
            {c.contact_email}
            {c.contact_name ? ` — ${c.contact_name}` : ''}
            {c.contact_role ? `, ${c.contact_role}` : ''}
            {c.email_confidence ? ` (${CONF_LABEL[c.email_confidence] ?? c.email_confidence})` : ''}
            {c.contact_source ? ` · visto em ${c.contact_source}` : ''}
          </>
        ) : null}
      </Field>

      {/* As fontes existem para você conferir se a pesquisa inventou. Sem elas
          o resto desta ficha é só uma opinião bem escrita. */}
      {sources.length ? (
        <Field label="Fontes">
          <ul className="histList">
            {sources.map((s, n) => (
              <li key={n}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label}
                  </a>
                ) : (
                  s.label
                )}
              </li>
            ))}
          </ul>
        </Field>
      ) : null}

      <Field label="Email">
        {c.subject ? (
          <div className="histMail">
            <b>{c.subject}</b>
            <p>{c.body}</p>
          </div>
        ) : (
          // Um campo vazio faz a pessoa procurar o que não existe. Dizer porquê
          // custa uma frase e poupa a procura.
          <span className="histNone">
            Não escrevi o email: ficou abaixo do corte de encaixe. Pode pedi-lo
            em <Link href="/dashboard/outreach">Prospeção</Link>.
          </span>
        )}
      </Field>

      {c.quality && !c.quality.pass ? (
        <Field label="Qualidade">
          <span data-tone="warn">
            {c.quality.score}/100 — {c.quality.failures.join('; ')}
          </span>
        </Field>
      ) : null}

      <Field label="Motivo de recusa">{c.reject_reason}</Field>
    </dl>
  );
}

export default function OutreachHistory({
  rows,
  runs,
  filter,
}: {
  rows: HistoryCandidate[];
  runs: Run[];
  filter: string;
}) {
  const summary = summarize(rows);
  const days = groupByDay(rows);
  const totals = dayTotals(runs);

  return (
    <>
      <div className="dashBar">
        <h1>Histórico</h1>
        <Link className="osMore" href="/dashboard/outreach">
          Voltar à revisão de hoje
        </Link>
      </div>

      <p className="osBrief">{summarySentence(summary)}</p>

      {summary.total > 0 ? (
        <div className="histStats">
          <div>
            <b>{summary.avgFit ?? '—'}</b>
            <span>encaixe médio</span>
          </div>
          <div>
            <b>
              {summary.qualityPassed}/{summary.qualityChecked || '—'}
            </b>
            <span>emails no corte</span>
          </div>
          <div>
            <b>{summary.sent}</b>
            <span>enviadas</span>
          </div>
          <div>
            <b>{summary.discarded}</b>
            <span>de lado</span>
          </div>
        </div>
      ) : null}

      {summary.topFailures.length ? (
        <p className="histNote">
          Onde os emails falham: {summary.topFailures.map((f) => `${f.reason} (${f.count})`).join(', ')}.
        </p>
      ) : null}

      <nav className="histFilters">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={value === 'todas' ? '/dashboard/outreach/history' : `/dashboard/outreach/history?status=${value}`}
            aria-current={filter === value ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {days.length === 0 ? (
        <p className="osEmpty">
          {filter === 'todas'
            ? 'Ainda não correu nenhuma prospeção.'
            : 'Nenhuma marca neste estado.'}
        </p>
      ) : null}

      {days.map(({ day, rows: doDia }, i) => {
        const t = totals.get(day);
        const enviadas = doDia.filter((c) => c.status === 'sent').length;
        return (
          // Os dias antigos ficam fechados: com um mês de corridas, a lista
          // aberta é uma parede por onde ela tem de rolar até ao que interessa.
          <details className="histDay" key={day} open={i < 2}>
            <summary>
              <span className="histDayName">{dayLabel(day)}</span>
              <span className="histDayCount">
                {doDia.length} {doDia.length === 1 ? 'marca' : 'marcas'}
                {enviadas ? `, ${enviadas} enviada${enviadas === 1 ? '' : 's'}` : ''}
              </span>
              {t ? (
                <span className="histDayRun">
                  {t.runs > 1 ? `${t.runs} procuras · ` : ''}
                  {t.discovered} encontradas · {t.researched} pesquisadas · {t.selected} escolhidas
                </span>
              ) : null}
            </summary>

            {doDia.map((c) => (
              <details className="histRow" key={c.id}>
                <summary>
                  <span className="histName">{c.name}</span>
                  {c.fit_score !== null ? <span className="histFit">{c.fit_score}</span> : null}
                  {nicheShort(c.niche_id) ? (
                    <span className="histNiche">{nicheShort(c.niche_id)}</span>
                  ) : null}
                  <span className="histStatus" data-status={c.status}>
                    {statusLabel(c.status)}
                  </span>
                  {countryLabel(c.country) ? (
                    <span className="histWhere">{countryLabel(c.country)}</span>
                  ) : null}
                </summary>
                <Detail c={c} />
              </details>
            ))}
          </details>
        );
      })}
    </>
  );
}
