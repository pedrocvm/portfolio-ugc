import { IMAGES } from '@/lib/site';

const FORMATS = [
  ['Demonstração de produto', ''],
  ['Review', ''],
  ['Rotina', ''],
  ['Unboxing', ''],
  ['Voice-over', 'A combinar'],
];

export default function Formats() {
  return (
    <section id="formatos" className="chap" aria-label="Formatos">
      <div className="wrap">
        <div className="chapHead">
          <span className="mono cn">01</span>
          <span className="mono eyebrow">Formatos</span>
          <i />
        </div>
        <div className="chapGrid two">
          <div>
            <h2 className="disp">
              O que posso <em className="serif-it">gravar.</em>
            </h2>
            <ul className="fmt">
              {FORMATS.map(([name, note]) => (
                <li key={name}>
                  <span>{name}</span>
                  {note ? <span className="st mono">{note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <figure className="chapShot">
            <img src={IMAGES.formats} alt="Carol Queiroz de perfil" />
          </figure>
        </div>
      </div>
    </section>
  );
}
