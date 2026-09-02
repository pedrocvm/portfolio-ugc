'use client';

import { useId } from 'react';

/** Escolher o país sem sair do teclado.
 *
 *  Um `<datalist>` e não um combobox à mão: o browser já sabe filtrar enquanto
 *  se escreve, já é navegável por teclado e já é lido pelos leitores de tela.
 *  Escrever isso outra vez em JavaScript era garantir uma versão pior. */

export const COUNTRIES = [
  'Portugal', 'Brasil', 'Angola', 'Moçambique', 'Cabo Verde',
  'Espanha', 'França', 'Itália', 'Alemanha', 'Países Baixos', 'Bélgica',
  'Reino Unido', 'Irlanda', 'Suíça', 'Áustria', 'Polónia', 'Suécia',
  'Dinamarca', 'Noruega', 'Finlândia', 'EUA', 'Canadá', 'México',
  'Argentina', 'Chile', 'Colômbia', 'Timor-Leste', 'Guiné-Bissau',
  'São Tomé e Príncipe',
] as const;

export default function CountryPicker({
  value,
  onChange,
  disabled,
  label = 'País',
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  return (
    <span className="paisPick">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        list={`${id}-list`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Portugal"
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id={`${id}-list`}>
        {COUNTRIES.map((c) => (
          <option value={c} key={c} />
        ))}
      </datalist>
    </span>
  );
}
