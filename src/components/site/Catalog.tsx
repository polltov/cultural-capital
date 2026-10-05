import { TicketCard, type TicketTour, type TicketSession } from "./TicketCard";

type Item = { tour: TicketTour; sessions: TicketSession[] };

// Moscow time (UTC+3). Temporary hardcoded data until the DB-backed catalog (Task 5).
const CATALOG: Item[] = [
  {
    tour: {
      number: 1,
      title: "Египетский зал Эрмитажа",
      subtitle: "боги Древнего Египта",
      route: "Мумия жреца Па-ди-иста · саркофаги · иероглифы",
      description:
        "Юные египтологи:\n- увидят мумию жреца Па-ди-иста и красочные саркофаги\n- познакомятся с фараонами и богами Древнего Египта\n- нарисуют иероглифы и головной убор фараона\n- выполнят задания и получат приз",
      note: "Билеты в Эрмитаж приобретаются отдельно и самостоятельно.",
      durationLabel: "2 часа",
      ageLabel: "6+",
      coverUrl: "/assets/egypt-hall.jpg",
      priceChild: 1390,
      priceAdult: 490,
      featured: true,
    },
    sessions: [
      { id: 1, startsAt: new Date("2026-09-20T11:00:00+03:00"), free: 4 },
      { id: 2, startsAt: new Date("2026-10-04T11:00:00+03:00"), free: 4 },
    ],
  },
  {
    tour: {
      number: 2,
      title: "Тайна первой крепости",
      subtitle: "детский квест",
      route: "Заячий остров · Петропавловский собор · Невские ворота",
      description:
        "Юные сыщики Петербурга:\n- пройдут через Невские ворота и Петровскую куртину\n- узнают, как Пётр I выбирал место для первой крепости\n- разгадают шифр Петропавловского собора\n- получат карту первой столицы",
      note: null,
      durationLabel: "2 часа",
      ageLabel: "6+",
      coverUrl: null,
      priceChild: 2200,
      priceAdult: 2200,
      featured: false,
    },
    sessions: [{ id: 3, startsAt: new Date("2025-09-27T12:00:00+03:00"), free: 6 }],
  },
  {
    tour: {
      number: 3,
      title: "Мосты, которые оживают",
      subtitle: "взрослая прогулка",
      route: "Дворцовая наб. · Дворцовый мост · Троицкий мост",
      description:
        "Вечерняя прогулка вдоль Невы:\n- увидят развод Дворцового моста с идеальной точки\n- узнают, как поднимаются 22-тонные крылья\n- услышат истории о рабочих-«разводчиках»\n- сфотографируются на фоне ночного Петербурга",
      note: null,
      durationLabel: "1,5 часа",
      ageLabel: "8+",
      coverUrl: null,
      priceChild: 2500,
      priceAdult: 2500,
      featured: false,
    },
    sessions: [{ id: 4, startsAt: new Date("2025-09-26T21:30:00+03:00"), free: 10 }],
  },
  {
    tour: {
      number: 4,
      title: "Дворцы за один день",
      subtitle: "большая семейная",
      route: "Зимний дворец · Дворцовая · Миллионная · Эрмитажный театр",
      description:
        "Императорский Петербург крупным планом:\n- заглянут в парадные Зимнего дворца\n- узнают, кто такие атланты и почему их десять\n- увидят Эрмитажный театр — самый маленький в СПб\n- познакомятся с домами Миллионной улицы",
      note: null,
      durationLabel: "3 часа",
      ageLabel: "7+",
      coverUrl: null,
      priceChild: 2800,
      priceAdult: 2800,
      featured: false,
    },
    sessions: [{ id: 5, startsAt: new Date("2025-09-13T12:00:00+03:00"), free: 7 }],
  },
];

export function Catalog() {
  return (
    <>
      <div className="section-h" id="catalog">
        <div className="kicker">каталог</div>
        <div className="stitle">Наши <em>экскурсии</em></div>
        <div className="sdesc">Каждая прогулка — как маленький спектакль: сюжет, герои и город, который открывается заново.</div>
      </div>
      <div className="catalog">
        {CATALOG.map(({ tour, sessions }) => (
          <TicketCard key={tour.number} tour={tour} sessions={sessions} />
        ))}
      </div>
    </>
  );
}
