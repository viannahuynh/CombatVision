import { Link } from "react-router-dom";
export default function Credits() {
  return (
    <div style={{ minHeight:"100vh", display:"grid", placeItems:"center", textAlign:"center" }}>
      <div>
        <h2>Credits</h2>
        <p>Team names go here.</p>
        <Link to="/">Back</Link>
      </div>
    </div>
  );
}
