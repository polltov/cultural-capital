"use client";

import { useState, useTransition, type ReactNode } from "react";
import { saveSiteSectionAction } from "@/app/admin/(panel)/site/actions";
import { defaultSiteContent, MAX_SITE_ITEMS, type SiteContent, type SiteSection } from "@/lib/site-content";
import { ImageDrop } from "./ImageDrop";

type Fields<K extends SiteSection> = {
  value: SiteContent[K];
  set: <P extends keyof SiteContent[K]>(key: P, value: SiteContent[K][P]) => void;
  setUpload: (slot: string, busy: boolean) => void;
};

function Section<K extends SiteSection>({ section, title, initial, revision, children }: {
  section: K;
  title: string;
  initial: SiteContent[K];
  revision: number;
  children: (fields: Fields<K>) => ReactNode;
}) {
  const [saved, setSaved] = useState({ revision, content: initial });
  const [value, setValue] = useState(initial);
  const [uploads, setUploads] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const uploading = Object.values(uploads).some(Boolean);
  const dirty = value !== saved.content;
  const set: Fields<K>["set"] = (key, next) => {
    setValue((prev) => ({ ...prev, [key]: next }));
    setStatus(null);
  };

  return (
    <details className="site-edit-section">
      <summary>{title}{dirty && <small className="muted">Есть правки</small>}</summary>
      <form className="site-edit-form" onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || pending || uploading) return;
        setStatus(null);
        start(async () => {
          try {
            const result = await saveSiteSectionAction(section, saved.revision, value);
            if (result.ok) {
              setSaved(result);
              setValue(result.content);
              setStatus({ ok: true, text: "Изменения опубликованы." });
            } else setStatus({ ok: false, text: result.error });
          } catch {
            setStatus({ ok: false, text: "Не удалось сохранить блок. Попробуйте ещё раз." });
          }
        });
      }}>
        <fieldset className="site-edit-fields" disabled={pending}>
          {children({ value, set, setUpload: (slot, busy) => setUploads((prev) => ({ ...prev, [slot]: busy })) })}
        </fieldset>
        {status && <p className={status.ok ? "muted" : "form-error"} role={status.ok ? "status" : "alert"}>{status.text}</p>}
        <div className="btn-row">
          <button className="btn btn-accent" type="submit" disabled={!dirty || uploading || pending}>
            {pending ? "Сохранение…" : "Сохранить блок"}
          </button>
          {dirty && <button className="btn btn-ghost" type="button" disabled={pending || uploading} onClick={() => {
            setValue(saved.content);
            setStatus(null);
          }}>Отменить правки</button>}
        </div>
      </form>
    </details>
  );
}

function TextField({ label, value, onChange, max, multiline, required, placeholder, type = "text" }: {
  label: string; value: string; onChange: (value: string) => void; max: number;
  multiline?: boolean; required?: boolean; placeholder?: string; type?: "text" | "email" | "tel";
}) {
  const props = {
    value, maxLength: max, required, placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} type={type} />}
    </label>
  );
}

function PhotoFields({ slot, label, value, onChange, onBusyChange }: {
  slot: "mainPhoto" | "sidePhoto";
  label: string;
  value: SiteContent["hero"]["mainPhoto"];
  onChange: (value: SiteContent["hero"]["mainPhoto"]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const defaultPhoto = defaultSiteContent.hero[slot];
  return (
    <div className="site-edit-fields">
      <ImageDrop
        value={value.url}
        folder="site"
        label={label}
        removeLabel="Вернуть исходное"
        hideRemove={value.url === defaultPhoto.url}
        onBusyChange={onBusyChange}
        onChange={(url) => onChange(url ? { url, alt: "", caption: "" } : { ...defaultPhoto })}
      />
      <TextField label="Описание фото для скринридера" value={value.alt} max={160}
        required={value.url !== defaultPhoto.url} onChange={(alt) => onChange({ ...value, alt })} />
      <TextField label="Подпись под фото" value={value.caption} max={160} onChange={(caption) => onChange({ ...value, caption })} />
    </div>
  );
}

function EditList<T extends { id: string }>({ items, onChange, label, create, render }: {
  items: T[];
  onChange: (items: T[]) => void;
  label: string;
  create: (id: string) => T;
  render: (item: T, update: (item: T) => void) => ReactNode;
}) {
  function move(index: number, direction: -1 | 1) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    onChange(next);
  }

  return (
    <div className="site-edit-list">
      <ol>
        {items.map((item, index) => (
          <li key={item.id}>
            <fieldset className="site-edit-card">
              <legend>{label} {index + 1}</legend>
              {render(item, (edited) => onChange(items.map((row) => row.id === item.id ? edited : row)))}
              <div className="btn-row">
                <button className="btn btn-ghost" type="button" disabled={index === 0}
                  aria-label={`${label} ${index + 1}: выше`} onClick={() => move(index, -1)}>↑ Выше</button>
                <button className="btn btn-ghost" type="button" disabled={index === items.length - 1}
                  aria-label={`${label} ${index + 1}: ниже`} onClick={() => move(index, 1)}>↓ Ниже</button>
                <button className="btn btn-ghost" type="button"
                  aria-label={`Удалить: ${label.toLowerCase()} ${index + 1}`} onClick={() => onChange(items.filter((row) => row.id !== item.id))}>Удалить</button>
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <button className="btn btn-ghost" type="button" disabled={items.length >= MAX_SITE_ITEMS}
        onClick={() => onChange([...items, create(crypto.randomUUID())])}>Добавить {label.toLowerCase()}</button>
    </div>
  );
}

function TextList<K extends "why" | "route">({ fields, itemLabel }: { fields: Fields<K>; itemLabel: string }) {
  const { value, set } = fields;
  return (
    <>
      <TextField label="Над заголовком" value={value.kicker} max={160} onChange={(kicker) => set("kicker", kicker)} />
      <TextField label="Заголовок" value={value.title} max={160} onChange={(title) => set("title", title)} />
      <TextField label="Вступление" value={value.lead} max={1200} multiline onChange={(lead) => set("lead", lead)} />
      <EditList items={value.items} onChange={(items) => set("items", items)} label={itemLabel}
        create={(id) => ({ id, title: "", body: "" })}
        render={(item, update) => (
          <>
            <TextField label="Название" value={item.title} max={160} required onChange={(title) => update({ ...item, title })} />
            <TextField label="Текст" value={item.body} max={1200} multiline onChange={(body) => update({ ...item, body })} />
          </>
        )} />
    </>
  );
}

export function SiteEditor({ content, revisions }: {
  content: SiteContent;
  revisions: Partial<Record<SiteSection, number>>;
}) {
  return (
    <div className="site-editor">
      <p className="muted section-sub">Для акцента в заголовках главной обрамите фразу звёздочками, например *вашей семьи*.</p>
      <Section section="hero" title="Первый экран" initial={content.hero} revision={revisions.hero ?? 0}>
        {({ value, set, setUpload }) => (
          <>
            <TextField label="Над заголовком" value={value.eyebrow} max={160} onChange={(eyebrow) => set("eyebrow", eyebrow)} />
            <TextField label="Заголовок" value={value.title} max={160} onChange={(title) => set("title", title)} />
            <TextField label="Подзаголовок" value={value.description} max={1200} multiline onChange={(description) => set("description", description)} />
            <div className="site-edit-grid">
              <TextField label="Кнопка каталога" value={value.catalogLabel} max={50} onChange={(label) => set("catalogLabel", label)} />
              <TextField label="Кнопка афиши" value={value.datesLabel} max={50} onChange={(label) => set("datesLabel", label)} />
            </div>
            <TextField label="Первый факт" value={value.group} max={160} onChange={(group) => set("group", group)} />
            <TextField label="Второй факт" value={value.route} max={160} onChange={(route) => set("route", route)} />
            <TextField label="Третий факт" value={value.ticket} max={160} onChange={(ticket) => set("ticket", ticket)} />
            <div className="site-edit-grid">
              <PhotoFields slot="mainPhoto" label="Основное фото" value={value.mainPhoto}
                onChange={(photo) => set("mainPhoto", photo)} onBusyChange={(busy) => setUpload("mainPhoto", busy)} />
              <PhotoFields slot="sidePhoto" label="Второе фото" value={value.sidePhoto}
                onChange={(photo) => set("sidePhoto", photo)} onBusyChange={(busy) => setUpload("sidePhoto", busy)} />
            </div>
          </>
        )}
      </Section>
      <Section section="why" title="Почему с нами интересно" initial={content.why} revision={revisions.why ?? 0}>
        {(fields) => <TextList fields={fields} itemLabel="Пункт" />}
      </Section>
      <Section section="route" title="Как проходит экскурсия" initial={content.route} revision={revisions.route ?? 0}>
        {(fields) => <TextList fields={fields} itemLabel="Шаг" />}
      </Section>
      <Section section="reviews" title="Отзывы" initial={content.reviews} revision={revisions.reviews ?? 0}>
        {({ value, set }) => (
          <>
            <TextField label="Над заголовком" value={value.kicker} max={160} onChange={(kicker) => set("kicker", kicker)} />
            <TextField label="Заголовок" value={value.title} max={160} onChange={(title) => set("title", title)} />
            <EditList items={value.items} onChange={(items) => set("items", items)} label="Отзыв"
              create={(id) => ({ id, quote: "", name: "", about: "", published: true })}
              render={(item, update) => (
                <>
                  <TextField label="Имя" value={item.name} max={80} required onChange={(name) => update({ ...item, name })} />
                  <TextField label="Подпись" value={item.about} max={120} onChange={(about) => update({ ...item, about })} />
                  <TextField label="Текст отзыва" value={item.quote} max={1200} required multiline onChange={(quote) => update({ ...item, quote })} />
                  <label className="check">
                    <input type="checkbox" checked={item.published} onChange={(event) => update({ ...item, published: event.target.checked })} />
                    Показывать на сайте
                  </label>
                </>
              )} />
          </>
        )}
      </Section>
      <Section section="privateTours" title="Индивидуальные экскурсии" initial={content.privateTours} revision={revisions.privateTours ?? 0}>
        {({ value, set }) => (
          <>
            <TextField label="Над заголовком" value={value.kicker} max={160} onChange={(kicker) => set("kicker", kicker)} />
            <TextField label="Заголовок" value={value.title} max={160} onChange={(title) => set("title", title)} />
            <TextField label="Первый абзац" value={value.paragraph1} max={1200} multiline onChange={(p) => set("paragraph1", p)} />
            <TextField label="Второй абзац" value={value.paragraph2} max={1200} multiline onChange={(p) => set("paragraph2", p)} />
          </>
        )}
      </Section>
      <Section section="contacts" title="Контакты" initial={content.contacts} revision={revisions.contacts ?? 0}>
        {({ value, set }) => (
          <>
            <TextField label="Telegram" value={value.telegram} max={64} placeholder="@имя или ссылка t.me" onChange={(telegram) => set("telegram", telegram)} />
            <TextField label="WhatsApp" value={value.whatsapp} max={30} type="tel" placeholder="+7…" onChange={(whatsapp) => set("whatsapp", whatsapp)} />
            <TextField label="ВКонтакте" value={value.vk} max={100} placeholder="Имя сообщества или ссылка vk.com" onChange={(vk) => set("vk", vk)} />
            <TextField label="Телефон для посетителей" value={value.phone} max={30} type="tel" onChange={(phone) => set("phone", phone)} />
            <TextField label="Почта для посетителей" value={value.email} max={254} type="email" onChange={(email) => set("email", email)} />
            <p className="muted">Если оставить телефон или почту пустыми, сайт покажет контакты из реквизитов.</p>
          </>
        )}
      </Section>
      <Section section="footer" title="Подвал" initial={content.footer} revision={revisions.footer ?? 0}>
        {({ value, set }) => <TextField label="Коротко о компании" value={value.description} max={1200}
          multiline onChange={(description) => set("description", description)} />}
      </Section>
      <Section section="seo" title="SEO главной" initial={content.seo} revision={revisions.seo ?? 0}>
        {({ value, set }) => (
          <>
            <TextField label="Заголовок для поисковиков" value={value.title} max={160} onChange={(title) => set("title", title)} />
            <TextField label="Описание для поисковиков" value={value.description} max={350} multiline onChange={(d) => set("description", d)} />
            <TextField label="Заголовок для соцсетей" value={value.socialTitle} max={160} onChange={(title) => set("socialTitle", title)} />
            <TextField label="Описание для соцсетей" value={value.socialDescription} max={350} multiline onChange={(d) => set("socialDescription", d)} />
          </>
        )}
      </Section>
    </div>
  );
}
