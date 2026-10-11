import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070809",
          color: "#e8b86d",
          fontSize: 20,
          fontFamily: "Georgia, serif",
        }}
      >
        Δ
      </div>
    ),
    { ...size },
  );
}
