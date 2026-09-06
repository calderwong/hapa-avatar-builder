import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createEchoPlaybackEngine } from "../src/domain/echo-playback-engine.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const project = {
  song_id: "engine-proof",
  duration: 12,
  timeline: [
    { media_id: "a", media_uri: "/a.mp4", start_sec: 0, end_sec: 4 },
    { media_id: "none", media_uri: "", start_sec: 4, end_sec: 8 },
    { media_id: "missing", media_uri: "", start_sec: 8, end_sec: 12 }
  ],
  visualizer_timeline: [
    { visualizer_id: "ivf:a", start_sec: 0, end_sec: 6 },
    { visualizer_id: "ivf:b", start_sec: 6, end_sec: 12 }
  ],
  timed_lyrics: [
    { start: 0, end: 5, text: "Dear Papa", words: [{ start: 0, end: 2, text: "Dear" }, { start: 2, end: 5, text: "Papa" }] }
  ]
};

test("shared engine emits change-driven snapshots for playback, IVF, lyrics, seek, and pause", async () => {
  const events = [];
  const engine = createEchoPlaybackEngine({ adapter: { commitShot: (shot) => events.push(`shot:${shot.media_id}`) } });
  let emissions = 0;
  engine.subscribe(() => { emissions += 1; });
  engine.setProject(project);
  engine.play();
  engine.tick(1);
  const afterFirstTick = emissions;
  engine.tick(1.1);
  engine.tick(1.2);
  assert.equal(emissions, afterFirstTick, "frame-rate clock ticks must not publish unchanged state");
  engine.tick(2.1);
  assert.equal(engine.getSnapshot().lyricWord.text, "Papa");
  engine.tick(4.1);
  assert.equal(engine.getSnapshot().pureIvf, true);
  engine.seek(0.5);
  assert.equal(engine.getSnapshot().shot.media_id, "a");
  engine.pause();
  assert.equal(engine.getSnapshot().playing, false);
  assert.deepEqual(events, ["shot:a", "shot:none", "shot:a"]);
});

test("late decoder completion cannot replace the newer visible shot", async () => {
  const pending = [];
  const commits = [];
  const engine = createEchoPlaybackEngine({
    adapter: {
      prepareShot: (shot) => new Promise((resolve) => pending.push({ id: shot.media_id, resolve })),
      commitShot: (shot) => commits.push(shot.media_id)
    }
  });
  engine.setProject({ ...project, timeline: [
    { media_id: "a", media_uri: "/a.mp4", start_sec: 0, end_sec: 4 },
    { media_id: "b", media_uri: "/b.mp4", start_sec: 4, end_sec: 8 }
  ] });
  engine.tick(4.2);
  pending.find((entry) => entry.id === "b").resolve(true);
  await Promise.resolve();
  pending.find((entry) => entry.id === "a").resolve(true);
  await Promise.resolve();
  assert.deepEqual(commits, ["b"]);
  assert.equal(engine.getSnapshot().shot.media_id, "b");
});

test("missing media remains explicit and teardown is exactly once", () => {
  let disposed = 0;
  const engine = createEchoPlaybackEngine({ adapter: { dispose: () => { disposed += 1; } } });
  engine.setProject(project);
  engine.tick(9);
  assert.equal(engine.getSnapshot().missingMedia, true);
  assert.equal(engine.getSnapshot().reason, "missing-media");
  engine.destroy();
  engine.destroy();
  assert.equal(disposed, 1);
});

test("Echo and Tarot renderer adapters both use the shared engine", () => {
  const echoSource = fs.readFileSync(path.join(root, "src/components/HapaEchosView.jsx"), "utf8");
  const tarotSource = fs.readFileSync(path.join(root, "src/components/TarotDraw3DView.jsx"), "utf8");
  assert.match(echoSource, /createEchoPlaybackEngine/);
  assert.match(echoSource, /renderer: "echo-react-ab"/);
  assert.match(tarotSource, /createEchoPlaybackEngine/);
  assert.match(tarotSource, /renderer: "tarot-three-preview"/);
});


test('same-song A/B/C replacement publishes only the preserved authoritative clock and play state',()=>{
 for(const playing of [false,true]){
  const emissions=[],engine=createEchoPlaybackEngine({adapter:{onSnapshot:s=>emissions.push(s)}});
  engine.setProject(project);engine.tick(4.1,{playing});
  for(const label of ['A','B','C','source']){
   emissions.length=0;
   const candidate={...project,timeline:project.timeline.map((shot,index)=>({...shot,media_id:label+'-'+index,media_uri:'/candidate-'+label+'.mp4'}))};
   engine.setProject(candidate,{preserveClock:true,atSeconds:4.7});
   assert.ok(emissions.length>=2);
   assert.ok(emissions.every(s=>s.clockTime===4.7&&s.playing===playing));
   assert.equal(engine.getSnapshot().shot.media_id,label+'-1');
   assert.equal(engine.getSnapshot().lyricLine.text,'Dear Papa');
  }
  engine.setProject({...project,song_id:'other'},{atSeconds:4.7});
  assert.equal(engine.getSnapshot().clockTime,0,'new song still starts at zero');
  engine.destroy();
 }
});

test('recut entry cancels old pending media without resetting the same-song clock',async()=>{
 const pending=[],commits=[],engine=createEchoPlaybackEngine({adapter:{prepareShot:shot=>new Promise(resolve=>pending.push({shot,resolve})),commitShot:shot=>commits.push(shot.media_id)}});
 const videos={...project,timeline:project.timeline.map((s,i)=>({...s,media_id:'video-'+i,media_uri:'/video-'+i+'.mp4'}))};
 engine.setProject(videos);engine.seek(4.5);
 engine.setProject({...videos,timeline:videos.timeline.map(s=>({...s,media_id:'next-'+s.media_id}))},{preserveClock:true,atSeconds:4.6});
 for(const item of pending.filter(p=>!p.shot.media_id.startsWith('next-')))item.resolve(true);
 await Promise.resolve();assert.deepEqual(commits,[]);
 pending.find(p=>p.shot.media_id==='next-video-1').resolve(true);await Promise.resolve();
 assert.deepEqual(commits,['next-video-1']);assert.equal(engine.getSnapshot().clockTime,4.6);
 engine.destroy();
});
