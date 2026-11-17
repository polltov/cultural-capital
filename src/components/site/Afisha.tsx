import Link from "next/link";
import type { ContactLink } from "@/lib/contacts";
import { HOLD_MINUTES } from "@/lib/domain/seats";
import { ScheduleList, type ScheduleRow } from "./Schedule";
import { SectionHead } from "./SectionHead";
import { ContactButtons } from "./StaticSections";

/** Пустая афиша: честно говорим, что даты готовятся, и даём написать, если есть куда. */
export function EmptySchedule({ contacts }: { contacts: ContactLink[] }) {
  const hasContacts = contacts.length > 0;
  return (
    <div className="empty empty--card">
      <p className="empty-title">Новые даты готовим — загляните чуть позже.</p>
      {hasContacts && (
        <>
          <p>Напишите нам — сообщим, когда откроется запись, или подберём индивидуальную экскурсию.</p>
          <ContactButtons contacts={contacts} requestTour />
        </>
      )}
    </div>
  );
}

/** Ближайшие даты на главной: несколько сеансов и ссылка на всю афишу. */
export function AfishaPreview({ items, total, contacts }: { items: ScheduleRow[]; total: number; contacts: ContactLink[] }) {
  return (
    <section className="afisha-sec" id="afisha" aria-labelledby="afisha-title">
      <div className="wrap">
        <SectionHead
          kicker="Афиша"
          id="afisha-title"
          align="start"
          title={<>Ближайшие <em>даты</em></>}
          lead={items.some(({ session }) => session.free > 0) ? `Выберите день — места держатся за вами ${HOLD_MINUTES} минут, пока вы оплачиваете.` : undefined}
          action={total > 0 ? <Link className="link-more" href="/afisha">Вся афиша{total > items.length ? ` · ${total}` : ""} <span aria-hidden="true">→</span></Link> : undefined}
        />
        {items.length > 0 ? <ScheduleList items={items} /> : <EmptySchedule contacts={contacts} />}
      </div>
    </section>
  );
}
