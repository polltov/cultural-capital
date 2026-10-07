// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

type WidgetOptions = { confirmation_token: string; return_url: string; customization?: unknown; error_callback?: (e: unknown) => void };
class FakeWidget {
  static instances: FakeWidget[] = [];
  render = vi.fn(async () => {});
  destroy = vi.fn();
  constructor(public opts: WidgetOptions) { FakeWidget.instances.push(this); }
}

const SRC = "https://yookassa.ru/checkout-widget/v1/checkout-widget.js";
const scripts = () => Array.from(document.querySelectorAll<HTMLScriptElement>("script")).filter((s) => s.src === SRC);

// Загрузчик хранит состояние на уровне модуля — каждому тесту нужен свежий.
async function load() {
  vi.resetModules();
  return (await import("@/components/site/PaymentWidget")).PaymentWidget;
}

// Сбои виджета и загрузки пишутся в console.error: перехватываем, чтобы вывод тестов оставался чистым.
const errorLog = vi.spyOn(console, "error");

beforeEach(() => {
  FakeWidget.instances = [];
  delete window.YooMoneyCheckoutWidget;
  errorLog.mockReset();
  errorLog.mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  scripts().forEach((s) => s.remove());
  delete window.YooMoneyCheckoutWidget;
});

describe("PaymentWidget", () => {
  it("скрипт ЮKassa подгружается один раз на все монтирования, виджет создаётся после загрузки", async () => {
    const PaymentWidget = await load();
    const props = { confirmationToken: "ct-1", returnUrl: "https://x.test/order/abc", onError: () => {} };
    const a = render(<PaymentWidget {...props} />);
    const b = render(<PaymentWidget {...props} />);
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].async).toBe(true);
    expect(FakeWidget.instances).toHaveLength(0);

    window.YooMoneyCheckoutWidget = FakeWidget;
    scripts()[0].dispatchEvent(new Event("load"));
    await waitFor(() => expect(FakeWidget.instances).toHaveLength(2));
    a.unmount();
    b.unmount();

    // Скрипт уже на странице: новое монтирование его не подгружает.
    render(<PaymentWidget {...props} />);
    await waitFor(() => expect(FakeWidget.instances).toHaveLength(3));
    expect(scripts()).toHaveLength(1);
  });

  it("создаёт виджет с токеном, return_url, цветом кнопки и рисует его в #payment-form; destroy при размонтировании", async () => {
    const PaymentWidget = await load();
    window.YooMoneyCheckoutWidget = FakeWidget;
    const { container, unmount } = render(<PaymentWidget confirmationToken="ct-7" returnUrl="https://x.test/order/abc" onError={() => {}} />);
    await waitFor(() => expect(FakeWidget.instances).toHaveLength(1));

    const w = FakeWidget.instances[0];
    expect(w.opts).toMatchObject({
      confirmation_token: "ct-7", return_url: "https://x.test/order/abc",
      customization: { colors: { control_primary: "#a34a2f" } },
    });
    expect(w.render).toHaveBeenCalledWith("payment-form");
    expect(container.querySelector("#payment-form")).toBeTruthy();
    expect(scripts()).toHaveLength(0);

    expect(w.destroy).not.toHaveBeenCalled();
    unmount();
    expect(w.destroy).toHaveBeenCalledTimes(1);
  });

  it("ошибка виджета (error_callback) и ошибка рендера вызывают onError", async () => {
    const PaymentWidget = await load();
    window.YooMoneyCheckoutWidget = FakeWidget;
    const onError = vi.fn();
    render(<PaymentWidget confirmationToken="ct-1" returnUrl="https://x.test/o" onError={onError} />);
    await waitFor(() => expect(FakeWidget.instances).toHaveLength(1));
    FakeWidget.instances[0].opts.error_callback?.({ error: "invalid_token" });
    expect(onError).toHaveBeenCalledTimes(1);

    cleanup();
    class Broken extends FakeWidget { render = vi.fn(async () => { throw new Error("boom"); }); }
    window.YooMoneyCheckoutWidget = Broken;
    render(<PaymentWidget confirmationToken="ct-1" returnUrl="https://x.test/o" onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(errorLog).toHaveBeenCalledTimes(2);
  });

  it("не загрузился скрипт: onError, а следующая попытка подгружает скрипт заново", async () => {
    const PaymentWidget = await load();
    const onError = vi.fn();
    const props = { confirmationToken: "ct-1", returnUrl: "https://x.test/o", onError };
    const first = render(<PaymentWidget {...props} />);
    scripts()[0].dispatchEvent(new Event("error"));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(FakeWidget.instances).toHaveLength(0);
    first.unmount();

    render(<PaymentWidget {...props} />);
    expect(scripts()).toHaveLength(1);
    window.YooMoneyCheckoutWidget = FakeWidget;
    scripts()[0].dispatchEvent(new Event("load"));
    await waitFor(() => expect(FakeWidget.instances).toHaveLength(1));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("размонтирование до загрузки скрипта: виджет не создаётся", async () => {
    const PaymentWidget = await load();
    const { unmount } = render(<PaymentWidget confirmationToken="ct-1" returnUrl="https://x.test/o" onError={() => {}} />);
    unmount();
    window.YooMoneyCheckoutWidget = FakeWidget;
    scripts()[0].dispatchEvent(new Event("load"));
    await new Promise((r) => setTimeout(r, 20));
    expect(FakeWidget.instances).toHaveLength(0);
  });
});
