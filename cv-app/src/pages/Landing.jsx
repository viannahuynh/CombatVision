import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()

  const handleClick = () => {
    navigate('/home') // or wherever your Home page is mounted
  }

  return (
    <div
      onClick={handleClick}
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
        cursor: 'pointer',
      }}
      role="button"
      tabIndex={0}
    >
    </div>
  )
}
