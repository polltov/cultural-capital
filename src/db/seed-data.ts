export type SeedTour = {
  title: string;
  subtitle: string;
  route: string;
  description: string;
  note: string;
  durationLabel: string;
  ageLabel: string;
  coverUrl: string | null;
  priceChild: number;
  priceAdult: number;
  featured: boolean;
  /** Moscow local time, `YYYY-MM-DDTHH:mm` */
  sessions: string[];
};

export const SEED_TOURS: SeedTour[] = [
  {
    title: "Египетский зал Эрмитажа",
    subtitle: "боги Древнего Египта",
    route: "Мумия жреца Па-ди-иста · саркофаги · иероглифы",
    description:
      "Юные египтологи:\n\n- увидят мумию жреца Па-ди-иста и красочные саркофаги\n- познакомятся с фараонами и богами Древнего Египта\n- нарисуют иероглифы и головной убор фараона\n- выполнят задания и получат приз",
    note: "Билеты в Эрмитаж приобретаются отдельно и самостоятельно.",
    durationLabel: "2 часа",
    ageLabel: "6+",
    coverUrl: "/assets/egypt-hall.jpg",
    priceChild: 1390,
    priceAdult: 490,
    featured: true,
    sessions: ["2026-09-20T11:00", "2026-10-04T11:00"],
  },
  {
    title: "Тайна первой крепости",
    subtitle: "детский квест",
    route: "Заячий остров · Петропавловский собор · Невские ворота",
    description:
      "Юные сыщики Петербурга:\n\n- пройдут через Невские ворота и Петровскую куртину\n- узнают, как Пётр I выбирал место для первой крепости\n- разгадают шифр Петропавловского собора\n- получат карту первой столицы",
    note: "",
    durationLabel: "2 часа",
    ageLabel: "6+",
    coverUrl: null,
    priceChild: 2200,
    priceAdult: 2200,
    featured: false,
    sessions: ["2026-09-27T12:00"],
  },
  {
    title: "Мосты, которые оживают",
    subtitle: "взрослая прогулка",
    route: "Дворцовая наб. · Дворцовый мост · Троицкий мост",
    description:
      "Вечерняя прогулка вдоль Невы:\n\n- увидят развод Дворцового моста с идеальной точки\n- узнают, как поднимаются 22-тонные крылья\n- услышат истории о рабочих-«разводчиках»\n- сфотографируются на фоне ночного Петербурга",
    note: "",
    durationLabel: "1,5 часа",
    ageLabel: "8+",
    coverUrl: null,
    priceChild: 2500,
    priceAdult: 2500,
    featured: false,
    sessions: ["2026-09-26T21:30"],
  },
  {
    title: "Дворцы за один день",
    subtitle: "большая семейная",
    route: "Зимний дворец · Дворцовая · Миллионная · Эрмитажный театр",
    description:
      "Императорский Петербург крупным планом:\n\n- заглянут в парадные Зимнего дворца\n- узнают, кто такие атланты и почему их десять\n- увидят Эрмитажный театр — самый маленький в СПб\n- познакомятся с домами Миллионной улицы",
    note: "",
    durationLabel: "3 часа",
    ageLabel: "7+",
    coverUrl: null,
    priceChild: 2800,
    priceAdult: 2800,
    featured: false,
    sessions: ["2026-09-13T12:00"],
  },
];
