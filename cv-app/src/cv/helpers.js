// ==================== HAND VIS (pink/blue halos) ====================
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
]

export function drawHands(ctx, hres, W, H) {
  const handsL = hres?.landmarks || []
  const handedness = hres?.handedness || []
  for (let i=0;i<handsL.length;i++){
    const label = handedness[i]?.[0]?.categoryName || 'Hand'
    const color = label === 'Right' ? '#00eaff' : '#ff4dff'
    const pts = handsL[i].map(p => ({ x: p.x*W, y: p.y*H }))

    // palm halo
    const palmIdx = [0,1,5,9,13,17]
    const cx = palmIdx.reduce((s,j)=>s+pts[j].x,0)/palmIdx.length
    const cy = palmIdx.reduce((s,j)=>s+pts[j].y,0)/palmIdx.length
    const r  = palmIdx.reduce((m,j)=>Math.max(m, Math.hypot(pts[j].x-cx, pts[j].y-cy)), 0) * 1.2
    ctx.fillStyle = label === 'Right' ? 'rgba(0,234,255,0.20)' : 'rgba(255,77,255,0.20)'
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill()

    // fingertip (index = 8)
    const tip = pts[8]
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tip.x, tip.y, 8, 0, Math.PI*2); ctx.fill()
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tip.x, tip.y, 10, 0, Math.PI*2); ctx.stroke()

    // (skeleton omitted for perf)
    // ctx.strokeStyle = color; ctx.lineWidth = 3
    // HAND_CONNECTIONS.forEach(([a,b]) => {
    //   const pa = pts[a], pb = pts[b]
    //   ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
    // })
  }
}

// ==================== POSE HELPERS ====================
export const L_SH=11, R_SH=12, L_HIP=23, R_HIP=24
export function centerFromPose(lm){
  const pts = [lm[L_SH], lm[R_SH], lm[L_HIP], lm[R_HIP]].filter(Boolean)
  if (pts.length >= 2) {
    const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length
    const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length
    return { cx, cy }
  }
  const cx = lm.reduce((s,p)=>s+p.x,0)/lm.length
  const cy = lm.reduce((s,p)=>s+p.y,0)/lm.length
  return { cx, cy }
}
export function estimateBoxSize(lm){
  const shL = lm[L_SH], shR = lm[R_SH], hpL = lm[L_HIP], hpR = lm[R_HIP]
  const shW = (shL && shR) ? Math.hypot(shR.x-shL.x, shR.y-shL.y) : null
  const hipW = (hpL && hpR) ? Math.hypot(hpR.x-hpL.x, hpR.y-hpL.y) : null
  const refW = shW || hipW || 80

  let torsoH = 0
  if (shL && hpL) torsoH = Math.max(torsoH, Math.hypot(hpL.x-shL.x, hpL.y-shL.y))
  if (shR && hpR) torsoH = Math.max(torsoH, Math.hypot(hpR.x-shR.x, hpR.y-shR.y))

  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v))
  const W = clamp(refW * 2.2, 140, 360)
  const H = clamp((torsoH || refW*2.0) * 2.0, 220, 520)
  return { W, H }
}
export class Ema2D {
  constructor(alpha = 0.30){ this.a=alpha; this.x=null; this.y=null }
  update(x,y){
    if (this.x==null){ this.x=x; this.y=y; return {x,y} }
    this.x = this.a*x + (1-this.a)*this.x
    this.y = this.a*y + (1-this.a)*this.y
    return { x:this.x, y:this.y }
  }
}
export function snap(v,g=2){ return Math.round(v/g)*g }
export function snapBox(b, grid=2){ return { x:snap(b.x,grid), y:snap(b.y,grid), w:snap(b.w,grid), h:snap(b.h,grid) } }
export function drawBoxOutline(ctx, b, color){
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.setLineDash([10,6]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore()
}
export function avgX(lm){ return lm.reduce((s,p)=>s+p.x,0)/lm.length }
export function assignLeftRight(persons){ const ps = persons.slice().sort((a,b)=>avgX(a)-avgX(b)); return [ps[0]||null, ps[1]||null] }

// ==================== HANDS & SWORDS HELPERS ====================
export function handsToPixel(hres, W, H){
  const out=[]
  const L = hres?.landmarks || []
  for (let i=0;i<L.length;i++){
    const lm = L[i]
    const pts = lm.map(p => ({ x: p.x*W, y: p.y*H }))
    const handed = hres?.handedness?.[i]?.[0]?.categoryName || 'Unknown'
    out.push({ pts, handed })
  }
  return out
}
export function palmCenter(pts){
  const idx = [0,5,9,13,17].filter(i => pts[i])
  if (!idx.length) return null
  let sx=0, sy=0
  for (const i of idx){ sx += pts[i].x; sy += pts[i].y }
  return { x: sx/idx.length, y: sy/idx.length }
}
export function splitHandsByPlayer(handsPix, centerLeft, centerRight){
  const left = [], right = []
  for (const h of handsPix){
    const pc = palmCenter(h.pts) || h.pts?.[0]
    if (!pc) continue
    const dL = centerLeft  ? (pc.x-centerLeft.x)**2  + (pc.y-centerLeft.y)**2  : Infinity
    const dR = centerRight ? (pc.x-centerRight.x)**2 + (pc.y-centerRight.y)**2 : Infinity
    if (dL <= dR) left.push(h); else right.push(h)
  }
  return { left, right }
}
export function pickMostExtendedHand(handsForPlayer, playerCenter){
  if (!playerCenter || !handsForPlayer.length) return null
  let best=null, bestD2=-1
  for (const h of handsForPlayer){
    const pc = palmCenter(h.pts) || h.pts?.[0]
    if (!pc) continue
    const d2 = (pc.x - playerCenter.x)**2 + (pc.y - playerCenter.y)**2
    if (d2 > bestD2){ best = h; bestD2 = d2 }
  }
  return best
}
export function placeSwordFixedAtPalm(imgEl, handPts, fixedLenPx){
  if (!imgEl || !handPts) return
  const grip = palmCenter(handPts)
  const tip  = handPts[8]
  if (!grip || !tip) return
  const dx = tip.x - grip.x, dy = tip.y - grip.y
  const angle = Math.atan2(dy, dx)
  const gx = grip.x + Math.cos(angle) * 2
  const gy = grip.y + Math.sin(angle) * 2
  imgEl.style.width  = `${fixedLenPx}px`
  imgEl.style.height = 'auto'
  imgEl.style.transform = `translate(${gx}px, ${gy}px) rotate(${angle}rad)`
  imgEl.style.display = 'block'
  imgEl.style.willChange = 'transform'
}
export function hideSword(imgEl){ if (imgEl) imgEl.style.display = 'none' }

// ==================== GEOMETRY: line ↔ rect ====================
export function pointInRect(x, y, r){ return x>=r.x && y>=r.y && x<=r.x+r.w && y<=r.y+r.h }
export function segIntersect(ax,ay,bx,by, cx,cy,dx,dy){
  const s1x = bx-ax, s1y = by-ay
  const s2x = dx-cx, s2y = dy-cy
  const den = (-s2x*s1y + s1x*s2y)
  if (den === 0) return false
  const s = (-s1y*(ax-cx) + s1x*(ay-cy)) / den
  const t = ( s2x*(ay-cy) - s2y*(ax-cx)) / den
  return (s>=0 && s<=1 && t>=0 && t<=1)
}
export function lineIntersectsRect(x1,y1,x2,y2, r){
  if (pointInRect(x1,y1,r) || pointInRect(x2,y2,r)) return true
  const rx=r.x, ry=r.y, rw=r.w, rh=r.h
  if (segIntersect(x1,y1,x2,y2, rx,ry, rx+rw,ry)) return true
  if (segIntersect(x1,y1,x2,y2, rx+rw,ry, rx+rw,ry+rh)) return true
  if (segIntersect(x1,y1,x2,y2, rx+rw,ry+rh, rx,ry+rh)) return true
  if (segIntersect(x1,y1,x2,y2, rx,ry+rh, rx,ry)) return true
  return false
}

// ==================== CANVAS IMAGE HELPERS ====================
export function makeImage(src){
  const img = new Image()
  img.src = src
  return img
}
export function drawCenteredImage(ctx, img, x, y, drawW){
  if (!img || !img.complete) return
  const natW = img.naturalWidth || 1
  const natH = img.naturalHeight || 1
  const drawH = drawW * (natH / natW)
  ctx.drawImage(img, x - drawW/2, y - drawH/2, drawW, drawH)
}
