import QRCode from "qrcode";

// Тёмные модули — цвет текста сайта на белом: контраст для сканера как у чёрного.
const COLOR = { dark: "#22293a", light: "#ffffff" };

/** SVG для страницы билета (печатается вместе с ней). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: COLOR });
}

/** PNG для писем. */
export function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 360, color: COLOR });
}
