import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { coverVariants, routeStops } from "@/lib/domain/tour-text";
import { siteUrl } from "@/lib/site-url";
import { findTour, getPublishedCatalog } from "@/server/catalog";

// Превью ссылки на экскурсию (Telegram, ВКонтакте, мессенджеры): название, подзаголовок, маршрут, обложка в арке и логотип.
// Даты и цены сюда не попадают: соцсети подолгу хранят картинку, а они меняются.

export const alt = "Экскурсия по Петербургу — Культурная Столица";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Обновляется вместе с сайтом: правки в админке сбрасывают кэш (revalidatePublicSite).
export const revalidate = 86400;

const asset = (name: string) => readFile(join(process.cwd(), "src/assets/og", name));
const svgData = async (name: string) => `data:image/svg+xml;base64,${(await asset(name)).toString("base64")}`;

/** Фото обложки как data URI — только JPEG/PNG разумного размера: остальное генератор не отрисует, тогда будет гравюра. */
async function coverData(coverUrl: string | null): Promise<string | null> {
  if (!coverUrl) return null;
  try {
    const res = await fetch(new URL(coverUrl, siteUrl()), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) return null;
    const png = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    if (!png && !jpeg) return null;
    return `data:image/${png ? "png" : "jpeg"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const W = 420;
const H = 518;
// Гравюра без фото — как на сайте (cover.css): подложка и кадрирование знака для каждого из четырёх вариантов.
const ART = [
  { bg: "linear-gradient(160deg, #ad5233, #8a3c25)", h: 0.88, x: 0.5, y: 1.15 },
  { bg: "linear-gradient(160deg, #323c50, #1f2635)", h: 1.9, x: 0.04, y: 0.3 },
  { bg: "linear-gradient(160deg, #66775a, #4a5840)", h: 2.1, x: 0.5, y: 0.72 },
  { bg: "linear-gradient(160deg, #b78c47, #93702f)", h: 2.6, x: 0.5, y: 0.02 },
];

function Engraving({ variant, mark }: { variant: number; mark: string }) {
  const a = ART[variant] ?? ART[0];
  const ih = H * a.h;
  const iw = (ih * 491) / 545;
  return (
    <div style={{ display: "flex", position: "relative", width: W, height: H, backgroundImage: a.bg }}>
      <img src={mark} width={iw} height={ih} alt="" style={{ position: "absolute", left: (W - iw) * a.x, top: (H - ih) * a.y, opacity: 0.34 }} />
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await getPublishedCatalog();
  const item = findTour(catalog, slug);
  const [prata, playfair, ptSans, ptSansBold, mark, markLight, wordmark] = await Promise.all([
    asset("Prata-Regular.ttf"),
    asset("PlayfairDisplay-MediumItalic.ttf"),
    asset("PTSans-Regular.ttf"),
    asset("PTSans-Bold.ttf"),
    svgData("mark.svg"),
    svgData("mark-light.svg"),
    svgData("wordmark.svg"),
  ]);

  const tour = item?.tour;
  const title = tour?.title ?? "Экскурсии по Петербургу для детей и взрослых";
  const photo = await coverData(tour?.coverUrl ?? null);
  const variant = tour ? (coverVariants(catalog.map((c) => c.tour)).get(tour.slug) ?? 0) : 0;
  const stops = tour ? routeStops(tour.route).join(" · ") : "";
  const facts = tour ? [tour.durationLabel, tour.ageLabel].map((s) => s.trim()).filter(Boolean) : [];

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#f5ede0", fontFamily: "PT Sans", color: "#22293a" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 650, padding: "60px 0 56px 72px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <img src={mark} width={54} height={60} alt="" />
            <img src={wordmark} width={182} height={48} alt="" style={{ marginLeft: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {tour?.subtitle.trim() && (
              <div style={{ fontFamily: "Playfair Display", fontStyle: "italic", fontSize: 32, color: "#a34a2f" }}>{tour.subtitle.trim()}</div>
            )}
            <div style={{ fontFamily: "Prata", fontSize: title.length > 24 ? 56 : 66, lineHeight: 1.1, marginTop: 10 }}>{title}</div>
            {stops && <div style={{ fontSize: 24, lineHeight: 1.45, color: "#5c6672", marginTop: 22 }}>{stops}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 21, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            {[...facts, "Билеты онлайн"].map((f, i) => (
              <div key={f} style={{ display: "flex", alignItems: "center", color: i === facts.length ? "#a34a2f" : "#22293a" }}>
                {i > 0 && <div style={{ width: 6, height: 6, borderRadius: 3, background: "#c29a5b", margin: "0 16px" }} />}
                {f}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", position: "absolute", right: 64, top: 56, width: W, height: H, borderRadius: `${W / 2}px ${W / 2}px 10px 10px`, overflow: "hidden" }}>
          {photo ? (
            <img src={photo} width={W} height={H} alt="" style={{ objectFit: "cover" }} />
          ) : (
            <Engraving variant={variant} mark={markLight} />
          )}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Prata", data: prata, weight: 400, style: "normal" },
        { name: "Playfair Display", data: playfair, weight: 500, style: "italic" },
        { name: "PT Sans", data: ptSans, weight: 400, style: "normal" },
        { name: "PT Sans", data: ptSansBold, weight: 700, style: "normal" },
      ],
    },
  );
}
