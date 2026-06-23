import { useEffect, useRef, useState } from "react";
import { Camera, Pause, Play, RefreshCw, Star, UserRound } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export default function ThreeAvatarViewer({ asset, onReady, onDefaultClipChange }) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const playingRef = useRef(true);
  const onReadyRef = useRef(onReady);
  const [status, setStatus] = useState("Standby");
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState("all");
  const [cameraMode, setCameraMode] = useState("profile");
  const [playing, setPlaying] = useState(true);
  const [stats, setStats] = useState({ vertices: 0, objects: 0, animations: 0 });
  const currentDefaultClip = defaultClipForAsset(asset);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const actions = viewerRef.current?.actions || [];
    applyClipSelection(actions, selectedClip);
  }, [selectedClip]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const object = viewer?.modelRoot || viewer?.placeholderRoot;
    if (!viewer || !object) return;
    fitCamera(object, viewer.camera, viewer.controls, cameraMode);
  }, [asset?.id, cameraMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;
    let animationFrame = 0;
    let modelRoot = null;
    let placeholderRoot = null;
    let mixer = null;
    let actions = [];

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x02040a, 9, 26);

    const camera = new THREE.PerspectiveCamera(cameraMode === "profile" ? 30 : 42, 1, 0.01, 100);
    camera.position.set(2.6, 1.75, 4.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = cameraMode === "cinematic" || !asset;
    controls.autoRotateSpeed = 0.7;
    controls.target.set(0, 1, 0);

    const ambient = new THREE.HemisphereLight(0x9ff7ff, 0x13052a, 2.4);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 7, 5);
    scene.add(key);

    const rim = new THREE.PointLight(0xff00ff, 20, 12);
    rim.position.set(-3.2, 2.1, 2.5);
    scene.add(rim);

    const grid = new THREE.GridHelper(5.5, 18, 0x00f3ff, 0x243654);
    grid.material.transparent = true;
    grid.material.opacity = 0.24;
    scene.add(grid);

    const clock = new THREE.Clock();
    viewerRef.current = { mixer, actions, renderer, scene, camera, controls, modelRoot, placeholderRoot };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== width || canvas.height !== height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }

    function addPlaceholder() {
      placeholderRoot = new THREE.Group();
      placeholderRoot.name = "HapaAvatarPlaceholder";

      const neon = new THREE.MeshStandardMaterial({
        color: 0x0a1728,
        emissive: 0x00f3ff,
        emissiveIntensity: 0.28,
        metalness: 0.45,
        roughness: 0.36
      });
      const magenta = new THREE.MeshStandardMaterial({
        color: 0x251230,
        emissive: 0xff00ff,
        emissiveIntensity: 0.22,
        metalness: 0.4,
        roughness: 0.42
      });

      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 8, 16), neon);
      body.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), magenta);
      head.position.y = 1.92;
      const gaze = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 24), magenta);
      gaze.rotation.x = Math.PI / 2;
      gaze.position.set(0, 1.92, -0.38);
      const axis = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.01, 8, 48), neon);
      axis.position.y = 1.1;
      axis.rotation.x = Math.PI / 2;

      placeholderRoot.add(body, head, gaze, axis);
      scene.add(placeholderRoot);
      fitCamera(placeholderRoot, camera, controls, cameraMode);
      viewerRef.current = { mixer, actions, renderer, scene, camera, controls, modelRoot, placeholderRoot };
      const nextStats = { vertices: countVertices(placeholderRoot), objects: 4, animations: 0 };
      setStats(nextStats);
      setClips([]);
      setSelectedClip("all");
      setStatus(asset ? "Model load failed" : "Waiting for GLB/GLTF");
    }

    async function loadModel() {
      if (!asset?.uri) {
        addPlaceholder();
        return;
      }

      setStatus("Loading 3D avatar");
      setClips([]);
      setSelectedClip(defaultClipForAsset(asset));

      try {
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(asset.uri);
        if (disposed) return;
        modelRoot = gltf.scene;
        modelRoot.name = asset.name || "HapaAvatarModel";
        scene.add(modelRoot);

        fitCamera(modelRoot, camera, controls, cameraMode);

        const nextClips = gltf.animations.map((clip, index) => ({
          name: clip.name || `Clip ${index + 1}`,
          duration: Number.isFinite(clip.duration) ? clip.duration : 0
        }));
        const initialClip = resolvedClipForModel(asset, nextClips);

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(modelRoot);
          actions = gltf.animations.map((clip, index) => {
            clip.name = nextClips[index]?.name || clip.name || `Clip ${index + 1}`;
            return mixer.clipAction(clip);
          });
          applyClipSelection(actions, initialClip);
        }
        viewerRef.current = { mixer, actions, renderer, scene, camera, controls, modelRoot, placeholderRoot };

        const nextStats = {
          vertices: countVertices(modelRoot),
          objects: countObjects(modelRoot),
          animations: nextClips.length,
          clips: nextClips,
          bounds: boundsFor(modelRoot)
        };
        setClips(nextClips);
        setSelectedClip(initialClip);
        setStats(nextStats);
        setStatus("3D avatar online");
        onReadyRef.current?.(nextStats);
      } catch (error) {
        if (disposed) return;
        console.warn("Hapa 3D avatar load failed", error);
        addPlaceholder();
      }
    }

    function animate() {
      if (disposed) return;
      resize();
      const delta = clock.getDelta();
      if (playingRef.current && mixer) mixer.update(delta);
      if (placeholderRoot && playingRef.current) placeholderRoot.rotation.y += delta * 0.4;
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    loadModel();
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();
      disposeObject(modelRoot);
      disposeObject(placeholderRoot);
      renderer.dispose();
    };
  }, [asset?.id, asset?.uri, asset?.name]);

  function restart() {
    const viewer = viewerRef.current;
    viewer?.mixer?.setTime(0);
    applyClipSelection(viewer?.actions || [], selectedClip);
    setPlaying(true);
  }

  return (
    <div className="three-avatar-viewer" data-state={asset ? "asset" : "empty"} data-camera-mode={cameraMode}>
      <div className="three-stage">
        <canvas ref={canvasRef} aria-label={asset ? `${asset.name} 3D avatar preview` : "3D avatar placeholder preview"} />
        <div className="three-camera-readout">
          <Camera size={13} />
          <span>{cameraMode === "cinematic" ? "Cinematic" : "Profile"}</span>
        </div>
        <div className="three-stage-hud">
          <span>{status}</span>
          <strong>{asset?.name || "No 3D avatar uploaded"}</strong>
        </div>
      </div>
      <div className="three-controls">
        <button className="hapa-btn" data-intent="primary" onClick={() => setPlaying((value) => !value)}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button className="hapa-btn" data-intent="warning" onClick={restart}>
          <RefreshCw size={14} />
          Restart
        </button>
        <button
          className="hapa-btn"
          data-intent="primary"
          data-state={cameraMode === "cinematic" ? "active" : "idle"}
          aria-pressed={cameraMode === "cinematic"}
          onClick={() => setCameraMode((mode) => mode === "cinematic" ? "profile" : "cinematic")}
        >
          {cameraMode === "cinematic" ? <UserRound size={14} /> : <Camera size={14} />}
          {cameraMode === "cinematic" ? "Profile" : "Cinematic"}
        </button>
        <label>
          <span>Clip</span>
          <select value={selectedClip} onChange={(event) => setSelectedClip(event.target.value)} disabled={!clips.length}>
            <option value="all">All clips</option>
            {clips.map((clip) => (
              <option key={`${clip.name}-${clip.duration}`} value={clip.name}>
                {clip.name} · {clip.duration.toFixed(2)}s
              </option>
            ))}
          </select>
        </label>
        <button
          className="hapa-btn default-clip-button"
          data-intent="success"
          data-state={currentDefaultClip === selectedClip && selectedClip !== "all" ? "active" : "idle"}
          disabled={!onDefaultClipChange || !clips.length || selectedClip === "all" || currentDefaultClip === selectedClip}
          onClick={() => onDefaultClipChange?.(selectedClip)}
        >
          <Star size={14} />
          {currentDefaultClip === selectedClip && selectedClip !== "all" ? "Default" : "Set Default"}
        </button>
      </div>
      <div className="three-default-readout">
        <Star size={12} />
        <span>Default animation</span>
        <strong>{currentDefaultClip === "all" ? "Not set" : currentDefaultClip}</strong>
      </div>
      <div className="three-stats">
        <span>{stats.animations} clips</span>
        <span>{stats.objects} objects</span>
        <span>{stats.vertices.toLocaleString()} vertices</span>
      </div>
    </div>
  );
}

function fitCamera(object, camera, controls, mode = "profile") {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 1);
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  camera.fov = mode === "profile" ? 30 : 42;
  const fovRadians = (camera.fov * Math.PI) / 180;
  const profileDistance = (height * 1.2) / (2 * Math.tan(fovRadians / 2));
  const cinematicDistance = Math.max(profileDistance * 1.75, maxSize / (2 * Math.tan(fovRadians / 2)));
  const distance = mode === "profile" ? profileDistance : cinematicDistance;
  if (mode === "profile") {
    camera.position.set(center.x, center.y + height * 0.04, center.z + distance * 1.08);
    controls.target.set(center.x, center.y + height * 0.06, center.z);
  } else {
    camera.position.copy(center).add(new THREE.Vector3(distance * 0.64, distance * 0.24, distance * 1.34));
    controls.target.copy(center).add(new THREE.Vector3(0, height * 0.05, 0));
  }
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(100, distance * 16);
  camera.updateProjectionMatrix();
  controls.autoRotate = mode === "cinematic";
  controls.autoRotateSpeed = mode === "cinematic" ? 0.45 : 0;
  controls.update();
}

function defaultClipForAsset(asset) {
  return asset?.state?.defaultAnimation ||
    asset?.metadata?.model?.defaultAnimation ||
    asset?.metadata?.model?.defaultClip?.name ||
    "all";
}

function resolvedClipForModel(asset, clips) {
  const candidate = defaultClipForAsset(asset);
  if (!candidate || candidate === "all") return "all";
  return clips.some((clip) => clip.name === candidate) ? candidate : "all";
}

function applyClipSelection(actions, selectedClip) {
  for (const action of actions || []) {
    const enabled = selectedClip === "all" || action.getClip().name === selectedClip;
    action.enabled = enabled;
    if (enabled) {
      action.reset().play();
    } else {
      action.stop();
    }
  }
}

function countVertices(object) {
  let count = 0;
  object?.traverse((child) => {
    const position = child.geometry?.attributes?.position;
    if (position) count += position.count;
  });
  return count;
}

function countObjects(object) {
  let count = 0;
  object?.traverse(() => {
    count += 1;
  });
  return count;
}

function boundsFor(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  return {
    width: Number(size.x.toFixed(3)),
    height: Number(size.y.toFixed(3)),
    depth: Number(size.z.toFixed(3))
  };
}

function disposeObject(object) {
  object?.traverse((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose?.();
    }
  });
}
