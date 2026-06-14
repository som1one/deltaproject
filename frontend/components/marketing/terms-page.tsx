"use client";

import { AnimatedSection, StaggerGroup, StaggerItem } from "@/components/common/animated-section";
import { SiteFooter } from "@/components/common/site-footer";
import styles from "@/components/marketing/info-page.module.css";
import legalStyles from "@/components/marketing/legal-page.module.css";

export const TermsPage = () => (
  <main className={styles.page}>
    <AnimatedSection>
      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>Документ</p>
        <h1 className={styles.heroTitle}>
          Условия<br />
          <em>использования.</em>
        </h1>
        <p className={styles.heroLead}>
          Последнее обновление: 14 июня 2025 года. Настоящие Условия регулируют порядок использования
          платформы looney moon и взаимоотношения между Платформой и её пользователями.
        </p>
      </section>
    </AnimatedSection>

    <StaggerGroup className={legalStyles.legalContent}>
      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>1. Общие положения</h2>
          <p className={legalStyles.legalText}>
            1.1. Платформа looney moon (далее — «Платформа», «Сервис», «мы») представляет собой
            онлайн-площадку для организации рекламных интеграций у блогеров.
          </p>
          <p className={legalStyles.legalText}>
            1.2. Настоящие Условия использования (далее — «Условия») являются юридически обязывающим
            соглашением между вами (далее — «Пользователь») и Платформой.
          </p>
          <p className={legalStyles.legalText}>
            1.3. Регистрируясь на Платформе, вы подтверждаете, что вам исполнилось 18 лет и вы
            полностью принимаете настоящие Условия.
          </p>
          <p className={legalStyles.legalText}>
            1.4. Платформа является закрытой: регистрация возможна исключительно по реферальной ссылке
            от действующего блогера Платформы.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>2. Роли пользователей</h2>
          <p className={legalStyles.legalText}>На Платформе существуют следующие роли:</p>
          <ul className={legalStyles.legalList}>
            <li>
              <strong>Блогер</strong> — пользователь, выполняющий рекламные интеграции и привлекающий
              работников через реферальную ссылку.
            </li>
            <li>
              <strong>Работник</strong> — пользователь, находящий рекламодателей на маркетплейсах,
              ведущий переговоры и заводящий сделки в системе.
            </li>
            <li>
              <strong>Администратор</strong> — уполномоченное лицо, управляющее Платформой,
              подтверждающее сделки и контролирующее выплаты.
            </li>
          </ul>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>3. Порядок работы и сделки</h2>
          <p className={legalStyles.legalText}>
            3.1. Работник самостоятельно находит потенциальных рекламодателей, ведёт переговоры и
            фиксирует достигнутые договорённости в виде сделки на Платформе.
          </p>
          <p className={legalStyles.legalText}>
            3.2. Каждая сделка проходит проверку и подтверждение Администратором. Только после
            подтверждения и перевода сделки в статус «Оплачена» происходит автоматическое
            распределение долей.
          </p>
          <p className={legalStyles.legalText}>
            3.3. Платформа выступает информационным посредником и не является стороной сделок между
            рекламодателями и блогерами. Платформа не гарантирует исполнение обязательств третьими
            лицами.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>4. Финансовые условия и выплаты</h2>
          <p className={legalStyles.legalText}>
            4.1. Распределение доходов от сделок между участниками (работник, блогер, реферал)
            осуществляется автоматически в соответствии с установленными процентами, указанными в
            личном кабинете.
          </p>
          <p className={legalStyles.legalText}>
            4.2. Вывод средств осуществляется по запросу пользователя через раздел «Финансы».
            Администратор обрабатывает запрос в течение рабочего дня.
          </p>
          <p className={legalStyles.legalText}>
            4.3. Платформа оставляет за собой право задержать или отклонить выплату при подозрении на
            мошеннические действия или нарушение настоящих Условий.
          </p>
          <p className={legalStyles.legalText}>
            4.4. Минимальная сумма вывода и комиссии (при наличии) указываются в личном кабинете
            Пользователя.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>5. Налоговая ответственность</h2>
          <p className={legalStyles.legalText}>
            5.1. Платформа <strong>не является налоговым агентом</strong> и не удерживает налоги с
            выплат пользователям.
          </p>
          <p className={legalStyles.legalText}>
            5.2. Каждый Пользователь самостоятельно несёт ответственность за декларирование и уплату
            налогов, сборов и иных обязательных платежей в соответствии с законодательством страны
            своего налогового резидентства.
          </p>
          <p className={legalStyles.legalText}>
            5.3. Платформа не предоставляет налоговых консультаций и не несёт ответственности за
            неисполнение Пользователем своих налоговых обязательств.
          </p>
          <p className={legalStyles.legalText}>
            5.4. В случае получения запросов от налоговых органов Платформа может предоставить
            информацию о выплатах в порядке, установленном действующим законодательством.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>6. Ограничение ответственности</h2>
          <p className={legalStyles.legalText}>
            6.1. Платформа предоставляется «как есть» (as is). Мы не даём гарантий непрерывной и
            безошибочной работы Сервиса.
          </p>
          <p className={legalStyles.legalText}>
            6.2. Платформа не несёт ответственности за:
          </p>
          <ul className={legalStyles.legalList}>
            <li>Убытки, возникшие в результате действий или бездействия третьих лиц (рекламодателей, платёжных систем)</li>
            <li>Неисполнение рекламодателем обязательств по оплате</li>
            <li>Последствия предоставления Пользователем недостоверной информации</li>
            <li>Налоговые последствия, штрафы и пени, возникшие в связи с неисполнением Пользователем налоговых обязательств</li>
            <li>Временную недоступность Сервиса по техническим причинам</li>
            <li>Действия Пользователя, нарушающие законодательство</li>
          </ul>
          <p className={legalStyles.legalText}>
            6.3. Совокупная ответственность Платформы перед Пользователем по любым основаниям
            ограничена суммой, фактически выплаченной Пользователю за последние 30 дней.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>7. Обязанности пользователя</h2>
          <p className={legalStyles.legalText}>Пользователь обязуется:</p>
          <ul className={legalStyles.legalList}>
            <li>Предоставлять достоверную информацию при регистрации и использовании Платформы</li>
            <li>Не использовать Платформу для мошеннических действий или обмана</li>
            <li>Не создавать множественные аккаунты</li>
            <li>Не передавать доступ к аккаунту третьим лицам</li>
            <li>Соблюдать применимое законодательство, в том числе налоговое и рекламное</li>
            <li>Не размещать противоправный, оскорбительный или вводящий в заблуждение контент</li>
            <li>Уважительно относиться к другим участникам Платформы</li>
          </ul>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>8. Блокировка и удаление аккаунта</h2>
          <p className={legalStyles.legalText}>
            8.1. Администрация Платформы оставляет за собой право заблокировать или удалить аккаунт
            Пользователя без предварительного уведомления в случае:
          </p>
          <ul className={legalStyles.legalList}>
            <li>Нарушения настоящих Условий</li>
            <li>Мошеннических или подозрительных действий</li>
            <li>Создания множественных аккаунтов</li>
            <li>Действий, наносящих ущерб Платформе или другим пользователям</li>
          </ul>
          <p className={legalStyles.legalText}>
            8.2. При блокировке за мошенничество невыплаченные средства могут быть заморожены до
            выяснения обстоятельств.
          </p>
          <p className={legalStyles.legalText}>
            8.3. Пользователь может самостоятельно запросить удаление аккаунта, обратившись в
            поддержку.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>9. Интеллектуальная собственность</h2>
          <p className={legalStyles.legalText}>
            9.1. Все элементы Платформы (дизайн, код, тексты, логотипы) являются интеллектуальной
            собственностью looney moon.
          </p>
          <p className={legalStyles.legalText}>
            9.2. Использование материалов Платформы без письменного согласия запрещено.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>10. Изменение условий</h2>
          <p className={legalStyles.legalText}>
            10.1. Мы оставляем за собой право вносить изменения в настоящие Условия в любое время.
            Актуальная версия всегда доступна на данной странице.
          </p>
          <p className={legalStyles.legalText}>
            10.2. Продолжая использовать Платформу после внесения изменений, вы подтверждаете своё
            согласие с обновлёнными Условиями.
          </p>
          <p className={legalStyles.legalText}>
            10.3. При существенных изменениях мы уведомим Пользователей через Telegram или интерфейс
            Платформы.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>11. Применимое право и разрешение споров</h2>
          <p className={legalStyles.legalText}>
            11.1. Настоящие Условия регулируются законодательством Российской Федерации.
          </p>
          <p className={legalStyles.legalText}>
            11.2. Все споры решаются путём переговоров. При невозможности достижения согласия спор
            передаётся на рассмотрение в суд по месту нахождения Платформы.
          </p>
        </section>
      </StaggerItem>

      <StaggerItem>
        <section className={legalStyles.legalSection}>
          <h2 className={legalStyles.legalHeading}>12. Контакты</h2>
          <p className={legalStyles.legalText}>
            По всем вопросам, связанным с настоящими Условиями, обращайтесь:
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
