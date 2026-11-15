import { siteUrl } from "@/lib/site-url";

/**
 * QR-код билета ведёт на страницу отметки прихода в админке: гид сканирует его обычной камерой телефона,
 * на котором он вошёл в админку. Токен — тот же, что у страницы заказа: QR не раскрывает ничего сверх ссылки на билет.
 */
export const checkinPath = (token: string) => `/admin/checkin/${token}`;
export const checkinUrl = (token: string) => `${siteUrl()}${checkinPath(token)}`;
/** Картинка QR-кода для писем (почтовые клиенты не показывают встроенный SVG). */
export const ticketQrImageUrl = (token: string) => `${siteUrl()}/order/${token}/qr`;

/** 32 байта в base64url — формат токена страницы заказа (`startCheckout`). */
export const ORDER_TOKEN = /^[A-Za-z0-9_-]{43}$/;
