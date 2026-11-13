/** Заголовок секции: подпись-«кикер», название (можно с курсивным акцентом в <em>) и вводный абзац. */
export function SectionHead({ kicker, title, lead, id, align = "center", action, level = 2 }: {
  kicker?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  id?: string;
  align?: "center" | "start";
  action?: React.ReactNode;
  level?: 1 | 2;
}) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <div className={`shead shead--${align}`}>
      <div className="shead-text">
        {kicker && <p className="kicker">{kicker}</p>}
        <H className="stitle" id={id}>{title}</H>
        {lead && <p className="slead">{lead}</p>}
      </div>
      {action}
    </div>
  );
}
