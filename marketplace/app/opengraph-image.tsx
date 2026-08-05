import { ImageResponse } from "next/og";

/**
 * OG-карточка по умолчанию: тёмный фон, лунный глиф и вордмарка.
 * Системные шрифты — без загрузки внешних файлов в edge-рендер.
 */

export const alt = "Looney Moon Market — реклама у блогеров без риска";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 96px",
          background: "#101014",
          color: "#f5f4ef",
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg viewBox="0 0 24 24" width="44" height="44">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="#f5f4ef" />
          </svg>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: "0.08em", color: "#b9b7ae" }}>
            маркетплейс платформы moneymaxxxing
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 92,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            Looney Moon Market
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 40, color: "#b9b7ae" }}>
            Реклама у блогеров без риска
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #33333a",
            paddingTop: 28,
            fontSize: 26,
            color: "#8b897f",
          }}
        >
          <div style={{ display: "flex" }}>Эскроу-сделки · проверенные авторы</div>
          <div style={{ display: "flex" }}>marketplace.moneymaxxxing.ru</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
