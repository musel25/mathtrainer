interface Props {
  onStart: () => void
}

export function StartScreen({ onStart }: Props) {
  return (
    <div style={{ textAlign: 'center', marginTop: '20vh' }}>
      <h1>mathtrainer</h1>
      <p>A 10-question mental-arithmetic drill.</p>
      <button onClick={onStart} style={{ fontSize: 20, padding: '12px 28px' }}>
        Start daily drill
      </button>
    </div>
  )
}
