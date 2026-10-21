export function ProviderAvatar({ providerID, size = 16 }: { providerID: string; size?: number }) {
  const hue = Array.from(providerID).reduce((total, char) => total + char.charCodeAt(0), 0) % 360
  return (
    <span
      className="provider-avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.58),
        background: `hsl(${hue} 38% 30%)`,
        color: `hsl(${hue} 80% 92%)`,
      }}
      aria-hidden="true"
    >
      {(providerID || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
