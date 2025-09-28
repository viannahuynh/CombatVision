import { useNavigate } from "react-router-dom"

export default function Home() {
  const nav = useNavigate()

  const handleClick = () => {
    nav("/play") 
  }

  return (
    <div
      onClick={handleClick}
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundImage: "url('/menu/title.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
      }}
    >
    </div>
  )
}
