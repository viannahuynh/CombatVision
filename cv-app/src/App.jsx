import { useEffect, useRef, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import Landing from './pages/Landing.jsx'
import Home from './pages/Home.jsx'
import Credits from './pages/Credits.jsx'
import Exit from './pages/Exit.jsx'
import lightsaber from './assets/lightsaber.gif'
import lightsaber2 from './assets/lightsaber2.gif'
import redlightsaber from './assets/redlightsaber.gif'
import sailormoonwand from './assets/sailormoonwand.gif'
import fightsong from './assets/fightsong.mp3'
import koSound from './assets/ko.mp3'
import HealthBarSprites from './components/HealthBar'
import {
  drawHands, centerFromPose, estimateBoxSize, Ema2D,
  snapBox, drawBoxOutline, assignLeftRight,
  handsToPixel, palmCenter, splitHandsByPlayer, pickMostExtendedHand,
  lineIntersectsRect, makeImage, drawCenteredImage
} from './cv/helpers'

/* CONFIG */
const POSE_NUM_PEOPLE = 2
const HANDS_NUM = 4

const OFFSET_X = 60
const OFFSET_Y = 0
const SNAP_GRID = 2
const BOX_SCALE = 1.20

const SWORD_LEN_PX = 300
const GRIP_FORWARD = 2

const TARGET_FPS = 15
const FRAME_MS = TARGET_FPS ? 1000 / TARGET_FPS : 0

const MAX_HP = 100
const HIT_DAMAGE = 10
const HIT_COOLDOWN_MS = 250

/* APP */
function VisionApp() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Loading models…')

  // load saber GIFs 
  const saberBlueImg = makeImage(lightsaber)
  const saberRedImg = makeImage(lightsaber2)

  // Fixed-size hitboxes
  const p1FixedSizeRef = useRef(null)
  const p2FixedSizeRef = useRef(null)
  const p1CenterEMA = useRef(new Ema2D(0.3))
  const p2CenterEMA = useRef(new Ema2D(0.3))
  const sizesLockedRef = useRef(false)

  // Latest hitboxes
  const p1BoxRef = useRef(null)
  const p2BoxRef = useRef(null)

  // Game state
  const [hp1, setHp1] = useState(MAX_HP)
  const [hp2, setHp2] = useState(MAX_HP)
  const lastHitP1Ref = useRef(0)
  const lastHitP2Ref = useRef(0)

  // Winner + KO state
  const [winner, setWinner] = useState(null)

  // Audio refs
  const bgmRef = useRef(null)
  const [needsAudioStart, setNeedsAudioStart] = useState(false)
  const koAudioRef = useRef(null)

  useEffect(() => {
    const bgm = new Audio(fightsong)
    bgm.loop = true
    bgm.volume = 0.6
    bgmRef.current = bgm

    const ko = new Audio(koSound)
    ko.volume = 1.0
    koAudioRef.current = ko

    return () => {
      try {
        bgm.pause()
      } catch {}
    }
  }, [])

  // Fade out helper
  function fadeOutAudio(audio, duration = 1200) {
    if (!audio) return
    const step = audio.volume / (duration / 50)
    const interval = setInterval(() => {
      if (audio.volume - step > 0.01) {
        audio.volume = Math.max(0, audio.volume - step)
      } else {
        audio.pause()
        audio.currentTime = 0
        audio.volume = 0.6 // reset for next play
        clearInterval(interval)
      }
    }, 50)
  }

  // BGM play/stop logic
  useEffect(() => {
    const a = bgmRef.current
    if (!a) return
    if (!winner) {
      a.play().catch(() => setNeedsAudioStart(true))
    } else {
      fadeOutAudio(a)
    }
  }, [winner])

  // KO sound effect
  useEffect(() => {
    if (winner && koAudioRef.current) {
      try {
        koAudioRef.current.currentTime = 0
        koAudioRef.current.play()
      } catch {}
    }
  }, [winner])

  // toggle for audio
  function startAudioManually() {
    setNeedsAudioStart(false)
    bgmRef.current?.play().catch(() => setNeedsAudioStart(true))
  }

  // RESET MATCH 
  function resetMatch() {
    // HP
    setHp1(MAX_HP)
    setHp2(MAX_HP)

    // winner & UI state
    setWinner(null)
    setStatus('Stand side-by-side')

    // re-calibrate hitboxes next round
    sizesLockedRef.current = false

    // clear last-hit cooldowns
    lastHitP1Ref.current = 0
    lastHitP2Ref.current = 0

    // nuke current hitboxes
    p1BoxRef.current = null
    p2BoxRef.current = null

    // bgm restart
    try {
      if (bgmRef?.current) {
        bgmRef.current.currentTime = 0
        bgmRef.current.volume = 0.6
        bgmRef.current.play()
      }
    } catch {
      setNeedsAudioStart(true)
    }
  }

  // Keyboard: press "R" to reset 
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.isComposing) return
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        resetMatch()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    let raf = 0
    let pose = null,
      hands = null
    let lastFrame = 0

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
      setStatus('Stand side-by-side')

      // Camera logic
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
      })
      const v = videoRef.current
      v.srcObject = stream
      await v.play()

      const c = canvasRef.current
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')

      const loop = async () => {
        const now = performance.now()
        if (FRAME_MS && now - lastFrame < FRAME_MS) {
          raf = requestAnimationFrame(loop)
          return
        }
        lastFrame = now

        const [pres, hres] = await Promise.all([
          pose.detectForVideo(v, now),
          hands.detectForVideo(v, now),
        ])

        ctx.clearRect(0, 0, c.width, c.height)

        const persons = (pres.landmarks || []).map(lm =>
          lm.map(p => ({ x: p.x * c.width, y: p.y * c.height, z: p.z }))
        )
        const [pLeft, pRight] = assignLeftRight(persons)

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

        if (pLeft && p1FixedSizeRef.current) {
          const { W, H } = p1FixedSizeRef.current
          const { cx, cy } = centerFromPose(pLeft)
          const sm = p1CenterEMA.current.update(cx, cy)
          const W2 = W * BOX_SCALE
          const H2 = H * BOX_SCALE
          let box = {
            x: sm.x - W2 / 2 + OFFSET_X,
            y: sm.y - H2 / 2 + OFFSET_Y,
            w: W2,
            h: H2,
          }
          box = snapBox(box, SNAP_GRID)
          p1BoxRef.current = box
          drawBoxOutline(ctx, box, '#00eaff')
        } else {
          p1BoxRef.current = null
        }

        if (pRight && p2FixedSizeRef.current) {
          const { W, H } = p2FixedSizeRef.current
          const { cx, cy } = centerFromPose(pRight)
          const sm = p2CenterEMA.current.update(cx, cy)
          const W2 = W * BOX_SCALE
          const H2 = H * BOX_SCALE
          let box = {
            x: sm.x - W2 / 2 - OFFSET_X,
            y: sm.y - H2 / 2 + OFFSET_Y,
            w: W2,
            h: H2,
          }
          box = snapBox(box, SNAP_GRID)
          p2BoxRef.current = box
          drawBoxOutline(ctx, box, '#ff4d4d')
        } else {
          p2BoxRef.current = null
        }

        if (persons.length < 2) setStatus('Need two people in frame')
        drawHands(ctx, hres, c.width, c.height)

        const palmCenterFromPts = pts => {
          const idx = [0, 5, 9, 13, 17].filter(i => pts[i])
          if (!idx.length) return null
          let sx = 0,
            sy = 0
          for (const i of idx) {
            sx += pts[i].x
            sy += pts[i].y
          }
          return { x: sx / idx.length, y: sy / idx.length }
        }

        const handsPix = handsToPixel(hres, c.width, c.height)
        const centerLeft = pLeft
          ? (() => {
              const { cx, cy } = centerFromPose(pLeft)
              return { x: cx, y: cy }
            })()
          : null
        const centerRight = pRight
          ? (() => {
              const { cx, cy } = centerFromPose(pRight)
              return { x: cx, y: cy }
            })()
          : null
        const { left: handsLeft, right: handsRight } = splitHandsByPlayer(
          handsPix,
          centerLeft,
          centerRight
        )
        const leftHandExtended = pickMostExtendedHand(handsLeft, centerLeft)
        const rightHandExtended = pickMostExtendedHand(handsRight, centerRight)

        if (leftHandExtended) {
          const pc = palmCenterFromPts(leftHandExtended.pts)
          if (pc) drawCenteredImage(ctx, saberBlueImg, pc.x, pc.y, SWORD_LEN_PX)
        }
        if (rightHandExtended) {
          const pc = palmCenterFromPts(rightHandExtended.pts)
          if (pc) drawCenteredImage(ctx, saberRedImg, pc.x, pc.y, SWORD_LEN_PX)
        }

        const bladeSeg = hand => {
          if (!hand) return null
          const grip = palmCenter(hand.pts)
          const tip = hand.pts[8]
          if (!grip || !tip) return null
          const dx = tip.x - grip.x,
            dy = tip.y - grip.y
          const len = Math.hypot(dx, dy) || 1
          const ux = dx / len,
            uy = dy / len
          const x1 = grip.x,
            y1 = grip.y
          const x2 = x1 + ux * SWORD_LEN_PX
          const y2 = y1 + uy * SWORD_LEN_PX
          return { x1, y1, x2, y2 }
        }

        const leftBlade = bladeSeg(leftHandExtended)
        const rightBlade = bladeSeg(rightHandExtended)

        if (leftBlade && p2BoxRef.current && !winner) {
          const { x1, y1, x2, y2 } = leftBlade
          if (lineIntersectsRect(x1, y1, x2, y2, p2BoxRef.current)) {
            if (now - lastHitP2Ref.current > HIT_COOLDOWN_MS && hp2 > 0) {
              lastHitP2Ref.current = now
              setHp2(h => {
                const newHp = Math.max(0, h - HIT_DAMAGE)
                if (newHp === 0) setWinner(1)
                return newHp
              })
            }
          }
        }

        if (rightBlade && p1BoxRef.current && !winner) {
          const { x1, y1, x2, y2 } = rightBlade
          if (lineIntersectsRect(x1, y1, x2, y2, p1BoxRef.current)) {
            if (now - lastHitP1Ref.current > HIT_COOLDOWN_MS && hp1 > 0) {
              lastHitP1Ref.current = now
              setHp1(h => {
                const newHp = Math.max(0, h - HIT_DAMAGE)
                if (newHp === 0) setWinner(2)
                return newHp
              })
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
  }, [winner, hp1, hp2])

  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100dvh',
        background: '#0b0b0b',
        color: '#fff',
      }}
    >
      <div style={{ position: 'relative', width: '80vw', maxWidth: 1280 }}>
        {/* health bars */}
        <HealthBarSprites hp1={hp1} hp2={hp2} max={MAX_HP} />

        {/* audio toggle button */}
        {needsAudioStart && !winner && (
          <button
            onClick={startAudioManually}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 30,
              background: '#111',
              color: '#fff',
              border: '1px solid #444',
              padding: '8px 12px',
              borderRadius: 8,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            ▶ Toggle Audio
          </button>
        )}

        {/* Winner overlay */}
        {winner && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              flexDirection: 'column',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: 32,
            }}
          >
            <img
              src={winner === 1 ? sailormoonwand : redlightsaber}
              alt="KO"
              style={{ width: 240, marginBottom: 16 }}
            />
            <div>Knockout! Player {winner} wins!</div>
            <button
              onClick={resetMatch}
              style={{
                marginTop: 20,
                padding: '8px 16px',
                fontFamily: 'monospace',
                background: '#222',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Reset (R)
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', borderRadius: 12 }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        <div
          style={{
            position: 'absolute',
            top: 36,
            left: 12,
            fontFamily: 'monospace',
          }}
        >
          {ready ? status : 'Loading models…'}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/home" element={<Home />} />
      <Route path="/play" element={<VisionApp />} />
    </Routes>
  )
}
