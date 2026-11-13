import Link from "next/link";

/** Содержимое страницы «не найдено»: и для notFound() внутри сайта, и для несуществующих адресов. */
export function NotFoundContent() {
  return (
    <div className="wrap nf">
      <div className="nf-art" aria-hidden="true" />
      <p className="nf-code">Ошибка 404</p>
      <h1 className="nf-title">Такой страницы <em>нет</em></h1>
      <p className="nf-text">Возможно, адрес набран с ошибкой или экскурсия больше не проводится. Зато в каталоге есть другие истории Петербурга.</p>
      <div className="nf-actions">
        <Link className="btn btn--dark" href="/#catalog">Смотреть экскурсии</Link>
        <Link className="btn btn--ghost" href="/afisha">Ближайшие даты</Link>
      </div>
    </div>
  );
}
