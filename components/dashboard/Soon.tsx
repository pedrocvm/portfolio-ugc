export default function Soon({
  title,
  intro,
  items,
}: {
  title: string;
  intro: string;
  items: string[];
}) {
  return (
    <>
      <div className="dashBar">
        <h1>{title}</h1>
        <span className="dashState">Em breve</span>
      </div>
      <div className="soonBox">
        <h2>Ainda não está pronto.</h2>
        <p>{intro}</p>
        <ul className="soonList">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
