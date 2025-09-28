import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import lightsaber from './assets/lightsaber.gif'
import lightsaber2 from './assets/lightsaber2.gif'
import redlightsaber from './assets/redlightsaber.gif'
import sailormoonwand from './assets/sailormoonwand.gif'

import HealthBar from './components/HealthBar'
import {
  drawHands, centerFromPose, estimateBoxSize, Ema2D,
  snapBox, drawBoxOutline, assignLeftRight,
  handsToPixel, palmCenter, splitHandsByPlayer, pickMostExtendedHand,
  lineIntersectsRect, makeImage, drawCenteredImage
} from './cv/helpers'

/* ==================== CONFIG (unchanged) ==================== */
const POSE_NUM_PEOPLE = 2
const HANDS_NUM = 4

const OFFSET_X  = 60
const OFFSET_Y  = 0
const SNAP_GRID = 2
const BOX_SCALE = 1.20

const SWORD_LEN_PX = 300
const GRIP_FORWARD = 2

const TARGET_FPS = 15
const FRAME_MS = TARGET_FPS ? (1000 / TARGET_FPS) : 0

const MAX_HP = 100
const HIT_DAMAGE = 8
const HIT_COOLDOWN_MS = 250

/* ==================== APP ==================== */
export default function App() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const [ready, setReady]   = useState(false)
  const [status, setStatus] = useState('Loading models…')

  // load saber GIFs once
  const saberBlueImg = makeImage(lightsaber)
  const saberRedImg  = makeImage(lightsaber2)
  // (optional) decode:
  // try { await Promise.all([saberBlueImg.decode?.(), saberRedImg.decode?.()]) } catch {}

  // Fixed-size box + smoothed centers
  const p1FixedSizeRef = useRef(null)   // {W,H}
  const p2FixedSizeRef = useRef(null)
  const p1CenterEMA    = useRef(new Ema2D(0.30))
  const p2CenterEMA    = useRef(new Ema2D(0.30))
  const sizesLockedRef = useRef(false)

  // Latest hitboxes for collisions
  const p1BoxRef = useRef(null) // LEFT player's box
  const p2BoxRef = useRef(null) // RIGHT player's box

  // Sword <img> overlays (kept as in original; not used when drawing on canvas)
  const swordBlueRef = useRef(null)
  const swordRedRef  = useRef(null)

  // Game state
  const [hp1, setHp1] = useState(MAX_HP)
  const [hp2, setHp2] = useState(MAX_HP)
  const lastHitP1Ref = useRef(0)
  const lastHitP2Ref = useRef(0)

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

        const palmCenterFromPts = (pts) => {
          const idx = [0,5,9,13,17].filter(i => pts[i])
          if (!idx.length) return null
          let sx=0, sy=0
          for (const i of idx){ sx += pts[i].x; sy += pts[i].y }
          return { x: sx/idx.length, y: sy/idx.length }
        }

        // ==== Swords: choose the hand FURTHEST from each player's body ====
        const handsPix = handsToPixel(hres, c.width, c.height)

        const centerLeft  = pLeft  ? (() => { const { cx, cy } = centerFromPose(pLeft);  return { x: cx, y: cy } })() : null
        const centerRight = pRight ? (() => { const { cx, cy } = centerFromPose(pRight); return { x: cx, y: cy } })() : null

        const { left: handsLeft, right: handsRight } = splitHandsByPlayer(handsPix, centerLeft, centerRight)
        const leftHandExtended  = pickMostExtendedHand(handsLeft,  centerLeft)
        const rightHandExtended = pickMostExtendedHand(handsRight, centerRight)
        if (leftHandExtended) {
          const pc = palmCenterFromPts(leftHandExtended.pts)
          if (pc) drawCenteredImage(ctx, saberBlueImg, pc.x, pc.y, SWORD_LEN_PX)
        }
        if (rightHandExtended) {
          const pc = palmCenterFromPts(rightHandExtended.pts)
          if (pc) drawCenteredImage(ctx, saberRedImg,  pc.x, pc.y, SWORD_LEN_PX)
        }

        // ==== COLLISIONS: saber blade segment vs opponent box ====
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
  }, []) // single-run

  return (
    <div style={{ display:'grid', placeItems:'center', minHeight:'100dvh', background:'#0b0b0b', color:'#fff' }}>
      <div style={{ position:'relative', width:'80vw', maxWidth:1280 }}>
        {/* HUD: health bars */}
        <HealthBar hp1={hp1} hp2={hp2} max={MAX_HP} />

        <video ref={videoRef} playsInline muted style={{ width:'100%', borderRadius:12 }} />
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }} />

        {/* Sword GIF overlays kept (unused when drawing on canvas) */}
        <img
          ref={swordBlueRef}
          src={lightsaber}
          alt="blue-sword"
          style={{ position:'absolute', left:0, top:0, transformOrigin:'right center', pointerEvents:'none', display:'none' }}
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
