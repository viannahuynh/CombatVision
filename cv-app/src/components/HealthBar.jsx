export default function HealthBar({ hp1, hp2, max }) {
  return (
    <div style={{ position:'absolute', top:10, left:10, right:10, zIndex:10, display:'flex', gap:12 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:'monospace', fontSize:12, marginBottom:4, color:'#00eaff' }}>Player 1</div>
        <div style={{ height:12, background:'#123947', borderRadius:6, overflow:'hidden', boxShadow:'inset 0 0 0 1px #0aa0bb' }}>
          <div style={{ width:`${(hp1/max)*100}%`, height:'100%', background:'#00eaff', transition:'width 120ms linear' }} />
        </div>
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:'monospace', fontSize:12, marginBottom:4, textAlign:'right', color:'#ff4d4d' }}>Player 2</div>
        <div style={{ height:12, background:'#401f1f', borderRadius:6, overflow:'hidden', boxShadow:'inset 0 0 0 1px #a33' }}>
          <div style={{ width:`${(hp2/max)*100}%`, height:'100%', background:'#ff4d4d', transition:'width 120ms linear' }} />
        </div>
      </div>
    </div>
  )
}
