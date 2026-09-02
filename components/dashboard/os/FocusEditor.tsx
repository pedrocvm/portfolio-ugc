'use client';

import { useState, useTransition } from 'react';
import { saveFocus } from '@/app/dashboard/outreach-actions';
import Spinner from '@/components/dashboard/Spinner';
import { pushToast } from '@/components/dashboard/Toasts';
import { KNOWN_NICHES, MAX_COUNTRIES, MAX_NICHES, nicheIdFor, type Focus } from '@/modules/outreach/focus';
import CountryPicker from './CountryPicker';

/** O foco da busca automática, editável aqui e não em Definições.
 *
 *  Estava no código: mudar o que o CarolOS procura de manhã era um commit, o
 *  que na prática queria dizer que nunca mudava. */
export default function FocusEditor({ initial }: { initial: Focus }) {
  const [niches, setNiches] = useState(initial.niches);
  const [countries, setCountries] = useState(initial.countries);
  const [perDay, setPerDay] = useState(initial.perDay);
  const [novo, setNovo] = useState('');
  const [novoPais, setNovoPais] = useState('');
  const [pending, start] = useTransition();
  const [sujo, setSujo] = useState(false);

  const mexeu = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSujo(true);
  };

  const juntar = (label: string) => {
    const nome = label.trim();
    if (!nome) return;
    const id = nicheIdFor(nome);
    if (!id || niches.some((n) => n.id === id) || niches.length >= MAX_NICHES) return;
    mexeu(setNiches)([...niches, { id, label: nome, favourite: false }]);
    setNovo('');
  };

  return (
    <div className="foco">
      <p className="focoIntro">
        Todos os dias, de manhã, o CarolOS procura marcas dentro deste foco. Aqui
        muda-se sem sair da tela.
      </p>

      <div className="focoCampo">
        <span className="focoLabel">Nichos</span>
        <div className="focoLista">
          {niches.map((n) => (
            <div className="focoNicho" key={n.id} data-fav={n.favourite || undefined}>
              <div className="focoNichoTopo">
                <button
                  type="button"
                  className="chipFav"
                  aria-pressed={n.favourite}
                  title={n.favourite ? 'Sai dos favoritos' : 'Procurar este mais vezes'}
                  onClick={() =>
                    mexeu(setNiches)(niches.map((x) => (x.id === n.id ? { ...x, favourite: !x.favourite } : x)))
                  }
                >
                  {n.favourite ? '★' : '☆'}
                </button>
                <b>{n.label}</b>
                <button
                  type="button"
                  className="chipX"
                  aria-label={`Tirar ${n.label} do foco`}
                  onClick={() => mexeu(setNiches)(niches.filter((x) => x.id !== n.id))}
                >
                  ×
                </button>
              </div>

              {/* O rótulo diz o sector; isto diz o que ela quer lá dentro. Sem
                  isto, «hotéis» traz o hotel genérico mais próximo. */}
              <textarea
                className="focoNota2"
                rows={2}
                value={n.note ?? ''}
                placeholder="O que procurar aqui? Ex.: que façam parcerias em troca de estadia e contratem creators de forma fixa."
                aria-label={`O que procurar em ${n.label}`}
                onChange={(e) =>
                  mexeu(setNiches)(
                    niches.map((x) => (x.id === n.id ? { ...x, note: e.target.value } : x)),
                  )
                }
              />
            </div>
          ))}
        </div>

        <div className="focoAdd">
          <input
            value={novo}
            list="nichos-conhecidos"
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                juntar(novo);
              }
            }}
            placeholder="Hotéis, restaurantes, mobiliário…"
            aria-label="Acrescentar nicho"
            disabled={niches.length >= MAX_NICHES}
          />
          <datalist id="nichos-conhecidos">
            {KNOWN_NICHES.map((n) => (
              <option value={n.label} key={n.id} />
            ))}
          </datalist>
          <button type="button" onClick={() => juntar(novo)} disabled={!novo.trim()}>
            Acrescentar
          </button>
        </div>
        <p className="focoNota">
          A estrela procura esse nicho mais vezes. Os outros entram por rotação.
          A nota de cada um vai para a procura — quanto mais concreta, melhores
          as marcas que aparecem.
        </p>
      </div>

      <div className="focoCampo">
        <span className="focoLabel">Países</span>
        <div className="focoChips">
          {countries.map((c) => (
            <span className="chipFoco" key={c}>
              {c}
              <button
                type="button"
                className="chipX"
                aria-label={`Tirar ${c}`}
                onClick={() => mexeu(setCountries)(countries.filter((x) => x !== c))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {countries.length < MAX_COUNTRIES ? (
          <div className="focoAdd">
            <CountryPicker value={novoPais} onChange={setNovoPais} label="Acrescentar país" />
            <button
              type="button"
              disabled={!novoPais.trim() || countries.includes(novoPais.trim())}
              onClick={() => {
                mexeu(setCountries)([...countries, novoPais.trim()]);
                setNovoPais('');
              }}
            >
              Acrescentar
            </button>
          </div>
        ) : null}
      </div>

      <div className="focoCampo">
        <label className="focoLabel" htmlFor="foco-dia">
          Marcas por dia
        </label>
        <input
          id="foco-dia"
          type="number"
          min={1}
          max={40}
          value={perDay}
          onChange={(e) => mexeu(setPerDay)(Number(e.target.value))}
          className="focoNum"
        />
      </div>

      <div className="focoActs">
        <button
          className="osGo"
          type="button"
          disabled={pending || !sujo}
          onClick={() =>
            start(async () => {
              const r = await saveFocus({ niches, countries, perDay });
              pushToast(r.error ?? 'Foco salvo. É o que o CarolOS procura amanhã.', r.error ? 'warn' : 'ok');
              if (!r.error) setSujo(false);
            })
          }
        >
          {pending ? <Spinner label="Salvando" /> : null}
          {sujo ? 'Salvar foco' : 'Foco salvo'}
        </button>
      </div>
    </div>
  );
}
