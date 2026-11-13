/* Линейные иконки сайта: 24×24, обводка цветом текста. Декоративные — подписи всегда рядом текстом. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: P) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p}>
      {children}
    </svg>
  );
}

export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IconAge = (p: P) => <Svg {...p}><circle cx="12" cy="7" r="3" /><path d="M6.5 20c.4-4 2.6-6.5 5.5-6.5s5.1 2.5 5.5 6.5" /></Svg>;
export const IconGroup = (p: P) => (
  <Svg {...p}><circle cx="9" cy="8" r="2.6" /><circle cx="16.5" cy="9" r="2.1" /><path d="M3.5 19c.4-3.4 2.5-5.4 5.5-5.4s5.1 2 5.5 5.4M14.6 14.1c.6-.3 1.2-.4 1.9-.4 2.3 0 3.9 1.6 4.2 4.3" /></Svg>
);
export const IconPin = (p: P) => <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></Svg>;
export const IconBag = (p: P) => <Svg {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></Svg>;
export const IconCalendar = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></Svg>;
export const IconUmbrella = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 0 1 18 0H3Z" /><path d="M12 12v6.5a2 2 0 0 1-4 0M12 3v0" /></Svg>;
export const IconReturn = (p: P) => <Svg {...p}><path d="M4 10h11a5 5 0 0 1 0 10h-3" /><path d="M8 6 4 10l4 4" /></Svg>;
export const IconTicket = (p: P) => (
  <Svg {...p}><path d="M3.5 7.5h17v3a1.8 1.8 0 0 0 0 3.5v3h-17v-3a1.8 1.8 0 0 0 0-3.5v-3Z" /><path d="M14 7.5v10" strokeDasharray="1.6 2" /></Svg>
);
export const IconMail = (p: P) => <Svg {...p}><rect x="3" y="5.5" width="18" height="13" rx="1.5" /><path d="m3.5 6.5 8.5 7 8.5-7" /></Svg>;
export const IconPhone = (p: P) => (
  <Svg {...p}><path d="M6.6 3.5h2.6l1.3 4.2-1.9 1.4a11.5 11.5 0 0 0 6.3 6.3l1.4-1.9 4.2 1.3v2.6a2 2 0 0 1-2.2 2A16.8 16.8 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" /></Svg>
);
export const IconSend = (p: P) => <Svg {...p}><path d="M21 3.5 3.5 10.6l6.6 2.6m10.9-9.7-4.7 17-6.2-7.3m10.9-9.7-10.9 9.7" /></Svg>;
export const IconChat = (p: P) => <Svg {...p}><path d="M4 19.5 5.3 15A8 8 0 1 1 9 18.7L4 19.5Z" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></Svg>;
export const IconCompass = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></Svg>;
export const IconArrow = (p: P) => <Svg {...p}><path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5" /></Svg>;
export const IconMenu = (p: P) => <Svg {...p}><path d="M4 7.5h16M4 12h16M4 16.5h16" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconStar = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none"><path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8L12 3.2Z" /></Svg>
);
