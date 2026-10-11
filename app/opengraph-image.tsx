import { ImageResponse } from "next/og";

export const alt = "Diffcast — Carbon for motion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#070809",
          color: "#e7e1d6",
          padding: "68px",
        }}
      >
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 8, color: "#e8b86d" }}>
          DIFFCAST
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 0.95 }}>
          <div>Paste a compare.</div>
          <div>Watch it cut.</div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 28,
          }}
        >
          <div style={{ color: "#9a948a" }}>Carbon for motion</div>
          <div style={{ display: "flex", gap: 28 }}>
            <div style={{ color: "#7dffa1" }}>+186</div>
            <div style={{ color: "#ff8d86" }}>−24</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
