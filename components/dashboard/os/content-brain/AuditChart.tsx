import type { AccountPoint } from '@/modules/content-brain/audit';

/** A evolução da conta, em SVG.
 *
 *  Uma linha por pergunta, e só as perguntas que os dados respondem: quantos
 *  seguidores ganhou, e quantas contas alcançou. Sem donut, sem radar, sem
 *  décimo quinto gráfico só porque o dado existe.
 *
 *  Um dia sem medição abre um buraco na linha em vez de a ligar em linha reta:
 *  interpolar seria desenhar uma medição que não houve. */

const W = 720;
const H = 132;
const PAD = { top: 10, right: 6, bottom: 18, left: 6 };

type Serie = { key: 'followersDelta' | 'reach'; label: string; values: (number | null)[] };

const dia = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });

/** Os segmentos contínuos de uma série. Cada buraco corta o traço. */
function segments(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string[] {
  const out: string[] = [];
  let atual: string[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (atual.length > 1) out.push(atual.join(' '));
      atual = [];
      return;
    }
    atual.push(`${atual.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
  });
  if (atual.length > 1) out.push(atual.join(' '));
  return out;
}

export default function AuditChart({ points, label }: { points: AccountPoint[]; label: string }) {
  const medidos = points.filter((p) => p.followersDelta !== null || p.reach !== null);
  if (medidos.length < 2) {
    return (
      <p className="osEmpty">
        Ainda estou construindo o histórico diário da conta. A curva aparece quando houver pelo menos
        dois dias medidos.
      </p>
    );
  }

  const series: Serie[] = [
    { key: 'followersDelta', label: 'Seguidores ganhos por dia', values: points.map((p) => p.followersDelta) },
    { key: 'reach', label: 'Contas alcançadas', values: points.map((p) => p.reach) },
  ].filter((s) => s.values.some((v) => v !== null)) as Serie[];

  if (!series.length) {
    return <p className="osEmpty">Ainda não tenho medições diárias da conta neste período.</p>;
  }

  const n = points.length;
  const x = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right));

  return (
    <div className="auChart">
      {series.map((s) => {
        const vivos = s.values.filter((v): v is number => v !== null);
        const max = Math.max(...vivos, 0);
        const min = Math.min(...vivos, 0);
        const span = max - min || 1;
        const y = (v: number) => PAD.top + (1 - (v - min) / span) * (H - PAD.top - PAD.bottom);
        const zero = min < 0 && max > 0 ? y(0) : null;

        return (
          <figure className="auChartOne" key={s.key}>
            <figcaption>
              {s.label}
              <span className="osNote"> · {label}</span>
            </figcaption>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${s.label}: de ${new Intl.NumberFormat('pt-BR').format(min)} a ${new Intl.NumberFormat('pt-BR').format(max)} entre ${dia(points[0].observedOn)} e ${dia(points[n - 1].observedOn)}.`}
            >
              {zero !== null ? <line className="auChartZero" x1={PAD.left} x2={W - PAD.right} y1={zero} y2={zero} /> : null}
              {segments(s.values, x, y).map((d, i) => (
                <path key={i} className="auChartLine" d={d} />
              ))}
              {s.values.map((v, i) =>
                v === null ? null : <circle key={i} className="auChartDot" cx={x(i)} cy={y(v)} r={2.4} />,
              )}
            </svg>
            {/* O leitor de tela recebe a tabela; a linha é decorativa para ele. */}
            <table className="visually-hidden">
              <caption>{s.label}</caption>
              <thead>
                <tr><th scope="col">Dia</th><th scope="col">Valor</th></tr>
              </thead>
              <tbody>
                {points.map((p, i) => (
                  <tr key={p.observedOn}>
                    <th scope="row">{dia(p.observedOn)}</th>
                    <td>{s.values[i] === null ? 'indisponível' : new Intl.NumberFormat('pt-BR').format(s.values[i] as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="auChartScale">
              <span>{dia(points[0].observedOn)}</span>
              <span>{dia(points[n - 1].observedOn)}</span>
            </p>
          </figure>
        );
      })}
    </div>
  );
}
