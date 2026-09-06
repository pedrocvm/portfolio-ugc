'use client';

import { useEffect, useState, useTransition } from 'react';
import Spinner from '@/components/dashboard/Spinner';
import {
  chooseDirection,
  directionsFor,
  noMemoryForDirection,
  rateDirection,
  skipDirections,
} from '@/app/dashboard/content-brain-actions';
import type { FunctionalPillar } from '@/modules/content-brain/domain';
import type { LensSummary } from '@/modules/content-brain/lens-service';

/** Por onde procurar.
 *
 *  O degrau que faltava entre o pilar e a história. «Me conte uma situação
 *  real» é verdadeiro e é abstrato demais — ela não sabe onde procurar. Aqui
 *  a pergunta é outra: que TIPO de situação vamos buscar na memória dela.
 *
 *  Nada nesta tela é uma ideia. São direções de busca, e cada uma abre com
 *  perguntas que nunca afirmam que alguma coisa aconteceu.
 *
 *  Três saídas, sempre: escolher uma direção, dizer que já sabe o que quer
 *  contar, ou dizer que não se lembrou de nada — e aí troca-se de porta, não
 *  se inventa história. */

type Fase = 'choosing' | 'remembering';

export default function LensPicker({
  pillar,
  pillarLabel,
  onPicked,
  onSkip,
}: {
  pillar: FunctionalPillar;
  pillarLabel: string;
  /** Quando ela escolheu a direção e a pergunta que a fez lembrar. */
  onPicked: (lens: { id: string; label: string; question: string }) => void;
  /** «Já sei o que quero contar»: salta a escolha e vai direto para a captura. */
  onSkip: () => void;
}) {
  const [fase, setFase] = useState<Fase>('choosing');
  const [intro, setIntro] = useState('');
  const [primary, setPrimary] = useState<LensSummary[]>([]);
  const [more, setMore] = useState<LensSummary[]>([]);
  const [verMais, setVerMais] = useState(false);
  const [atual, setAtual] = useState<LensSummary | null>(null);
  const [tentadas, setTentadas] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await directionsFor(pillar);
      if (!vivo) return;
      setCarregando(false);
      if ('error' in r) return setErro(r.error);
      setIntro(r.intro);
      setPrimary(r.primary);
      setMore(r.more);
    })();
    return () => {
      vivo = false;
    };
  }, [pillar]);

  const escolher = (lens: LensSummary) => {
    setErro('');
    start(async () => {
      await chooseDirection(lens.id, pillar);
      setAtual(lens);
      setTentadas((t) => [...t, lens.id]);
      setFase('remembering');
    });
  };

  /** Não se lembrou. Troca-se de porta — nunca se gera uma história. */
  const naoLembrei = () => {
    if (!atual) return;
    start(async () => {
      await noMemoryForDirection(atual.id, pillar);
      const restantes = [...primary, ...more].filter((l) => ![...tentadas, atual.id].includes(l.id));
      setAtual(null);
      setFase('choosing');
      if (restantes.length === 0) {
        // Todas tentadas. A saída não é «não há ideias»: é contar diretamente.
        onSkip();
      }
    });
  };

  const naoCombina = (lens: LensSummary) => {
    start(async () => {
      await rateDirection(lens.id, 'not_for_carol');
      setPrimary((p) => p.filter((l) => l.id !== lens.id));
      setMore((m) => m.filter((l) => l.id !== lens.id));
      if (atual?.id === lens.id) {
        setAtual(null);
        setFase('choosing');
      }
    });
  };

  const pular = () => {
    start(async () => {
      await skipDirections(pillar);
      onSkip();
    });
  };

  if (carregando) {
    return (
      <p className="cbBusy" aria-live="polite">
        <Spinner />
        Um segundo…
      </p>
    );
  }

  if (erro) {
    return (
      <div className="cbStage">
        <p className="osWarn" role="alert">{erro}</p>
        <button className="osStart" type="button" onClick={pular}>
          Quero contar diretamente o que aconteceu
        </button>
      </div>
    );
  }

  if (fase === 'remembering' && atual) {
    return (
      <div className="cbStage cbLensOpen">
        <p className="cbLensEyebrow">{atual.label}</p>
        <h2>Pensando nas últimas semanas…</h2>
        <p className="osNote">{atual.whatToLookFor}</p>

        {/* Gatilhos, não um formulário. Ela não precisa responder a todas. */}
        <ul className="cbTriggers">
          {atual.memoryPrompts.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>

        {atual.abstractStructures.length ? (
          <details className="cbShapes">
            <summary>Como isso costuma ficar</summary>
            <ul>
              {atual.abstractStructures.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="cbActs">
          <button
            className="osStart"
            type="button"
            disabled={pending}
            onClick={() => onPicked({ id: atual.id, label: atual.label, question: atual.memoryPrompts[0] })}
          >
            Lembrei de uma coisa
          </button>
          <button className="focusSkip" type="button" disabled={pending} onClick={naoLembrei}>
            Não lembrei de nada
          </button>
        </div>

        <button className="chip cbLensRate" type="button" disabled={pending} onClick={() => naoCombina(atual)}>
          Esse caminho não combina comigo
        </button>
      </div>
    );
  }

  const visiveis = verMais ? [...primary, ...more] : primary;

  return (
    <div className="cbStage cbLensPick">
      <p className="cbLensEyebrow">{pillarLabel}</p>
      <h2>Por onde quer procurar?</h2>
      <p className="osNote">{intro}</p>

      <ul className="cbLenses">
        {visiveis.map((l) => (
          <li key={l.id}>
            <button type="button" disabled={pending} onClick={() => escolher(l)}>
              <strong>{l.label}</strong>
              <span>{l.description}</span>
            </button>
          </li>
        ))}
      </ul>

      {!verMais && more.length ? (
        <button className="chip" type="button" onClick={() => setVerMais(true)}>
          Outras formas de procurar ({more.length})
        </button>
      ) : null}

      <div className="cbActs">
        <button className="focusSkip" type="button" disabled={pending} onClick={pular}>
          Já sei o que quero contar
        </button>
      </div>
    </div>
  );
}
