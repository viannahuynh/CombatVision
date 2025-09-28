import { useEffect } from "react";
import { Link } from "react-router-dom";
export default function Exit() {
  useEffect(() => { window.close(); }, []);
  return (
    <div style={{ minHeight:"100vh", display:"grid", placeItems:"center", textAlign:"center" }}>
      <div>
        <h2>Exit</h2>
        <p>If the tab didn’t close, close it manually</p>
        <Link to="/">Back</Link>
      </div>
    </div>
  );
}
