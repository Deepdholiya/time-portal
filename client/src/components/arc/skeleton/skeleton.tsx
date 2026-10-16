export function Skeleton({ width = "100%", height = 12, radius = 4, style }: { width?: number | string; height?: number | string; radius?: number; style?: React.CSSProperties }) {
  return <span style={{ display: "block", width, height, borderRadius: radius, background: "var(--bg-active)", animation: "tp-pulse 1.4s ease-in-out infinite", ...style }} />;
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, height: 36, padding: "0 20px", borderBottom: "1px solid var(--border)" }}>
          <Skeleton width={14} height={14} radius={7} />
          <Skeleton width={`${30 + ((i * 37) % 45)}%`} />
          <span style={{ flex: 1 }} />
          <Skeleton width={60} />
        </div>
      ))}
    </div>
  );
}
