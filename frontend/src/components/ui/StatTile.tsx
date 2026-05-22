interface Props {
  label: string
  value: string | number
  accent?: boolean
}

export function StatTile({ label, value, accent }: Props) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`font-mono font-bold text-3xl ${accent ? 'text-accent' : 'text-text'}`}>{value}</div>
    </div>
  )
}
