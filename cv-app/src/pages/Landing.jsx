import { useEffect } from 'react'

export default function Landing({ onContinue }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space') {
        event.preventDefault()
        onContinue?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onContinue])

  const handleClick = () => {
    onContinue?.()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundImage: "url('/menu/bg.gif')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.code === 'Space' || event.key === 'Enter') {
          event.preventDefault()
          onContinue?.()
        }
      }}
      role="button"
      tabIndex={0}
    >
    </div>
  );
}
