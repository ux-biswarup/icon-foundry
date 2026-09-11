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

/** The standard preview strip: large, then true size on light and dark. */
export function PreviewStrip({ svg, canvas }: { svg: string | undefined; canvas: number }) {
  return (
    <div className="preview-strip">
      <div className="swatch light">
        <IconSvg svg={svg} size={96} />
      </div>
      <div className="swatch light small">
        <IconSvg svg={svg} size={canvas} title={`${canvas}px`} />
        <IconSvg svg={svg} size={16} title="16px" />
      </div>
      <div className="swatch dark small">
        <IconSvg svg={svg} size={canvas} title={`${canvas}px`} />
        <IconSvg svg={svg} size={16} title="16px" />
      </div>
    </div>
  );
}
