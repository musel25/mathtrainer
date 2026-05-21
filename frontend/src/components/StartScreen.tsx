interface Props {
  onStart: () => void
  error: string | null
}

export function StartScreen({ onStart, error }: Props) {
  return (
    <div style={{ textAlign: 'center', marginTop: '20vh' }}>
      <h1>mathtrainer</h1>
      <p>A 10-question mental-arithmetic drill.</p>
      <button onClick={onStart} style={{ fontSize: 20, padding: '12px 28px' }}>
        Start daily drill
      </button>
      {error && (
        <p style={{ color: 'crimson', marginTop: 16 }}>Could not start: {error}</p>
      )}
    </div>
  )
}
