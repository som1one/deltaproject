import { ImageResponse } from "next/og";

/* =========================================================
   OG-картинка главного сайта: тёмный фон, крупный вордмарк,
   подзаголовок. Без внешних шрифтов — системный serif-стек
   (кириллицу для подзаголовка next/og догружает сам).
   ========================================================= */

export const alt = "moneymaxxxing — сообщество по ворку";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          backgroundImage:
            "radial-gradient(900px 500px at 50% 0%, rgba(255,255,255,0.08), transparent 70%)",
          color: "#f5f5f5",
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <div
          style={{
            fontSize: 124,
            fontStyle: "italic",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          moneymaxxxing
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 34,
            color: "rgba(245, 245, 245, 0.72)",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
          }}
        >
          сообщество по ворку
        </div>
      </div>
    ),
    { ...size },
  );
}
