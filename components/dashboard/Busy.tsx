/** Filete de 1px que percorre o topo enquanto o servidor trabalha. É o único
 *  sinal de "a máquina está fazendo": discreto, mas inequívoco. */
export default function Busy({ on }: { on: boolean }) {
  return <i className="wire" data-on={on || undefined} aria-hidden="true" />;
}
