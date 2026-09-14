import { useGround } from "../lib/theme.js";

/** Renders an SVG string at an exact CSS pixel size. True size first: 24 and 16 are real pixels. */
export function IconSvg({ svg, size, className = "", title }: { svg: string | undefined; size: number; className?: string; title?: string }) {
  if (!svg) return <span className={`icon-svg icon-svg-empty ${className}`} style={{ width: size, height: size }} />;
  return (
    <span
      className={`icon-svg ${className}`}
      style={{ width: size, height: size }}
      title={title}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * The standard preview strip: large, then true size, on the ground the app is
 * in.
 *
 * This used to end in a dark pane, so the pair was always on screen. The theme
 * control does that now — see components/Swatch.tsx — and a third pane that
 * repeated the second on the other ground was the one piece of the old
 * arrangement still arguing with it.
 *
 * It takes a renderer rather than a rendered node for the reason Swatch does:
 * a language with a grade draws a different shape on each ground.
 */
export function PreviewStrip({
  render,
  canvas,
}: {
  render: (onDark: boolean) => string | undefined;
  canvas: number;
}) {
  const ground = useGround();
  const svg = render(ground === "dark");
  return (
    <div className="preview-strip">
      <div className={`swatch ${ground}`}>
        <IconSvg svg={svg} size={96} />
      </div>
      <div className={`swatch ${ground} small`}>
        <IconSvg svg={svg} size={canvas} title={`${canvas}px`} />
        <IconSvg svg={svg} size={16} title="16px" />
      </div>
    </div>
  );
}
