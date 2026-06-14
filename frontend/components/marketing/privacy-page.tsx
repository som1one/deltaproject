"use client";

import { AnimatedSection, StaggerGroup, StaggerItem } from "@/components/common/animated-section";
import { SiteFooter } from "@/components/common/site-footer";
import styles from "@/components/marketing/info-page.module.css";
import legalStyles from "@/components/marketing/legal-page.module.css";

export const PrivacyPage = () => (
  <main className={styles.page}>
    <AnimatedSection>
      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>Документ</p>
        <h1 className={styles.heroTitle}>
          Политика<br />
          <em>конфиденциальности.</em>
        </h1>
        <p className={styles.heroLead}>
          Последнее обновление: 14 июня 2025 года. Настоящая Политика описывает, как платформа looney
          moon собирает, использует и защищает персональные данные пользователей.
        </p>
      </section>
    </AnimatedSection>

    <StaggerGroup className={legalStyles.legalContent}>
      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>1. Общие положения</h2>
          <p className={legalStyles.legalText}>
            1.1. Настоящая Политика конфиденциальности (далее — «Политика») определяет порядок
            обработки и защиты персональных данных пользователей платформы looney moon (далее —
            «Платформа», «мы», «нас»).
          </p>
          <p className={legalStyles.legalText}>
            1.2. Используя Платформу, вы подтверждаете, что ознакомились с настоящей Политикой и
            даёте согласие на обработку ваших персональных данных в соответствии с её условиями.
          </p>
          <p className={legalStyles.legalText}>
            1.3. Если вы не согласны с условиями Политики, пожалуйста, прекратите использование
            Платформы.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>2. Какие данные мы собираем</h2>
          <p className={legalStyles.legalText}>
            2.1. При регистрации и использовании Платформы мы можем собирать следующие данные:
          </p>
          <ul className={legalStyles.legalList}>
            <li>Имя и фамилия (или псевдоним)</li>
            <li>Контактный Telegram-аккаунт</li>
            <li>Адрес электронной почты</li>
            <li>Реквизиты для выплат (номер карты)</li>
            <li>IP-адрес и данные об устройстве (user-agent)</li>
            <li>Реферальные данные (по какой ссылке вы зарегистрировались)</li>
            <li>Данные о сделках и финансовых операциях внутри Платформы</li>
          </ul>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>3. Цели обработки данных</h2>
          <p className={legalStyles.legalText}>Мы обрабатываем персональные данные для:</p>
          <ul className={legalStyles.legalList}>
            <li>Регистрации и идентификации пользователей на Платформе</li>
            <li>Исполнения обязательств по сделкам и выплатам</li>
            <li>Обеспечения работы реферальной системы</li>
            <li>Связи с пользователями по вопросам работы Платформы</li>
            <li>Предотвращения мошеннических действий</li>
            <li>Улучшения качества работы Платформы</li>
            <li>Исполнения требований законодательства</li>
          </ul>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>4. Хранение и защита данных</h2>
          <p className={legalStyles.legalText}>
            4.1. Персональные данные хранятся на защищённых серверах с ограниченным доступом.
          </p>
          <p className={legalStyles.legalText}>
            4.2. Мы применяем технические и организационные меры для предотвращения
            несанкционированного доступа, утраты или изменения данных, включая шифрование при
            передаче (TLS/SSL) и хеширование паролей.
          </p>
          <p className={legalStyles.legalText}>
            4.3. Доступ к персональным данным имеют только уполномоченные администраторы Платформы в
            объёме, необходимом для выполнения своих обязанностей.
          </p>
          <p className={legalStyles.legalText}>
            4.4. Данные хранятся в течение всего срока использования Платформы и в течение 1 (одного)
            года после удаления аккаунта, после чего безвозвратно уничтожаются.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>5. Передача данных третьим лицам</h2>
          <p className={legalStyles.legalText}>
            5.1. Мы не продаём, не обмениваем и не передаём персональные данные третьим лицам в
            коммерческих целях.
          </p>
          <p className={legalStyles.legalText}>
            5.2. Данные могут быть переданы третьим лицам исключительно в следующих случаях:
          </p>
          <ul className={legalStyles.legalList}>
            <li>По требованию уполномоченных государственных органов в порядке, установленном законодательством</li>
            <li>Для исполнения финансовых обязательств (передача реквизитов платёжным системам)</li>
            <li>С вашего явного согласия</li>
          </ul>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>6. Файлы cookie и аналитика</h2>
          <p className={legalStyles.legalText}>
            6.1. Платформа может использовать файлы cookie для обеспечения авторизации и корректной
            работы сервиса.
          </p>
          <p className={legalStyles.legalText}>
            6.2. Мы можем использовать обезличенные аналитические данные для улучшения
            пользовательского опыта. Такие данные не позволяют идентифицировать конкретного
            пользователя.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>7. Права пользователя</h2>
          <p className={legalStyles.legalText}>Вы имеете право:</p>
          <ul className={legalStyles.legalList}>
            <li>Запросить информацию о хранящихся персональных данных</li>
            <li>Потребовать исправления неточных данных</li>
            <li>Потребовать удаления персональных данных (удаление аккаунта)</li>
            <li>Отозвать согласие на обработку данных</li>
          </ul>
          <p className={legalStyles.legalText}>
            Для реализации своих прав обратитесь к администрации Платформы через Telegram (@delta_agency)
            или по электронной почте.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>8. Изменение Политики</h2>
          <p className={legalStyles.legalText}>
            8.1. Мы оставляем за собой право вносить изменения в настоящую Политику. Актуальная
            версия всегда доступна на данной странице.
          </p>
          <p className={legalStyles.legalText}>
            8.2. Продолжая использовать Платформу после внесения изменений, вы подтверждаете своё
            согласие с обновлённой Политикой.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>9. Контакты</h2>
          <p className={legalStyles.legalText}>
            По вопросам, связанным с обработкой персональных данных, обращайтесь:
          </p>
          <ul className={legalStyles.legalList}>
            <li>Telegram: @delta_agency</li>
            <li>Email: hello@delta.team</li>
          </ul>
        </section>
      </StaggerItem>
    </StaggerGroup>

    <SiteFooter />
  </main>
);
