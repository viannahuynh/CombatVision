import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import lightsaber from './assets/lightsaber.gif'
import lightsaber2 from './assets/lightsaber2.gif'
import redlightsaber from './assets/redlightsaber.gif'

/* ==================== CONFIG ==================== */
const POSE_NUM_PEOPLE = 2
const HANDS_NUM = 4

// Hit box tuning (fixed-size boxes, offset toward the middle)
const OFFSET_X  = 60
const OFFSET_Y  = 0
const SNAP_GRID = 2
const BOX_SCALE = 1.20   // make hitboxes 25% larger

// Lightsaber config
const SWORD_LEN_PX = 260     // fixed length (px)
const GRIP_FORWARD = 2       // tiny nudge along blade so hilt sits in fist

// Render cap (lower CPU). Set to 0 to disable.
const TARGET_FPS = 15
const FRAME_MS = TARGET_FPS ? (1000 / TARGET_FPS) : 0

// Game / damage
const MAX_HP = 100
const HIT_DAMAGE = 8            // damage per registered hit
const HIT_COOLDOWN_MS = 250     // per-player invincibility window after taking a hit

/* ==================== HAND VIS (pink/blue halos) ==================== */
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
]
function drawHands(ctx, hres, W, H) {
  const handsL = hres?.landmarks || []
  const handedness = hres?.handedness || []
  for (let i=0;i<handsL.length;i++){
    const label = handedness[i]?.[0]?.categoryName || 'Hand'
    const color = label === 'Right' ? '#00eaff' : '#ff4dff'  // cyan (right) / pink (left)
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

    // (optional) skeleton — commented for perf
    // ctx.strokeStyle = color; ctx.lineWidth = 3
    // HAND_CONNECTIONS.forEach(([a,b]) => {
    //   const pa = pts[a], pb = pts[b]
    //   ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
    // })
  }
}

/* ==================== POSE HELPERS ==================== */
const L_SH=11, R_SH=12, L_HIP=23, R_HIP=24
function centerFromPose(lm){
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
function estimateBoxSize(lm){
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
// EMA (smooth player center)
class Ema2D {
  constructor(alpha = 0.30){ this.a=alpha; this.x=null; this.y=null }
  update(x,y){
    if (this.x==null){ this.x=x; this.y=y; return {x,y} }
    this.x = this.a*x + (1-this.a)*this.x
    this.y = this.a*y + (1-this.a)*this.y
    return { x:this.x, y:this.y }
  }
}
function snap(v,g=2){ return Math.round(v/g)*g }
function snapBox(b, grid=2){ return { x:snap(b.x,grid), y:snap(b.y,grid), w:snap(b.w,grid), h:snap(b.h,grid) } }
function drawBoxOutline(ctx, b, color){
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.setLineDash([10,6]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore()
}
function avgX(lm){ return lm.reduce((s,p)=>s+p.x,0)/lm.length }
function assignLeftRight(persons){ const ps = persons.slice().sort((a,b)=>avgX(a)-avgX(b)); return [ps[0]||null, ps[1]||null] }

/* ==================== HANDS & SWORDS HELPERS ==================== */
function handsToPixel(hres, W, H){
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
function palmCenter(pts){
  const idx = [0,5,9,13,17].filter(i => pts[i])
  if (!idx.length) return null
  let sx=0, sy=0
  for (const i of idx){ sx += pts[i].x; sy += pts[i].y }
  return { x: sx/idx.length, y: sy/idx.length }
}
function splitHandsByPlayer(handsPix, centerLeft, centerRight){
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
function pickMostExtendedHand(handsForPlayer, playerCenter){
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
function placeSwordFixedAtPalm(imgEl, handPts, fixedLenPx){
  if (!imgEl || !handPts) return
  const grip = palmCenter(handPts)
  const tip  = handPts[8]
  if (!grip || !tip) return
  const dx = tip.x - grip.x, dy = tip.y - grip.y
  const angle = Math.atan2(dy, dx)
  const gx = grip.x + Math.cos(angle) * GRIP_FORWARD
  const gy = grip.y + Math.sin(angle) * GRIP_FORWARD
  imgEl.style.width  = `${fixedLenPx}px`
  imgEl.style.height = 'auto'
  imgEl.style.transform = `translate(${gx}px, ${gy}px) rotate(${angle}rad)`
  imgEl.style.display = 'block'
  imgEl.style.willChange = 'transform'
}
function hideSword(imgEl){ if (imgEl) imgEl.style.display = 'none' }

/* ==================== GEOMETRY: line ↔ rect ==================== */
function pointInRect(x, y, r){ return x>=r.x && y>=r.y && x<=r.x+r.w && y<=r.y+r.h }
function segIntersect(ax,ay,bx,by, cx,cy,dx,dy){
  // segment AB vs CD
  const s1x = bx-ax, s1y = by-ay
  const s2x = dx-cx, s2y = dy-cy
  const den = (-s2x*s1y + s1x*s2y)
  if (den === 0) return false
  const s = (-s1y*(ax-cx) + s1x*(ay-cy)) / den
  const t = ( s2x*(ay-cy) - s2y*(ax-cx)) / den
  return (s>=0 && s<=1 && t>=0 && t<=1)
}
function lineIntersectsRect(x1,y1,x2,y2, r){
  if (pointInRect(x1,y1,r) || pointInRect(x2,y2,r)) return true
  const rx=r.x, ry=r.y, rw=r.w, rh=r.h
  // edges: top, right, bottom, left
  if (segIntersect(x1,y1,x2,y2, rx,ry, rx+rw,ry)) return true
  if (segIntersect(x1,y1,x2,y2, rx+rw,ry, rx+rw,ry+rh)) return true
  if (segIntersect(x1,y1,x2,y2, rx+rw,ry+rh, rx,ry+rh)) return true
  if (segIntersect(x1,y1,x2,y2, rx,ry+rh, rx,ry)) return true
  return false
}

/* ==================== APP ==================== */
export default function App() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const [ready, setReady]   = useState(false)
  const [status, setStatus] = useState('Loading models…')

  // Fixed-size box + smoothed centers
  const p1FixedSizeRef = useRef(null)   // {W,H}
  const p2FixedSizeRef = useRef(null)
  const p1CenterEMA    = useRef(new Ema2D(0.30))
  const p2CenterEMA    = useRef(new Ema2D(0.30))
  const sizesLockedRef = useRef(false)

  // Latest hitboxes for collisions
  const p1BoxRef = useRef(null) // LEFT player's box
  const p2BoxRef = useRef(null) // RIGHT player's box

  // Sword <img> overlays
  const swordBlueRef = useRef(null) // left player
  const swordRedRef  = useRef(null) // right player

  // Game state
  const [hp1, setHp1] = useState(MAX_HP) // left player's HP
  const [hp2, setHp2] = useState(MAX_HP) // right player's HP
  const lastHitP1Ref = useRef(0) // last time P1 took damage
  const lastHitP2Ref = useRef(0) // last time P2 took damage

  useEffect(() => {
    let raf = 0
    let pose = null, hands = null
    let lastFrame = 0

    const init = async () => {
      const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')

      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/pose_landmarker_full.task' }, // swap to _lite for speed
        runningMode: 'VIDEO',
        numPoses: POSE_NUM_PEOPLE,
      })
      hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/hand_landmarker.task' },
        runningMode: 'VIDEO',
        numHands: HANDS_NUM,
      })

      setReady(true)
      setStatus('Stand side-by-side')

      // Camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
      const v = videoRef.current
      v.srcObject = stream
      await v.play()

      const c = canvasRef.current
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')

      const loop = async () => {
        const now = performance.now()
        if (FRAME_MS && (now - lastFrame < FRAME_MS)) { raf = requestAnimationFrame(loop); return }
        lastFrame = now

        const [pres, hres] = await Promise.all([
          pose.detectForVideo(v, now),
          hands.detectForVideo(v, now),
        ])

        ctx.clearRect(0, 0, c.width, c.height)

        // Pose → pixel landmarks
        const persons = (pres.landmarks || []).map(lm =>
          lm.map(p => ({ x: p.x * c.width, y: p.y * c.height, z: p.z }))
        )
        const [pLeft, pRight] = assignLeftRight(persons)

        // ----- Size calibration: lock both boxes when both players are visible -----
        if (!sizesLockedRef.current) {
          if (pLeft && pRight) {
            const e1 = estimateBoxSize(pLeft)
            const e2 = estimateBoxSize(pRight)
            const W = Math.max(e1.W, e2.W)
            const H = Math.max(e1.H, e2.H)
            p1FixedSizeRef.current = { W, H }
            p2FixedSizeRef.current = { W, H }
            sizesLockedRef.current = true
            setStatus('Calibrated ✓')
          } else {
            setStatus('Waiting for both players…')
          }
        }

        // LEFT (blue) – fixed-size, center-smoothed, offset RIGHT — scaled up
        if (pLeft && p1FixedSizeRef.current) {
          const { W, H } = p1FixedSizeRef.current
          const { cx, cy } = centerFromPose(pLeft)
          const sm = p1CenterEMA.current.update(cx, cy)

          const W2 = W * BOX_SCALE
          const H2 = H * BOX_SCALE
          let box = { x: sm.x - W2/2 + OFFSET_X, y: sm.y - H2/2 + OFFSET_Y, w: W2, h: H2 }
          box = snapBox(box, SNAP_GRID)
          p1BoxRef.current = box
          drawBoxOutline(ctx, box, '#00eaff')
        } else {
          p1BoxRef.current = null
        }

        // RIGHT (red) – fixed-size, center-smoothed, offset LEFT — scaled up
        if (pRight && p2FixedSizeRef.current) {
          const { W, H } = p2FixedSizeRef.current
          const { cx, cy } = centerFromPose(pRight)
          const sm = p2CenterEMA.current.update(cx, cy)

          const W2 = W * BOX_SCALE
          const H2 = H * BOX_SCALE
          let box = { x: sm.x - W2/2 - OFFSET_X, y: sm.y - H2/2 + OFFSET_Y, w: W2, h: H2 }
          box = snapBox(box, SNAP_GRID)
          p2BoxRef.current = box
          drawBoxOutline(ctx, box, '#ff4d4d')
        } else {
          p2BoxRef.current = null
        }

        // Status fallback if only one person
        if (persons.length < 2) setStatus('Need two people visible')

        // Hands (pink/blue)
        drawHands(ctx, hres, c.width, c.height)

        // ==== Swords: choose the hand FURTHEST from each player's body ====
        const handsPix = handsToPixel(hres, c.width, c.height)

        const centerLeft  = pLeft  ? (() => { const { cx, cy } = centerFromPose(pLeft);  return { x: cx, y: cy } })() : null
        const centerRight = pRight ? (() => { const { cx, cy } = centerFromPose(pRight); return { x: cx, y: cy } })() : null

        const { left: handsLeft, right: handsRight } = splitHandsByPlayer(handsPix, centerLeft, centerRight)
        const leftHandExtended  = pickMostExtendedHand(handsLeft,  centerLeft)
        const rightHandExtended = pickMostExtendedHand(handsRight, centerRight)

        // Place swords (visual)
        if (leftHandExtended)  placeSwordFixedAtPalm(swordBlueRef.current, leftHandExtended.pts,  SWORD_LEN_PX)
        else                   hideSword(swordBlueRef.current)

        if (rightHandExtended) placeSwordFixedAtPalm(swordRedRef.current,  rightHandExtended.pts, SWORD_LEN_PX)
        else                   hideSword(swordRedRef.current)

        // ==== COLLISIONS: saber blade segment vs opponent box ====
        // Build blade segments from palm center toward fingertip by SWORD_LEN_PX
        const bladeSeg = (hand) => {
          if (!hand) return null
          const grip = palmCenter(hand.pts)
          const tip  = hand.pts[8]
          if (!grip || !tip) return null
          const dx = tip.x - grip.x, dy = tip.y - grip.y
          const len = Math.hypot(dx, dy) || 1
          const ux = dx / len, uy = dy / len
          const x1 = grip.x, y1 = grip.y
          const x2 = x1 + ux * SWORD_LEN_PX
          const y2 = y1 + uy * SWORD_LEN_PX
          return { x1, y1, x2, y2 }
        }

        const leftBlade  = bladeSeg(leftHandExtended)
        const rightBlade = bladeSeg(rightHandExtended)

        // LEFT player's blade hits RIGHT player's hitbox → damage P2
        if (leftBlade && p2BoxRef.current) {
          const { x1,y1,x2,y2 } = leftBlade
          if (lineIntersectsRect(x1,y1,x2,y2, p2BoxRef.current)) {
            // cooldown check
            if (now - lastHitP2Ref.current > HIT_COOLDOWN_MS && hp2 > 0) {
              lastHitP2Ref.current = now
              setHp2(h => Math.max(0, h - HIT_DAMAGE))
            }
          }
        }

        // RIGHT player's blade hits LEFT player's hitbox → damage P1
        if (rightBlade && p1BoxRef.current) {
          const { x1,y1,x2,y2 } = rightBlade
          if (lineIntersectsRect(x1,y1,x2,y2, p1BoxRef.current)) {
            if (now - lastHitP1Ref.current > HIT_COOLDOWN_MS && hp1 > 0) {
              lastHitP1Ref.current = now
              setHp1(h => Math.max(0, h - HIT_DAMAGE))
            }
          }
        }

        raf = requestAnimationFrame(loop)
      }
      loop()
    }

    init().catch(err => {
      console.error(err)
      setStatus('Init failed – check console')
    })
    return () => cancelAnimationFrame(raf)
  }, []) // hp deps only affect cooldown checks using refs; safe here

  return (
    <div style={{ display:'grid', placeItems:'center', minHeight:'100dvh', background:'#0b0b0b', color:'#fff' }}>
      <div style={{ position:'relative', width:'80vw', maxWidth:1280 }}>
        {/* HUD: health bars */}
        <div style={{ position:'absolute', top:10, left:10, right:10, zIndex:10, display:'flex', gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:'monospace', fontSize:12, marginBottom:4, color:'#00eaff' }}>Player 1</div>
            <div style={{ height:12, background:'#123947', borderRadius:6, overflow:'hidden', boxShadow:'inset 0 0 0 1px #0aa0bb' }}>
              <div style={{ width:`${(hp1/MAX_HP)*100}%`, height:'100%', background:'#00eaff', transition:'width 120ms linear' }} />
            </div>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:'monospace', fontSize:12, marginBottom:4, textAlign:'right', color:'#ff4d4d' }}>Player 2</div>
            <div style={{ height:12, background:'#401f1f', borderRadius:6, overflow:'hidden', boxShadow:'inset 0 0 0 1px #a33' }}>
              <div style={{ width:`${(hp2/MAX_HP)*100}%`, height:'100%', background:'#ff4d4d', transition:'width 120ms linear' }} />
            </div>
          </div>
        </div>

        <video ref={videoRef} playsInline muted style={{ width:'100%', borderRadius:12 }} />
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} />

        {/* Sword GIFs (overlayed above canvas) */}
        <img
          ref={swordBlueRef}
          src={lightsaber}
          alt="blue-sword"
          style={{ position:'absolute', left:0, top:0, transformOrigin:'left center', pointerEvents:'none', display:'none' }}
        />
        <img
          ref={swordRedRef}
          src={redlightsaber}
          alt="red-sword"
          style={{ position:'absolute', left:0, top:0, transformOrigin:'left center', pointerEvents:'none', display:'none' }}
        />

        <div style={{ position:'absolute', top:36, left:12, fontFamily:'monospace' }}>
          {ready ? status : 'Loading models…'}
        </div>
      </div>
    </div>
  )
}
