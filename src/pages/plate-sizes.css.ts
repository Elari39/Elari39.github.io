import { PLATE_SIZES } from "../data/plates";

/** Build-time stylesheet: intrinsic image bounds without inline styles. */
export function GET() {
  const widths = [
    ...new Set(Object.values(PLATE_SIZES).map((size) => size.width)),
  ];
  return new Response(
    widths
      .map((width) => `.plate-width-${width}{max-width:${width}px}`)
      .join("\n"),
    {
      headers: { "Content-Type": "text/css; charset=utf-8" },
    },
  );
}
