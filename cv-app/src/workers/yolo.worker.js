/// <reference lib="webworker" />
import { FilesetResolver, HandLandmarker, FaceDetector } from '@mediapipe/tasks-vision'

let hands, faces, ready = false
const HANDS = 4 // detect up to 4 hands in frame

async function init() {
  const files = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  )
  hands = await HandLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
    },
    numHands: HANDS,
    runningMode: 'VIDEO'
  })
  faces = await FaceDetector.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/face_detector/float16/1/face_detector.task'
    },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.5
  })
  ready = true
  postMessage({ t: 'ready' })
}
init()

onmessage = async (e) => {
  const { t, frame, w, h } = e.data
  if (t !== 'frame' || !ready || !frame) return
  const now = performance.now()

  // Run models
  const hres = await hands.detectForVideo(frame, now)
  const fres = await faces.detectForVideo(frame, now)

  // Normalize outputs to pixel space
  const handList = []
  ;(hres.landmarks || []).forEach((lm, idx) => {
    // landmarks are normalized [0..1]
    const pts = lm.map(p => ({ x: p.x * w, y: p.y * h }))
    const tip = pts[8] // index fingertip
    // handedness info
    let handed = 'Unknown', score = 0
    if (hres.handedness && hres.handedness[idx] && hres.handedness[idx][0]) {
      handed = hres.handedness[idx][0].categoryName // 'Left'/'Right'
      score = hres.handedness[idx][0].score
    }
    // approximate palm center (avg of some base points)
    const palmIdx = [0, 1, 5, 9, 13, 17]
    const cx = palmIdx.reduce((s,i)=>s+pts[i].x,0)/palmIdx.length
    const cy = palmIdx.reduce((s,i)=>s+pts[i].y,0)/palmIdx.length
    handList.push({ tip, cx, cy, handed, score })
  })

  const faceList = []
  ;(fres.detections || []).forEach(det => {
    // boundingBox is relative
    const bb = det.boundingBox
    const x = bb.originX * w, y = bb.originY * h, ww = bb.width * w, hh = bb.height * h
    faceList.push({ x, y, w: ww, h: hh })
  })

  postMessage({ t: 'obs', hands: handList, faces: faceList, w, h })
  frame.close()
}
