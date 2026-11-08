// Local draft for the exact prepared Thirsty in the Dark master; not a saved
// Builder direction. Existing Echo cues remain the sole source of timing.
import { CAMPFIRE_DIRECTION_SCHEMA } from './campfire-direction.js';
import { buildCampfireDirection } from './saved-campfire-direction.js';
const MASTER = '5b4afff4408666e481a59f03d3f08a7c6506c560bd6abb36ffee4d8843bffb03';
// plume reach, smoke, formation participation multiplier, camera distance.
const sections = [
  [0.52,0.72,0.24,1.06], [0.64,0.77,0.35,1.04], [0.76,0.85,0.44,1.02],
  [0.90,0.95,0.70,0.98], [0.64,0.85,0.35,1.02], [1.00,1.10,0.75,1.00],
  [1.18,1.10,0.80,1.03], [1.00,1.00,0.65,1.08], [1.30,1.18,0.88,1.10],
  [0.55,0.88,0.18,1.05], [1.25,1.18,0.90,1.04], [0.98,1.10,0.58,1.08],
  [0.85,0.95,0.65,1.02], [1.05,1.05,0.78,0.98], [0.82,0.92,0.92,0.96],
  [0.68,0.85,0.35,1.04], [0.50,0.70,0.12,1.07]
];
// An open ring is a local stage interpretation, never a mutation of Echo's score.
const ringSections=new Set([1,2,3,5,7,10,13]);
// Cue-relative development keeps the long passages alive without inventing a
// second musical timeline. Endpoints return to neutral for smooth handoffs.
const development={
  5:[{at:0},{at:.26,reach:1.12,participation:1.05,smoke:1.08},{at:.51,reach:1.04,participation:.32,smoke:1.12},{at:.75,reach:1.16,participation:1.12,smoke:1.04},{at:1}],
  6:[{at:0},{at:.4,reach:1.10,participation:.88,smoke:1.06},{at:.78,reach:1.18,participation:1.05,smoke:1.12},{at:1}]
};

export function createThirstyCampfireDirection(packet) {
  if (packet.timeline?.source?.sourceSha256 !== MASTER || packet.sourceRevision !== 1 ||
      packet.score?.fingerprint !== 'fnv1a:87de6207' || packet.score?.cues?.length !== sections.length) return null;
  const cues=packet.score.cues;
  if (!cues.every((cue,i)=>cue.id===`cue-master:section:${i}`)) return null;
  const extension={schemaVersion:CAMPFIRE_DIRECTION_SCHEMA,
    binding:{songId:'dear-papa-song-thirsty-in-the-dark',masterSha256:MASTER,baseRevision:packet.sourceRevision,scoreFingerprint:packet.score.fingerprint},
    ending:{releaseStart:257.5,fadeStart:266.5,fadeEnd:271.670646},
    cues:cues.map((cue,i)=>({cueId:cue.id,settings:{motif:ringSections.has(i)?'open-ring':'inherit',...(development[i]?{development:development[i]}:{}),plume:{reach:sections[i][0],smoke:sections[i][1]},formation:{participation:sections[i][2]},camera:{distanceScale:sections[i][3]}}}))};
  return buildCampfireDirection(packet,extension);
}
