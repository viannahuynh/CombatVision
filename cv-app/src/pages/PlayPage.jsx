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

export default function PlayPage() {
  return (
    <div style={{ minHeight:"100vh", display:"grid", placeItems:"center" }}>
      <h2>Play (placeholder)</h2>
    </div>
  );
}
