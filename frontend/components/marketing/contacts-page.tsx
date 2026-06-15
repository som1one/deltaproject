"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";
import { AnimatedSection } from "@/components/common/animated-section";
import { SiteFooter } from "@/components/common/site-footer";
import { useToast } from "@/components/common/toast";
import { CopyButton } from "@/components/common/copy-button";
import styles from "@/components/marketing/info-page.module.css";

const CONTACTS = {
  support: {
    telegram: "@looneymoonhelper",
    telegramUrl: "https://t.me/looneymoonhelper",
  },
  blogger: {
    telegram: "@deltasmaxxx",
    telegramUrl: "https://t.me/deltasmaxxx",
  },
};

export const ContactsPage = () => {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", telegram: "", title: "", text: "" });
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const sendMutation = useMutation({
    mutationFn: () =>
      api.sendQuestion({
        name: form.name.trim(),
        telegram: form.telegram.trim(),
        title: form.title.trim(),
        text: form.text.trim(),
      }),
    onSuccess: () => {
      setForm({ name: "", telegram: "", title: "", text: "" });
      setFeedback({ tone: "success", text: "Сообщение отправлено. Мы свяжемся с вами в Telegram." });
      toast("Сообщение отправлено", "success");
    },
    onError: (error: Error) => {
      setFeedback({ tone: "error", text: error.message });
      toast(error.message, "error");
    },
  });

  const canSend = form.name.trim() && form.telegram.trim() && form.title.trim() && form.text.trim();

  return (
    <main className={styles.page}>
      <AnimatedSection>
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>Контакты</p>
          <h1 className={styles.heroTitle}>
            Закрытая платформа.<br />
            <em>Открытая дверь.</em>
          </h1>
          <p className={styles.heroLead}>
            Если вы блогер с аудиторией или работник, готовый закрывать сделки — напишите нам в
            Telegram или оставьте сообщение через форму.
          </p>
        </section>
      </AnimatedSection>

      <AnimatedSection>
        <section className={styles.contactsGrid}>
          <article className={styles.contactCard}>
            <p className={styles.contactEyebrow}>Telegram</p>
            <h2 className={styles.contactTitle}>Техподдержка</h2>
            <p className={styles.contactValue}>{CONTACTS.support.telegram}</p>
            <p className={styles.contactNote}>
              Вопросы по работе платформы, проблемы с доступом, баги. Отвечаем в рабочее время.
            </p>
            <div className={styles.contactCardActions}>
              <a href={CONTACTS.support.telegramUrl} target="_blank" rel="noreferrer" className={styles.contactAction}>
                Открыть Telegram
              </a>
              <CopyButton value={CONTACTS.support.telegram} kind="secondary" toastText="Telegram скопирован" />
            </div>
          </article>

          <article className={styles.contactCard}>
            <p className={styles.contactEyebrow}>Telegram</p>
            <h2 className={styles.contactTitle}>Заявка блогера</h2>
            <p className={styles.contactValue}>{CONTACTS.blogger.telegram}</p>
            <p className={styles.contactNote}>
              Хотите работать с нами? Напишите — обсудим условия и подключим к платформе.
            </p>
            <div className={styles.contactCardActions}>
              <a href={CONTACTS.blogger.telegramUrl} target="_blank" rel="noreferrer" className={styles.contactAction}>
                Открыть Telegram
              </a>
              <CopyButton value={CONTACTS.blogger.telegram} kind="secondary" toastText="Telegram скопирован" />
            </div>
          </article>
        </section>
      </AnimatedSection>

      <AnimatedSection>
        <section className={styles.contactForm}>
          <form
            className={styles.formCard}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSend) return;
              sendMutation.mutate();
            }}
          >
            <div className={styles.formHeader}>
              <h2 className={styles.formTitle}>Форма обращения</h2>
              <p className={styles.formLead}>
                Опишите ваш вопрос. Если оставите Telegram — ответим прямо туда.
              </p>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Имя</span>
                <input
                  className={styles.formInput}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Как к вам обращаться"
                />
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Telegram</span>
                <input
                  className={styles.formInput}
                  value={form.telegram}
                  onChange={(event) => setForm({ ...form, telegram: event.target.value })}
                  placeholder="@username"
                />
              </label>
            </div>

            <label className={styles.formField}>
              <span className={styles.formLabel}>Тема</span>
              <input
                className={styles.formInput}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Коротко — о чём вопрос"
              />
            </label>

            <label className={styles.formField}>
              <span className={styles.formLabel}>Сообщение</span>
              <textarea
                className={styles.formTextarea}
                value={form.text}
                onChange={(event) => setForm({ ...form, text: event.target.value })}
                placeholder="Опишите ситуацию или задачу"
              />
            </label>

            {feedback ? (
              <p
                className={`${styles.formFeedback}${
                  feedback.tone === "error"
                    ? ` ${styles.formFeedbackError}`
                    : ` ${styles.formFeedbackSuccess}`
                }`}
              >
                {feedback.text}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button type="submit" className={styles.formSubmit} disabled={!canSend || sendMutation.isPending}>
                {sendMutation.isPending ? "Отправляем…" : "Отправить"}
              </button>
            </div>
          </form>
        </section>
      </AnimatedSection>

      <SiteFooter />
    </main>
  );
};
