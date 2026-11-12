import Image from "next/image";
import Link from "next/link";

/** Разделы сайта: шапка, меню на телефоне и подвал. */
export const NAV = [
  { href: "/#catalog", label: "Экскурсии" },
  { href: "/afisha", label: "Афиша" },
  { href: "/#about", label: "О нас" },
  { href: "/#reviews", label: "Отзывы" },
  { href: "/#faq", label: "Вопросы" },
  { href: "/news", label: "Новости" },
];

/**
 * Знак с атлантами и надпись «Культурная Столица» — векторные копии логотипа; `light` — для тёмного фона.
 * В шапке грузится сразу, в подвале (`lazy`) — когда до него докрутят.
 */
export function Logo({ light = false, className = "logo", lazy = false }: { light?: boolean; className?: string; lazy?: boolean }) {
  const loading = lazy ? "lazy" : "eager";
  return (
    <Link className={className} href="/" aria-label="Культурная Столица — на главную">
      <Image className="logo-mark" src={light ? "/brand/mark-light.svg" : "/brand/mark.svg"} width={491} height={545} alt="" loading={loading} />
      <Image className="logo-word" src={light ? "/brand/wordmark-light.svg" : "/brand/wordmark.svg"} width={931} height={245} alt="" loading={loading} />
    </Link>
  );
}
