import Link from "next/link";
import { contactLinks } from "@/lib/contacts";
import { HOLD_MINUTES } from "@/lib/domain/seats";
import { ScheduleList, type ScheduleRow } from "./Schedule";
import { SectionHead } from "./SectionHead";
import { ContactButtons } from "./StaticSections";

/** Пустая афиша: честно говорим, что даты готовятся, и даём написать, если есть куда. */
export function EmptySchedule({ text = "Новые даты готовим — загляните чуть позже." }: { text?: string }) {
  const hasContacts = contactLinks().length > 0;
  return (
    <div className="empty empty--card">
      <p className="empty-title">{text}</p>
      {hasContacts && (
        <>
          <p>Напишите нам — сообщим, когда откроется запись, или подберём индивидуальную экскурсию.</p>
          <ContactButtons />
        </>
      )}
    </div>
  );
}

/** Ближайшие даты на главной: несколько сеансов и ссылка на всю афишу. */
export function AfishaPreview({ items, total }: { items: ScheduleRow[]; total: number }) {
  return (
    <section className="afisha-sec" id="afisha" aria-labelledby="afisha-title">
      <div className="wrap">
        <SectionHead
          kicker="Афиша"
          id="afisha-title"
          align="start"
          title={<>Ближайшие <em>даты</em></>}
          lead={items.length > 0 ? `Выберите день — места держатся за вами ${HOLD_MINUTES} минут, пока вы оплачиваете.` : undefined}
          action={total > 0 ? <Link className="link-more" href="/afisha">Вся афиша{total > items.length ? ` · ${total}` : ""} <span aria-hidden="true">→</span></Link> : undefined}
        />
        {items.length > 0 ? <ScheduleList items={items} /> : <EmptySchedule />}
      </div>
    </section>
  );
}
