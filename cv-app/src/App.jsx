import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'

/* ==================== CONFIG ==================== */
const POSE_NUM_PEOPLE = 2
const HANDS_NUM = 4

// Fixed-box tunables
const OFFSET_X  = 60   // push boxes horizontally toward the middle
const OFFSET_Y  = 0
const SNAP_GRID = 2

/* ==================== HAND VIS (optional) ==================== */
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
]
function drawHands(ctx, hres, W, H) {
  const handsL = hres.landmarks || []
  const handedness = hres.handedness || []
  for (let i=0;i<handsL.length;i++){
    const label = handedness[i]?.[0]?.categoryName || 'Hand'
    const color = label === 'Right' ? '#00eaff' : '#ff4dff'
    const pts = handsL[i].map(p => ({ x: p.x*W, y: p.y*H }))

    // palm halo
    const palmIdx = [0,1,5,9,13,17]
    const cx = palmIdx.reduce((s,j)=>s+pts[j].x,0)/palmIdx.length
    const cy = palmIdx.reduce((s,j)=>s+pts[j].y,0)/palmIdx.length
    const r = palmIdx.reduce((m,j)=>Math.max(m, Math.hypot(pts[j].x-cx, pts[j].y-cy)), 0) * 1.2
    ctx.fillStyle = label === 'Right' ? 'rgba(0,234,255,0.20)' : 'rgba(255,77,255,0.20)'
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill()

    // fingertip (index = 8)
    const tip = pts[8]
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tip.x, tip.y, 8, 0, Math.PI*2); ctx.fill()
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tip.x, tip.y, 10, 0, Math.PI*2); ctx.stroke()

    // skeleton
    // ctx.strokeStyle = color; ctx.lineWidth = 3
    // HAND_CONNECTIONS.forEach(([a,b]) => {
    //   const pa = pts[a], pb = pts[b]
    //   ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
    // })
  }
}

/* ==================== POSE HELPERS (top-level!) ==================== */
// MediaPipe Pose indices (33 landmarks)
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
  const refW = shW || hipW || 80  // px fallback

  let torsoH = null
  if (shL && hpL) torsoH = Math.hypot(hpL.x-shL.x, hpL.y-shL.y)
  if (shR && hpR) torsoH = Math.max(torsoH||0, Math.hypot(hpR.x-shR.x, hpR.y-shR.y))

  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v))
  const W = clamp(refW * 2.2, 140, 360)                 // ~2.2× shoulders
  const H = clamp((torsoH || refW*2.0) * 2.0, 220, 520) // ~2× torso (or ~4× shoulders)
  return { W, H }
}

// EMA for center smoothing
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
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.setLineDash([10,6])
  ctx.strokeRect(b.x, b.y, b.w, b.h)
  ctx.restore()
}

function avgX(lm){ return lm.reduce((s,p)=>s+p.x,0)/lm.length }
function assignLeftRight(persons){
  const ps = persons.slice().sort((a,b)=>avgX(a)-avgX(b))
  return [ps[0]||null, ps[1]||null]
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

  useEffect(() => {
    let raf = 0
    let pose = null, hands = null

    const init = async () => {
      const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')

      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/pose_landmarker_full.task' },
        runningMode: 'VIDEO',
        numPoses: POSE_NUM_PEOPLE,
      })

      hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/hand_landmarker.task' },
        runningMode: 'VIDEO',
        numHands: HANDS_NUM,
      })

      setReady(true)
      setStatus('Show two people side-by-side')

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
        const pres = await pose.detectForVideo(v, now)
        const hres = await hands.detectForVideo(v, now)

        ctx.clearRect(0, 0, c.width, c.height)

        // Pose → pixel landmarks for each person
        const persons = (pres.landmarks || []).map(lm =>
          lm.map(p => ({ x: p.x * c.width, y: p.y * c.height, z: p.z }))
        )

        // Left/right assignment
        const [pLeft, pRight] = assignLeftRight(persons)

        // LEFT (blue) – fixed-size, center-smoothed, offset RIGHT
        if (pLeft) {
          if (!p1FixedSizeRef.current) p1FixedSizeRef.current = estimateBoxSize(pLeft)
          const { W, H } = p1FixedSizeRef.current
          const { cx, cy } = centerFromPose(pLeft)
          const sm = p1CenterEMA.current.update(cx, cy)
          let box = { x: sm.x - W/2 + OFFSET_X, y: sm.y - H/2 + OFFSET_Y, w: W, h: H }
          box = snapBox(box, SNAP_GRID)
          drawBoxOutline(ctx, box, '#00eaff')
        }

        // RIGHT (red) – fixed-size, center-smoothed, offset LEFT
        if (pRight) {
          if (!p2FixedSizeRef.current) p2FixedSizeRef.current = estimateBoxSize(pRight)
          const { W, H } = p2FixedSizeRef.current
          const { cx, cy } = centerFromPose(pRight)
          const sm = p2CenterEMA.current.update(cx, cy)
          let box = { x: sm.x - W/2 - OFFSET_X, y: sm.y - H/2 + OFFSET_Y, w: W, h: H }
          box = snapBox(box, SNAP_GRID)
          drawBoxOutline(ctx, box, '#ff4d4d')
        }

        setStatus(persons.length < 2 ? 'Need two people visible' : 'Tracking 2 players')

        // Hands overlay (optional)
        drawHands(ctx, hres, c.width, c.height)

        raf = requestAnimationFrame(loop)
      }
      loop()
    }

    init().catch(err => {
      console.error(err)
      setStatus('Init failed – check console')
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div style={{ display:'grid', placeItems:'center', minHeight:'100dvh', background:'#0b0b0b', color:'#fff' }}>
      <div style={{ position:'relative', width:'80vw', maxWidth:1280 }}>
        <video ref={videoRef} playsInline muted style={{ width:'100%', borderRadius:12 }} />
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} />
        <div style={{ position:'absolute', top:12, left:12, fontFamily:'monospace' }}>
          {ready ? status : 'Loading models…'}
        </div>
      </div>
    </div>
  )
}
