/// <reference lib="webworker" />
import { FilesetResolver, HandLandmarker /* FaceDetector (optional) */ } from '@mediapipe/tasks-vision'

let hands /*, faces*/;
let ready = false

async function init() {
  
  const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/hand_landmarker.task' },
        numHands: 4,    
        runningMode: 'VIDEO'
    });


  hands = await HandLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
    },
    numHands: 4,                 // up to 2 players x 2 hands
    runningMode: 'VIDEO'
  })

  // If you want faces later:
  // faces = await FaceDetector.createFromOptions(files, { ... })

  ready = true
  postMessage({ t: 'ready' })
}
init()

onmessage = async (e) => {
  const { t, frame, w, h } = e.data
  if (t !== 'frame' || !ready || !frame) return

  const now = performance.now()
  const hres = await hands.detectForVideo(frame, now)

  const outHands = []
  if (hres.landmarks) {
    for (let i = 0; i < hres.landmarks.length; i++) {
      const lm = hres.landmarks[i]    // 21 normalized landmarks
      const pts = lm.map(p => ({ x: p.x * w, y: p.y * h }))
      let handed = 'Unknown', score = 0
      if (hres.handedness && hres.handedness[i] && hres.handedness[i][0]) {
        handed = hres.handedness[i][0].categoryName // 'Left' | 'Right'
        score  = hres.handedness[i][0].score
      }
      outHands.push({ pts, handed, score })
    }
  }

  postMessage({ t: 'hands', hands: outHands, w, h })
  frame.close()
}
