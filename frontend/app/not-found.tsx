"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import styles from "@/components/marketing/info-page.module.css";

export default function NotFoundPage() {
  return (
    <main className={styles.notFound}>
      <motion.div
        className={styles.notFoundInner}
        initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: [0.16, 0.84, 0.3, 1] }}
      >
        <p className={styles.notFoundCode}>404</p>
        <p className={styles.notFoundScript}>Этой страницы здесь нет</p>
        <p className={styles.notFoundTitle}>Возможно, ссылка устарела или адрес введён с ошибкой.</p>
        <p className={styles.notFoundLead}>
          Возвращайтесь на главную и выберите путь — блогер или работник. Каждый кабинет на своём месте.
        </p>
        <div className={styles.notFoundActions}>
          <Link href="/" className={styles.formSubmit}>
            На главную
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
