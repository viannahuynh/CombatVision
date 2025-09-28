// src/components/HealthBarSprites.jsx
import React from 'react'

// ===== Replace these imports with your actual sprite files =====
// Expecting 11 frames per player: 0..10  (10 = full, 0 = empty/KO)
// Player 1
import p1_0  from '../assets/healthbar/hpblue0.png'
import p1_1  from '../assets/healthbar/hpblue1.png'
import p1_2  from '../assets/healthbar/hpblue2.png'
import p1_3  from '../assets/healthbar/hpblue3.png'
import p1_4  from '../assets/healthbar/hpblue4.png'
import p1_5  from '../assets/healthbar/hpblue5.png'
import p1_6  from '../assets/healthbar/hpblue6.png'
import p1_7  from '../assets/healthbar/hpblue7.png'
import p1_8  from '../assets/healthbar/hpblue8.png'
import p1_9  from '../assets/healthbar/hpblue9.png'
import p1_10 from '../assets/healthbar/fullhpblue.png'

// Player 2
import p2_0  from '../assets/healthbar/hpred0.png'
import p2_1  from '../assets/healthbar/hpred1.png'
import p2_2  from '../assets/healthbar/hpred2.png'
import p2_3  from '../assets/healthbar/hpred3.png'
import p2_4  from '../assets/healthbar/hpred4.png'
import p2_5  from '../assets/healthbar/hpred5.png'
import p2_6  from '../assets/healthbar/hpred6.png'
import p2_7  from '../assets/healthbar/hpred7.png'
import p2_8  from '../assets/healthbar/hpred8.png'
import p2_9  from '../assets/healthbar/hpred9.png'
import p2_10 from '../assets/healthbar/hpredfull.png'
// ===============================================================

const SPRITES_P1 = [p1_0,p1_1,p1_2,p1_3,p1_4,p1_5,p1_6,p1_7,p1_8,p1_9,p1_10]
const SPRITES_P2 = [p2_0,p2_1,p2_2,p2_3,p2_4,p2_5,p2_6,p2_7,p2_8,p2_9,p2_10]

// Map hp → sprite index (10 buckets → per-hit change)
//  - idx = 10 when full, 0 when empty.
//  - If your game is exactly 10 hits to KO, consider HIT_DAMAGE = max/10.
function hpToIndex(hp, max) {
  const totalBuckets = 10
  const ratio = Math.max(0, Math.min(1, hp / max))
  // Ceil so a small decrease immediately steps down a sprite
  const idx = Math.ceil(ratio * totalBuckets)
  return idx // 0..10
}

export default function HealthBarSprites({ hp1, hp2, max }) {
  const idx1 = hpToIndex(hp1, max)
  const idx2 = hpToIndex(hp2, max)

  return (
    <div style={{
      position:'absolute', top:10, left:10, right:10, zIndex:10, paddingTop:15,
      display:'flex', alignItems:'center', justifyContent:'space-between', gap:16
    }}>
      {/* Player 1 (left) */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontFamily:'monospace', color:'#00eaff', fontSize:18 }}>Player 1</div>
        <img
          src={SPRITES_P1[idx1]}
          alt={`P1 HP ${idx1}/10`}
          style={{ height: 70, imageRendering:'pixelated' }}
        />
      </div>

      {/* Player 2 (right) */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <img
          src={SPRITES_P2[idx2]}
          alt={`P2 HP ${idx2}/10`}
          style={{ height: 70, imageRendering:'pixelated' }}
        />
        <div style={{ fontFamily:'monospace', color:'#ff4d4d', fontSize:18,  }}>Player 2</div>
      </div>
    </div>
  )
}
