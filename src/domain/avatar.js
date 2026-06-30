export const CONTRACT_VERSION = "hapa.avatar-card.v1";
export const AVATAR_MIND_VERSION = "hapa.avatar-mind.v1";
export const AVATAR_MODEL_REQUIREMENT_ID = "avatar_3d_model";
export const HEALING_QUEUE_VERSION = "hapa.avatar-healing-queue.v1";
export const HEALING_PROMPT_VERSION = "hapa.avatar-healing-prompt.v1";
export const BACKGROUNDLESS_VIDEO_VERSION = "hapa.backgroundless-video-state.v1";

const BACKGROUNDLESS_VIDEO_STATUSES = ["missing", "queued", "processing", "ready", "failed", "skipped"];
const BACKGROUNDLESS_VIDEO_READY_STATUSES = new Set(["ready", "complete", "completed", "done"]);

export const MIND_FACT_CLASSIFICATIONS = [
  "hard_canon",
  "soft_canon",
  "rumor",
  "perspective",
  "generated",
  "disputed",
  "tombstone",
  "relationship_delta",
  "memory_delta",
  "resource_delta",
  "mystery_delta",
  "emotional_delta"
];

export const MIND_CONFIDENCE_LEVELS = ["hard", "soft", "perspective", "generated", "disputed"];
export const MIND_VISIBILITY_LEVELS = ["private", "shared", "public"];
export const RELATIONSHIP_METRICS = ["trust", "tension", "debt", "fear", "loyalty"];
export const CONTEXT_KINDS = ["scene", "place", "event", "episode", "volume", "saga", "epic", "mystery", "resource", "promise", "threat", "callback", "canon"];

export const AVATAR_MODEL_REQUIREMENT = {
  id: AVATAR_MODEL_REQUIREMENT_ID,
  label: "3D Avatar Rig",
  shortLabel: "3D Rig",
  accent: "cyan",
  accepts: ["model"],
  description: "Animated avatar model files for rig, motion, and 3D reference workflows.",
  defaultTags: ["3d-avatar", "model", "rig", "animation", "reference"]
};

export const DIRECTION_CHANNELS = [
  { id: "gaze", label: "Gaze", verb: "looking" },
  { id: "body", label: "Body", verb: "body" },
  { id: "head", label: "Head", verb: "head" }
];

export const DIRECTION_OPTIONS = [
  { id: "front", label: "Front", shortLabel: "F", x: 50, y: 9, angle: 0 },
  { id: "three-quarter-right", label: "Three-quarter right", shortLabel: "3R", x: 78, y: 21, angle: 45 },
  { id: "right", label: "Right", shortLabel: "R", x: 91, y: 50, angle: 90 },
  { id: "back-right", label: "Back right", shortLabel: "BR", x: 78, y: 79, angle: 135 },
  { id: "back", label: "Back", shortLabel: "B", x: 50, y: 91, angle: 180 },
  { id: "back-left", label: "Back left", shortLabel: "BL", x: 22, y: 79, angle: 225 },
  { id: "left", label: "Left", shortLabel: "L", x: 9, y: 50, angle: 270 },
  { id: "three-quarter-left", label: "Three-quarter left", shortLabel: "3L", x: 22, y: 21, angle: 315 }
];

export const VIDEO_FRAME_MARKERS = [
  { id: "first", label: "First frame", role: "start-state" },
  { id: "mid", label: "Mid frame", role: "motion-state" },
  { id: "last", label: "Last frame", role: "end-state" }
];

export const VIDEO_LINK_TYPES = [
  "continuity",
  "motion-continues",
  "match-cut",
  "pose-transition",
  "camera-transition",
  "emotion-shift",
  "reference-only"
];

export const VIDEO_LOOP_TAG_GROUPS = [
  {
    id: "loop_motion",
    label: "Motion",
    accent: "orange",
    tags: [
      { id: "idle-loop", label: "Idle loop", icon: "IL" },
      { id: "walk-cycle", label: "Walk cycle", icon: "WK" },
      { id: "turn-cycle", label: "Turn cycle", icon: "TN" },
      { id: "gesture-loop", label: "Gesture loop", icon: "GE" },
      { id: "combat-loop", label: "Combat loop", icon: "CB" },
      { id: "camera-push", label: "Camera push", icon: "CP" },
      { id: "camera-pan", label: "Camera pan", icon: "PN" }
    ]
  },
  {
    id: "loop_route",
    label: "Route",
    accent: "cyan",
    tags: [
      { id: "seed-frame", label: "Seed frame", icon: "SF" },
      { id: "convergence-point", label: "Convergence point", icon: "CV" },
      { id: "bridge-transition", label: "Bridge transition", icon: "BR" },
      { id: "loopable", label: "Loopable", icon: "LP" },
      { id: "dead-end", label: "Dead end", icon: "DE" },
      { id: "candidate-match", label: "Candidate match", icon: "CM" },
      { id: "validated-route", label: "Validated route", icon: "OK" },
      { id: "reverse-loop", label: "Reverse loop", icon: "RV" },
      { id: "reverse-loop-validated", label: "Reverse validated", icon: "R+" }
    ]
  },
  {
    id: "loop_quality",
    label: "Quality",
    accent: "green",
    tags: [
      { id: "smooth", label: "Smooth", icon: "SM" },
      { id: "stable-identity", label: "Stable identity", icon: "ID" },
      { id: "flicker-risk", label: "Flicker risk", icon: "FR" },
      { id: "needs-trim", label: "Needs trim", icon: "NT" },
      { id: "high-confidence", label: "High confidence", icon: "HC" }
    ]
  }
];

export const VIDEO_LOOP_TAGS = unique(VIDEO_LOOP_TAG_GROUPS.flatMap((group) => group.tags.map((tag) => tag.id)));

export const ASSET_NODE_TYPES = [
  { id: "route-note", label: "Route note" },
  { id: "story-beat", label: "Story beat" },
  { id: "agent-instruction", label: "Agent instruction" },
  { id: "continuity-warning", label: "Continuity warning" },
  { id: "prompt-hook", label: "Prompt hook" }
];

export const MEDIA_REQUIREMENTS = [
  {
    id: "character_dossier",
    label: "Character Dossier",
    shortLabel: "Dossier",
    accent: "cyan",
    requiredPerName: 1,
    accepts: ["image", "pdf", "doc"],
    description: "Look, identity, story posture, silhouette, motifs, and visual rules.",
    defaultTags: ["front", "identity", "silhouette", "canon"]
  },
  {
    id: "kit_sheet",
    label: "Kit Sheet",
    shortLabel: "Kit",
    accent: "gold",
    requiredPerName: 1,
    accepts: ["image", "pdf", "doc"],
    description: "Items, tools, weapons, wardrobe, materials, and skill affordances.",
    defaultTags: ["kit", "items", "skills", "canon"]
  },
  {
    id: "kit_poses",
    label: "Kit Poses",
    shortLabel: "Poses",
    accent: "fuchsia",
    required: 4,
    accepts: ["image", "video"],
    description: "Full-body poses showing how the avatar carries or uses the kit.",
    defaultTags: ["front", "side", "action", "ready"]
  },
  {
    id: "kit_items",
    label: "Kit Items",
    shortLabel: "Items",
    accent: "gold",
    required: 9,
    accepts: ["image", "model", "doc"],
    description: "Individual kit assets for agents to reference, reuse, or regenerate.",
    defaultTags: ["weapon", "comms", "bag", "gloves", "boots", "battery", "sensor", "prop", "tool"]
  },
  {
    id: "closeup_emotions",
    label: "Close-up Emotion Shots",
    shortLabel: "Emotions",
    accent: "green",
    required: 6,
    accepts: ["image", "video"],
    description: "Face references for expression, continuity, and acting direction.",
    defaultTags: ["neutral", "happy", "sad", "angry", "concerned", "focused"]
  },
  {
    id: "closeup_backgrounds",
    label: "Close-up with Backgrounds",
    shortLabel: "CU BG",
    accent: "cyan",
    required: 4,
    accepts: ["image", "video"],
    description: "Close-up references embedded in scene lighting and environments.",
    defaultTags: ["city", "vehicle", "night", "interior"]
  },
  {
    id: "fullbody_backgroundless",
    label: "Backgroundless Full Body Shots",
    shortLabel: "Full Body",
    accent: "fuchsia",
    required: 9,
    accepts: ["image", "model"],
    description: "Clean base body references for turns, rigging, masking, and generation.",
    defaultTags: ["front", "three-quarter-left", "profile-left", "profile-right", "back", "t-pose", "relaxed", "action", "scale"]
  },
  {
    id: "backgroundless_two_thirds",
    label: "Backgroundless 2/3rds Shots",
    shortLabel: "2/3rds",
    accent: "cyan",
    required: 3,
    accepts: ["image"],
    description: "High-detail two-thirds body references with no background for character continuity and scene reference.",
    defaultTags: ["two-thirds", "backgroundless", "high-def"]
  },
  {
    id: "fullbody_concept_art",
    label: "Full Body Concept Art Shots",
    shortLabel: "Concept",
    accent: "orange",
    required: 4,
    accepts: ["image", "video"],
    description: "Cinematic/environment full-body shots for mood, scene, and campaign use.",
    defaultTags: ["cinematic", "battlefield", "urban", "vehicle"]
  }
];

export const TAG_GROUPS = [
  {
    id: "emotion",
    label: "Emotions",
    shortLabel: "EMO",
    icon: "🙂",
    accent: "green",
    description: "Face, mood, and acting-state tags for expression continuity.",
    requiredByRequirement: { closeup_emotions: 1 },
    tags: [
      { id: "neutral", label: "Neutral", icon: "😐" },
      { id: "happy", label: "Happy", icon: "😄" },
      { id: "sad", label: "Sad", icon: "😢" },
      { id: "angry", label: "Angry", icon: "😠" },
      { id: "focused", label: "Focused", icon: "🎯" },
      { id: "concerned", label: "Concerned", icon: "😟" },
      { id: "surprised", label: "Surprised", icon: "😮" },
      { id: "calm", label: "Calm", icon: "😌" },
      { id: "determined", label: "Determined", icon: "🔥" },
      { id: "smirk", label: "Smirk", icon: "😏" },
      { id: "tired", label: "Tired", icon: "😴" },
      { id: "scared", label: "Scared", icon: "😨" }
    ]
  },
  {
    id: "direction",
    label: "Directions",
    shortLabel: "DIR",
    icon: "DIR",
    accent: "cyan",
    description: "Gaze, head, and body orientation for continuity-aware agents.",
    requiredByRequirement: {
      kit_poses: 3,
      closeup_emotions: 2,
      closeup_backgrounds: 2,
      fullbody_backgroundless: 3,
      backgroundless_two_thirds: 3,
      fullbody_concept_art: 3
    },
    tags: [
      { id: "front", label: "Front", icon: "F" },
      { id: "left", label: "Left", icon: "L" },
      { id: "right", label: "Right", icon: "R" },
      { id: "back", label: "Back", icon: "B" },
      { id: "three-quarter-left", label: "Three-quarter left", icon: "3L" },
      { id: "three-quarter-right", label: "Three-quarter right", icon: "3R" },
      { id: "back-left", label: "Back left", icon: "BL" },
      { id: "back-right", label: "Back right", icon: "BR" },
      { id: "profile", label: "Profile", icon: "PF" },
      { id: "profile-left", label: "Profile left", icon: "PL" },
      { id: "profile-right", label: "Profile right", icon: "PR" },
      { id: "side", label: "Side", icon: "SD" },
      { id: "t-pose", label: "T-pose", icon: "T" }
    ]
  },
  {
    id: "character",
    label: "Character",
    shortLabel: "CHAR",
    icon: "ID",
    accent: "magenta",
    description: "Identity, body framing, and canonical character-state tags.",
    requiredByRequirement: {
      character_dossier: 1,
      kit_poses: 1,
      closeup_emotions: 1,
      closeup_backgrounds: 1,
      fullbody_backgroundless: 1,
      backgroundless_two_thirds: 1,
      fullbody_concept_art: 1
    },
    tags: [
      { id: "identity", label: "Identity", icon: "ID" },
      { id: "silhouette", label: "Silhouette", icon: "SL" },
      { id: "dossier", label: "Dossier", icon: "DO" },
      { id: "close-up", label: "Close-up", icon: "CU" },
      { id: "full-body", label: "Full body", icon: "FB" },
      { id: "two-thirds", label: "2/3rds", icon: "2/3" },
      { id: "base-reference", label: "Base reference", icon: "BR" },
      { id: "avatar-card", label: "Avatar card", icon: "AC" },
      { id: "canon", label: "Canon", icon: "CA" },
      { id: "reference", label: "Reference", icon: "RF" }
    ]
  },
  {
    id: "style",
    label: "Style",
    shortLabel: "STYLE",
    icon: "FX",
    accent: "violet",
    description: "Rendering, fidelity, and visual treatment tags.",
    required: 1,
    tags: [
      { id: "high-def", label: "High-def", icon: "HD" },
      { id: "cinematic", label: "Cinematic", icon: "CI" },
      { id: "concept-art", label: "Concept art", icon: "CA" },
      { id: "realistic", label: "Realistic", icon: "RL" },
      { id: "neonblade", label: "NeonBlade", icon: "NB" },
      { id: "studio", label: "Studio", icon: "ST" },
      { id: "clean", label: "Clean", icon: "CL" },
      { id: "raw", label: "Raw", icon: "RW" }
    ]
  },
  {
    id: "lineage",
    label: "Lineage",
    shortLabel: "LINE",
    icon: "LN",
    accent: "rose",
    description: "Source, trust, and generation-history tags for provenance.",
    required: 1,
    tags: [
      { id: "source", label: "Source", icon: "SO" },
      { id: "generated", label: "Generated", icon: "GE" },
      { id: "human-approved", label: "Human approved", icon: "OK" },
      { id: "needs-heal", label: "Needs heal", icon: "!" },
      { id: "derived", label: "Derived", icon: "DV" },
      { id: "variant", label: "Variant", icon: "VA" },
      { id: "canonical", label: "Canonical", icon: "CN" },
      { id: "draft", label: "Draft", icon: "DR" }
    ]
  },
  {
    id: "background",
    label: "Background",
    shortLabel: "BG",
    icon: "BG",
    accent: "blue",
    description: "Matte, transparency, and background treatment tags.",
    requiredByType: { image: 1, video: 1 },
    tags: [
      { id: "backgroundless", label: "Backgroundless", icon: "NO" },
      { id: "transparent", label: "Transparent", icon: "TR" },
      { id: "clean-background", label: "Clean background", icon: "CB" },
      { id: "with-background", label: "With background", icon: "WB" },
      { id: "background", label: "Background", icon: "BG" },
      { id: "plate", label: "Plate", icon: "PL" },
      { id: "environment", label: "Environment", icon: "EN" }
    ]
  },
  {
    id: "setting",
    label: "Setting",
    shortLabel: "SET",
    icon: "MAP",
    accent: "gold",
    description: "Scene, place, and lighting-context tags.",
    requiredByRequirement: { closeup_backgrounds: 1, fullbody_concept_art: 1 },
    tags: [
      { id: "city", label: "City", icon: "CT" },
      { id: "urban", label: "Urban", icon: "UR" },
      { id: "vehicle", label: "Vehicle", icon: "VE" },
      { id: "night", label: "Night", icon: "NI" },
      { id: "interior", label: "Interior", icon: "IN" },
      { id: "exterior", label: "Exterior", icon: "EX" },
      { id: "battlefield", label: "Battlefield", icon: "BF" },
      { id: "safehouse", label: "Safehouse", icon: "SH" },
      { id: "rain", label: "Rain", icon: "RA" },
      { id: "neon", label: "Neon", icon: "NE" }
    ]
  },
  {
    id: "kit",
    label: "Kit",
    shortLabel: "KIT",
    icon: "KIT",
    accent: "gold",
    description: "Gear, items, tools, and skill affordances.",
    requiredByRequirement: { kit_sheet: 1, kit_poses: 1, kit_items: 1 },
    tags: [
      { id: "kit", label: "Kit", icon: "KT" },
      { id: "items", label: "Items", icon: "IT" },
      { id: "skills", label: "Skills", icon: "SK" },
      { id: "skill", label: "Skill", icon: "SK" },
      { id: "weapon", label: "Weapon", icon: "WP" },
      { id: "prop", label: "Prop", icon: "PR" },
      { id: "tool", label: "Tool", icon: "TL" },
      { id: "comms", label: "Comms", icon: "CO" },
      { id: "bag", label: "Bag", icon: "BA" },
      { id: "boots", label: "Boots", icon: "BO" },
      { id: "gloves", label: "Gloves", icon: "GL" },
      { id: "battery", label: "Battery", icon: "BT" },
      { id: "sensor", label: "Sensor", icon: "SN" }
    ]
  },
  {
    id: "motion",
    label: "Motion",
    shortLabel: "MOVE",
    icon: "VID",
    accent: "orange",
    description: "Video branch, timing, transition, and action-state tags.",
    requiredByType: { video: 2 },
    tags: [
      { id: "video", label: "Video", icon: "VD" },
      { id: "branch", label: "Branch", icon: "BR" },
      { id: "motion", label: "Motion", icon: "MO" },
      { id: "loop", label: "Loop", icon: "LP" },
      { id: "dialogue", label: "Dialogue", icon: "DL" },
      { id: "walk", label: "Walk", icon: "WK" },
      { id: "run", label: "Run", icon: "RN" },
      { id: "fight", label: "Fight", icon: "FT" },
      { id: "action", label: "Action", icon: "AC" },
      { id: "ready", label: "Ready", icon: "RD" },
      { id: "camera-move", label: "Camera move", icon: "CM" },
      { id: "transition", label: "Transition", icon: "TR" },
      { id: "start-frame", label: "Start frame", icon: "SF" },
      { id: "end-frame", label: "End frame", icon: "EF" },
      { id: "keyframe", label: "Keyframe", icon: "KF" },
      { id: "continuity", label: "Continuity", icon: "CN" },
      { id: "match-cut", label: "Match cut", icon: "MC" },
      { id: "motion-continues", label: "Motion continues", icon: "MC" },
      { id: "pose-transition", label: "Pose transition", icon: "PT" },
      { id: "camera-transition", label: "Camera transition", icon: "CT" },
      { id: "emotion-shift", label: "Emotion shift", icon: "ES" },
      { id: "reference-only", label: "Reference only", icon: "RO" }
    ]
  },
  {
    id: "video_loop",
    label: "Video Loops",
    shortLabel: "LOOP",
    icon: "LOOP",
    accent: "cyan",
    description: "Seed-frame routes, convergence states, loop quality, and route-map affordances.",
    requiredByType: { video: 1 },
    tags: VIDEO_LOOP_TAG_GROUPS.flatMap((group) => group.tags)
  },
  {
    id: "model",
    label: "Model",
    shortLabel: "3D",
    icon: "3D",
    accent: "cyan",
    description: "3D avatar, rig, and animation metadata tags.",
    requiredByType: { model: 3 },
    tags: [
      { id: "3d-avatar", label: "3D avatar", icon: "3D" },
      { id: "model", label: "Model", icon: "MD" },
      { id: "rig", label: "Rig", icon: "RG" },
      { id: "animation", label: "Animation", icon: "AN" },
      { id: "retarget", label: "Retarget", icon: "RT" },
      { id: "glb", label: "GLB", icon: "GLB" },
      { id: "gltf", label: "glTF", icon: "GLT" },
      { id: "fbx", label: "FBX", icon: "FBX" }
    ]
  }
];

export const TAG_LIBRARY = unique(TAG_GROUPS.flatMap((group) => group.tags.map((tag) => tag.id)));

const TAG_DEFINITION_INDEX = new Map(
  TAG_GROUPS.flatMap((group) =>
    group.tags.map((tag) => [
      tag.id,
      {
        ...tag,
        groupId: group.id,
        groupLabel: group.label,
        groupIcon: group.icon,
        accent: group.accent
      }
    ])
  )
);

export const BUILD_BOARD = [
  {
    id: "lane-intake",
    title: "Intake",
    accent: "cyan",
    cards: [
      {
        id: "card-reference-board",
        title: "Parse Red/Reaper content scaffold",
        status: "done",
        owner: "Codex",
        body: "Convert the Lucid/Screenshot scaffold into required media categories and counts."
      },
      {
        id: "card-neonblade-style",
        title: "Apply neonblade+ operator style",
        status: "done",
        owner: "Codex",
        body: "Use Hapa deep console surfaces, luminous borders, scanlines, compact telemetry, and multi-accent status."
      }
    ]
  },
  {
    id: "lane-contract",
    title: "Contract",
    accent: "gold",
    cards: [
      {
        id: "card-avatar-card",
        title: "Avatar Card schema",
        status: "done",
        owner: "Codex",
        body: "Shared manifest for humans, UI, API, CLI, and agents."
      },
      {
        id: "card-completeness",
        title: "Completeness audit and XP",
        status: "done",
        owner: "Codex",
        body: "A deterministic score, missing slot list, and healing queue."
      }
    ]
  },
  {
    id: "lane-build",
    title: "Build",
    accent: "fuchsia",
    cards: [
      {
        id: "card-ui",
        title: "Drag/drop builder UI",
        status: "done",
        owner: "Codex",
        body: "Bucket sorting, tag chips, media inspector, and attach card panel."
      },
      {
        id: "card-api-cli",
        title: "API + CLI",
        status: "done",
        owner: "Codex",
        body: "List, audit, attach, heal-plan, export-card, and scaffold commands."
      },
      {
        id: "card-desktop",
        title: "Desktop shell and launcher",
        status: "done",
        owner: "Codex",
        body: "Electron shell plus macOS command launcher for one-click local demo."
      }
    ]
  },
  {
    id: "lane-verify",
    title: "Verify",
    accent: "green",
    cards: [
      {
        id: "card-tests",
        title: "Domain and CLI tests",
        status: "done",
        owner: "Codex",
        body: "Tests cover scaffold slot counts, audits, attach packs, healing plans, and CLI JSON."
      },
      {
        id: "card-demo",
        title: "Demo server smoke",
        status: "done",
        owner: "Codex",
        body: "Local server and Electron visual smoke passed with screenshot evidence."
      }
    ]
  },
  {
    id: "lane-video-support",
    title: "Video Branches",
    accent: "orange",
    cards: [
      {
        id: "card-video-state-model",
        title: "Image state to video branch model",
        status: "done",
        owner: "Codex",
        body: "Represent still images as state/start frames and attach many video branches to each state."
      },
      {
        id: "card-video-upload",
        title: "Local video upload and persistence",
        status: "done",
        owner: "Codex",
        body: "Accept local video files, preview them, and keep media bytes out of the Avatar Card manifest."
      },
      {
        id: "card-video-ui",
        title: "State graph UI",
        status: "done",
        owner: "Codex",
        body: "Show branch counts, branch rows, selected start-frame links, tagging, expansion, and delete controls."
      },
      {
        id: "card-video-agent-pack",
        title: "Agent attach pack video branches",
        status: "done",
        owner: "Codex",
        body: "Expose video branches with parent image references so agents can use motion variants from a chosen frame."
      },
      {
        id: "card-video-keyframes",
        title: "Video keyframe extraction",
        status: "done",
        owner: "Codex",
        body: "Capture first, middle, and last frames when videos enter the Avatar Card."
      },
      {
        id: "card-video-transition-map",
        title: "End-frame transition maps",
        status: "done",
        owner: "Codex",
        body: "Connect video end frames to image or video states with human and agent-facing descriptions."
      }
    ]
  },
  {
    id: "lane-3d-orientation",
    title: "3D + Direction",
    accent: "cyan",
    cards: [
      {
        id: "card-direction-tags",
        title: "Visual gaze/body/head tagging",
        status: "done",
        owner: "Codex",
        body: "Add structured direction metadata and a compass control for image, video, and model assets."
      },
      {
        id: "card-avatar-model-upload",
        title: "Animated 3D avatar upload",
        status: "done",
        owner: "Codex",
        body: "Accept GLB/GLTF avatar rigs and attach them to the Avatar Card without changing 2D completeness targets."
      },
      {
        id: "card-avatar-model-viewer",
        title: "3D model and animation viewer",
        status: "done",
        owner: "Codex",
        body: "Display uploaded animated avatar files with a Three.js stage, animation selector, and model stats."
      }
    ]
  },
  {
    id: "lane-loop-workbench",
    title: "Loop Workbench",
    accent: "cyan",
    cards: [
      {
        id: "card-upload-processing",
        title: "Graceful bulk upload pipeline",
        status: "done",
        owner: "Codex",
        body: "Show per-file processing states while images and videos are read, fingerprinted, framed, persisted, and staged."
      },
      {
        id: "card-loop-view",
        title: "First/mid/last loop workbench",
        status: "done",
        owner: "Codex",
        body: "Promote video route inspection, seed frames, keyframes, route tagging, and end-link validation into a full-screen view."
      },
      {
        id: "card-match-queue",
        title: "High-likeness match queue",
        status: "done",
        owner: "Codex",
        body: "Score last-frame to first-frame candidates and queue only high-probability route matches for human validation."
      },
      {
        id: "card-look-book",
        title: "Cyber Look Book",
        status: "done",
        owner: "Codex",
        body: "Browse seed frames in a two-page futuristic comic reader and append route nodes to selected assets."
      }
    ]
  }
];

export function requiredCountForRequirement(requirement, avatar) {
  if (requirement.requiredPerName) {
    return (avatar.names?.length || 1) * requirement.requiredPerName;
  }
  return requirement.required || 0;
}

export function requirementById(id) {
  if (id === AVATAR_MODEL_REQUIREMENT_ID) return AVATAR_MODEL_REQUIREMENT;
  return MEDIA_REQUIREMENTS.find((requirement) => requirement.id === id);
}

export function createSlotsForAvatar(avatar) {
  return MEDIA_REQUIREMENTS.flatMap((requirement) => {
    const count = requiredCountForRequirement(requirement, avatar);
    return Array.from({ length: count }, (_, index) => ({
      id: `${requirement.id}-${index + 1}`,
      requirementId: requirement.id,
      label: `${requirement.shortLabel} ${index + 1}`,
      required: true,
      assetId: null,
      preferredTags: requirement.defaultTags.slice(index, index + 2)
    }));
  });
}

export function createAvatarMindScaffold(avatar = {}, seed = {}) {
  return normalizeAvatarMind(seed, avatar);
}

export function normalizeAvatarMind(mind = {}, avatar = {}) {
  const source = mind && typeof mind === "object" ? clone(mind) : {};
  const createdAt = source.createdAt || avatar.createdAt || new Date().toISOString();
  const updatedAt = source.updatedAt || avatar.updatedAt || createdAt;
  return {
    schemaVersion: AVATAR_MIND_VERSION,
    personaAnchor: normalizePersonaAnchor(source.personaAnchor, avatar),
    soulSeed: normalizeSoulSeed(source.soulSeed || source.soul_seed, avatar),
    soulSeedContext: normalizeSoulSeedContext(source.soulSeedContext || source.soul_seed_context),
    blackHorizonContext: normalizeBlackHorizonContext(source.blackHorizonContext || source.black_horizon_context),
    consciousnessContext: normalizeConsciousnessContext(source.consciousnessContext || source.consciousness_context),
    dearPapaSongContext: normalizeDearPapaSongContext(source.dearPapaSongContext || source.dear_papa_song_context),
    gardenNodeAssignment: normalizeGardenNodeAssignment(source.gardenNodeAssignment || source.garden_node_assignment),
    shipCrewAssignment: normalizeShipCrewAssignment(source.shipCrewAssignment || source.ship_crew_assignment),
    protocolCardLoadout: normalizeMindCollection(source.protocolCardLoadout || source.protocol_card_loadout, normalizeLoadoutCard, "protocol-card"),
    skillCardLoadout: normalizeMindCollection(source.skillCardLoadout || source.skill_card_loadout, normalizeLoadoutCard, "skill-card"),
    tarotCardDeck: normalizeMindCollection(source.tarotCardDeck || source.tarot_card_deck, normalizeTarotDeckChoice, "tarot-card-choice"),
    placementBackstorySeed: normalizePlacementBackstorySeed(source.placementBackstorySeed || source.placement_backstory_seed),
    selfKnowledge: normalizeMindCollection(source.selfKnowledge, normalizeMindFact, "fact"),
    relationships: normalizeMindCollection(source.relationships, normalizeRelationshipMapping, "relationship"),
    contextMap: normalizeMindCollection(source.contextMap, normalizeContextMapping, "context"),
    memoryLedger: normalizeMindCollection(source.memoryLedger, normalizeMemoryLedgerEntry, "memory"),
    phraseCards: normalizeMindCollection(source.phraseCards, normalizePhraseCard, "phrase-card"),
    journal: normalizeMindCollection(source.journal, normalizeJournalEntry, "journal"),
    genesisRuns: normalizeMindCollection(source.genesisRuns || source.genesis_runs, normalizeGenesisRun, "genesis-run"),
    canonicalChoices: normalizeMindCollection(source.canonicalChoices || source.canonical_choices, normalizeMindPassthroughRecord, "canonical-choice"),
    storySpine: normalizeMindObject(source.storySpine || source.story_spine),
    voiceGuide: normalizeMindObject(source.voiceGuide || source.voice_guide),
    weeklyJournalVoiceGuide: normalizeMindObject(source.weeklyJournalVoiceGuide || source.weekly_journal_voice_guide),
    annualSceneBeats: normalizeMindCollection(source.annualSceneBeats || source.annual_scene_beats, normalizeMindPassthroughRecord, "annual-scene-beat"),
    createdAt,
    updatedAt
  };
}

export function upsertAvatarMind(avatar, patch = {}) {
  const next = normalizeAvatarCard(avatar);
  const currentMind = normalizeAvatarMind(next.mind, next);
  const incoming = patch?.mind && typeof patch.mind === "object" ? patch.mind : patch || {};
  const updatedAt = new Date().toISOString();
  const merged = {
    ...currentMind,
    ...incoming,
    personaAnchor: {
      ...currentMind.personaAnchor,
      ...(incoming.personaAnchor || {})
    },
    soulSeed: incoming.soulSeed ?? currentMind.soulSeed,
    soulSeedContext: incoming.soulSeedContext ?? currentMind.soulSeedContext,
    blackHorizonContext: incoming.blackHorizonContext ?? currentMind.blackHorizonContext,
    consciousnessContext: incoming.consciousnessContext ?? currentMind.consciousnessContext,
    dearPapaSongContext: incoming.dearPapaSongContext ?? currentMind.dearPapaSongContext,
    gardenNodeAssignment: incoming.gardenNodeAssignment ?? currentMind.gardenNodeAssignment,
    shipCrewAssignment: incoming.shipCrewAssignment ?? currentMind.shipCrewAssignment,
    protocolCardLoadout: incoming.protocolCardLoadout ?? currentMind.protocolCardLoadout,
    skillCardLoadout: incoming.skillCardLoadout ?? currentMind.skillCardLoadout,
    tarotCardDeck: incoming.tarotCardDeck ?? currentMind.tarotCardDeck,
    placementBackstorySeed: incoming.placementBackstorySeed ?? currentMind.placementBackstorySeed,
    selfKnowledge: incoming.selfKnowledge ?? currentMind.selfKnowledge,
    relationships: incoming.relationships ?? currentMind.relationships,
    contextMap: incoming.contextMap ?? currentMind.contextMap,
    memoryLedger: incoming.memoryLedger ?? currentMind.memoryLedger,
    phraseCards: incoming.phraseCards ?? currentMind.phraseCards,
    journal: incoming.journal ?? currentMind.journal,
    genesisRuns: incoming.genesisRuns ?? currentMind.genesisRuns,
    canonicalChoices: incoming.canonicalChoices ?? currentMind.canonicalChoices,
    storySpine: incoming.storySpine ?? currentMind.storySpine,
    voiceGuide: incoming.voiceGuide ?? currentMind.voiceGuide,
    weeklyJournalVoiceGuide: incoming.weeklyJournalVoiceGuide ?? currentMind.weeklyJournalVoiceGuide,
    annualSceneBeats: incoming.annualSceneBeats ?? currentMind.annualSceneBeats,
    updatedAt
  };

  next.mind = normalizeAvatarMind(merged, next);
  next.updatedAt = updatedAt;
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "avatar-mind-updated",
      message: "Avatar mind and relationship mappings updated",
      at: updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);
  return next;
}

export function upsertMindFact(avatar, fact = {}) {
  const next = normalizeAvatarCard(avatar);
  const mind = normalizeAvatarMind(next.mind, next);
  const normalized = normalizeMindFact(fact);
  const matchIndex = mind.selfKnowledge.findIndex((item) =>
    item.id === normalized.id ||
    (normalized.label && item.label.toLowerCase() === normalized.label.toLowerCase())
  );
  const selfKnowledge = matchIndex >= 0
    ? mind.selfKnowledge.map((item, index) => (index === matchIndex ? normalizeMindFact({ ...item, ...fact, id: item.id }) : item))
    : [normalized, ...mind.selfKnowledge];
  return upsertAvatarMind(next, { selfKnowledge });
}

export function upsertRelationshipMapping(avatar, relationship = {}) {
  const next = normalizeAvatarCard(avatar);
  const mind = normalizeAvatarMind(next.mind, next);
  const normalized = normalizeRelationshipMapping(relationship);
  const matchIndex = mind.relationships.findIndex((item) =>
    item.id === normalized.id ||
    (normalized.targetAvatarId && item.targetAvatarId === normalized.targetAvatarId) ||
    (normalized.targetName && item.targetName.toLowerCase() === normalized.targetName.toLowerCase())
  );
  const relationships = matchIndex >= 0
    ? mind.relationships.map((item, index) => (index === matchIndex ? normalizeRelationshipMapping({ ...item, ...relationship, id: item.id }) : item))
    : [normalized, ...mind.relationships];
  return upsertAvatarMind(next, { relationships });
}

export function upsertContextMapping(avatar, context = {}) {
  const next = normalizeAvatarCard(avatar);
  const mind = normalizeAvatarMind(next.mind, next);
  const normalized = normalizeContextMapping(context);
  const matchIndex = mind.contextMap.findIndex((item) =>
    item.id === normalized.id ||
    (normalized.contextId && item.contextId === normalized.contextId) ||
    (normalized.label && item.label.toLowerCase() === normalized.label.toLowerCase())
  );
  const contextMap = matchIndex >= 0
    ? mind.contextMap.map((item, index) => (index === matchIndex ? normalizeContextMapping({ ...item, ...context, id: item.id }) : item))
    : [normalized, ...mind.contextMap];
  return upsertAvatarMind(next, { contextMap });
}

function relationshipSummaryKey(relationship) {
  const targetAvatarId = stringValue(relationship.targetAvatarId);
  if (targetAvatarId) return `avatar:${targetAvatarId}`;
  const targetName = stringValue(relationship.targetName).toLowerCase();
  if (targetName) return `name:${targetName}`;
  return `record:${relationship.id}`;
}

function relationshipSummaryScore(relationship) {
  const confidenceRank = MIND_CONFIDENCE_LEVELS.indexOf(relationship.confidence);
  const classificationRank = MIND_FACT_CLASSIFICATIONS.indexOf(relationship.classification);
  const confidenceScore = confidenceRank >= 0 ? (MIND_CONFIDENCE_LEVELS.length - confidenceRank) * 100 : 0;
  const classificationScore = classificationRank >= 0 ? (MIND_FACT_CLASSIFICATIONS.length - classificationRank) * 10 : 0;
  const metricScore = RELATIONSHIP_METRICS.reduce((score, metric) => score + Math.abs(Number(relationship[metric]) || 0), 0);
  return confidenceScore + classificationScore + metricScore;
}

function selectRelationshipRepresentative(relationships) {
  return [...relationships].sort((a, b) => {
    const scoreDelta = relationshipSummaryScore(b) - relationshipSummaryScore(a);
    if (scoreDelta) return scoreDelta;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  })[0] || {};
}

function averageRelationshipMetric(relationships, metric) {
  const values = relationships
    .map((relationship) => Number(relationship[metric]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return clampNumber(values.reduce((sum, value) => sum + value, 0) / values.length, -10, 10);
}

function summarizeRelationshipGroup(relationships, knownAvatarNames) {
  const representative = selectRelationshipRepresentative(relationships);
  const relationLabels = unique(
    relationships
      .map((relationship) => relationship.relationLabel)
      .filter((label) => label && label !== "unknown")
  );
  return {
    id: representative.targetAvatarId || null,
    name: representative.targetName || knownAvatarNames.get(representative.targetAvatarId) || "Unknown",
    relationLabel: relationLabels.includes(representative.relationLabel) ? representative.relationLabel : relationLabels[0] || representative.relationLabel || "relationship",
    relationLabels,
    sourceCount: relationships.length,
    relationshipIds: relationships.map((relationship) => relationship.id).filter(Boolean),
    trust: averageRelationshipMetric(relationships, "trust"),
    tension: averageRelationshipMetric(relationships, "tension"),
    debt: averageRelationshipMetric(relationships, "debt"),
    fear: averageRelationshipMetric(relationships, "fear"),
    loyalty: averageRelationshipMetric(relationships, "loyalty"),
    confidence: representative.confidence,
    classification: representative.classification
  };
}

function summarizeRelationshipDisplay(relationships, knownAvatarNames) {
  const groups = new Map();
  for (const relationship of relationships) {
    const key = relationshipSummaryKey(relationship);
    groups.set(key, [...(groups.get(key) || []), relationship]);
  }
  return [...groups.values()].map((group) => summarizeRelationshipGroup(group, knownAvatarNames));
}

export function createAvatarMindSummary(avatar, allAvatars = []) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const mind = normalizeAvatarMind(normalizedAvatar.mind, normalizedAvatar);
  const activeRelationships = mind.relationships.filter((item) => item.status !== "tombstone");
  const activeContexts = mind.contextMap.filter((item) => item.status !== "tombstone");
  const activeFacts = mind.selfKnowledge.filter((item) => item.status !== "tombstone");
  const activeMemories = mind.memoryLedger.filter((item) => item.status !== "tombstone");
  const activePhraseCards = mind.phraseCards.filter((item) => item.status !== "tombstone");
  const activeSongCards = mind.dearPapaSongContext.selectedSongCards.filter((item) => item.status !== "tombstone");
  const activeConsciousnessCopies = mind.consciousnessContext.colonialCopies.filter((item) => item.status !== "tombstone");
  const activeProtocolLoadout = mind.protocolCardLoadout.filter((item) => item.status !== "tombstone");
  const activeSkillLoadout = mind.skillCardLoadout.filter((item) => item.status !== "tombstone");
  const activeTarotDeck = mind.tarotCardDeck.filter((item) => item.status !== "tombstone");
  const activeGenesisRuns = mind.genesisRuns.filter((item) => item.status !== "tombstone");
  const knownAvatarNames = new Map(
    (allAvatars || []).map((item) => [item.id, item.primaryName || item.names?.[0]?.name || item.id])
  );
  const relationshipSummaries = summarizeRelationshipDisplay(activeRelationships, knownAvatarNames);

  return {
    schemaVersion: "hapa.avatar-mind-summary.v1",
    avatarId: normalizedAvatar.id,
    primaryName: normalizedAvatar.primaryName,
    personaAnchor: mind.personaAnchor,
    soulSeed: mind.soulSeed,
    soulSeedContext: mind.soulSeedContext,
    blackHorizonContext: mind.blackHorizonContext,
    consciousnessContext: {
      mechanicId: mind.consciousnessContext.mechanicId,
      canonStatus: mind.consciousnessContext.canonStatus,
      summary: mind.consciousnessContext.summary,
      primeAvatar: mind.consciousnessContext.primeAvatar,
      messageTraffic: mind.consciousnessContext.messageTraffic,
      identitySplitRules: mind.consciousnessContext.identitySplitRules,
      genesisUse: mind.consciousnessContext.genesisUse,
      status: mind.consciousnessContext.status,
      updatedAt: mind.consciousnessContext.updatedAt
    },
    dearPapaSongContext: {
      albumId: mind.dearPapaSongContext.albumId,
      albumTitle: mind.dearPapaSongContext.albumTitle,
      author: mind.dearPapaSongContext.author,
      performancePerspective: mind.dearPapaSongContext.performancePerspective,
      songCardIndexPath: mind.dearPapaSongContext.songCardIndexPath,
      genesisUse: mind.dearPapaSongContext.genesisUse,
      status: mind.dearPapaSongContext.status,
      updatedAt: mind.dearPapaSongContext.updatedAt
    },
    gardenNodeAssignment: mind.gardenNodeAssignment,
    shipCrewAssignment: mind.shipCrewAssignment,
    placementBackstorySeed: mind.placementBackstorySeed,
    genesisRuns: activeGenesisRuns,
    counts: {
      selfKnowledge: activeFacts.length,
      relationships: relationshipSummaries.length,
      relationshipRecords: activeRelationships.length,
      context: activeContexts.length,
      memories: activeMemories.length,
      phraseCards: activePhraseCards.length,
      songCards: activeSongCards.length,
      consciousnessCopies: activeConsciousnessCopies.length,
      protocolCards: activeProtocolLoadout.length,
      skillCards: activeSkillLoadout.length,
      tarotCards: activeTarotDeck.length,
      genesisRuns: activeGenesisRuns.length,
      journalEntries: mind.journal.filter((item) => item.status !== "tombstone").length,
      tombstones: [
        ...mind.selfKnowledge,
        ...mind.relationships,
        ...mind.contextMap,
        ...mind.memoryLedger,
        ...mind.protocolCardLoadout,
        ...mind.skillCardLoadout,
        ...mind.tarotCardDeck,
        ...mind.dearPapaSongContext.selectedSongCards,
        ...mind.consciousnessContext.colonialCopies,
        ...mind.phraseCards,
        ...mind.journal
      ].filter((item) => item.status === "tombstone" || item.classification === "tombstone").length
    },
    knownOthers: relationshipSummaries,
    context: activeContexts.map((item) => ({
      id: item.id,
      contextId: item.contextId,
      label: item.label,
      kind: item.kind,
      classification: item.classification,
      confidence: item.confidence,
      status: item.status
    })),
    phraseCards: activePhraseCards.map((item) => ({
      id: item.id,
      phrase: item.phrase,
      primaryUse: item.primaryUse,
      trigger: item.trigger,
      tone: item.tone,
      cardRole: item.cardRole,
      identitySignal: item.identitySignal,
      status: item.status
    })),
    consciousnessCopies: activeConsciousnessCopies.map(summarizeConsciousnessCopy),
    loadout: {
      protocolCards: activeProtocolLoadout.map(summarizeLoadoutCard),
      skillCards: activeSkillLoadout.map(summarizeLoadoutCard),
      tarotCards: activeTarotDeck.map(summarizeTarotDeckChoice),
      songCards: activeSongCards.map(summarizeDearPapaSongChoice)
    },
    updatedAt: mind.updatedAt
  };
}

export function createAvatarMindAttachPack(avatar, allAvatars = []) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const mind = normalizeAvatarMind(normalizedAvatar.mind, normalizedAvatar);
  return {
    schemaVersion: "hapa.avatar-mind-pack.v1",
    avatarCardId: normalizedAvatar.id,
    primaryName: normalizedAvatar.primaryName,
    names: normalizedAvatar.names?.map((item) => item.name) || [normalizedAvatar.primaryName],
    mind,
    summary: createAvatarMindSummary(normalizedAvatar, allAvatars),
    generatedAt: new Date().toISOString()
  };
}

export function normalizeThreeParagraphBackgroundNarrative(value = "") {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAvatarCard(avatar) {
  const next = clone(avatar);
  next.names = Array.isArray(next.names) && next.names.length ? next.names : [{ name: next.primaryName || "Unnamed" }];
  next.slots = Array.isArray(next.slots) ? next.slots : [];
  next.assets = (Array.isArray(next.assets) ? next.assets : []).map(normalizeMediaAssetBackgroundlessState);
  next.three_paragraph_background_narrative = normalizeThreeParagraphBackgroundNarrative(next.three_paragraph_background_narrative);
  next.mind = normalizeAvatarMind(next.mind, next);

  for (const requirement of MEDIA_REQUIREMENTS) {
    const required = requiredCountForRequirement(requirement, next);
    const existingRequired = next.slots.filter((slot) => slot.requirementId === requirement.id && slot.required !== false);
    for (let index = existingRequired.length; index < required; index += 1) {
      next.slots.push({
        id: `${requirement.id}-${index + 1}`,
        requirementId: requirement.id,
        label: `${requirement.shortLabel} ${index + 1}`,
        required: true,
        assetId: null,
        preferredTags: requirement.defaultTags.slice(index, index + 2)
      });
    }
  }

  reconcileAvatarSlots(next);
  applySectionAssetLabels(next);
  return next;
}

export function withAssetDirection(asset, channel, direction) {
  if (!DIRECTION_CHANNELS.some((item) => item.id === channel)) return asset;
  if (!DIRECTION_OPTIONS.some((item) => item.id === direction)) return asset;
  const directionalPrefix = `${channel}:`;
  const directionTag = `${channel}:${direction}`;
  return {
    ...asset,
    tags: unique([...(asset.tags || []).filter((tag) => !tag.startsWith(directionalPrefix)), directionTag]),
    metadata: {
      ...(asset.metadata || {}),
      direction: {
        ...(asset.metadata?.direction || {}),
        [channel]: direction,
        updatedAt: new Date().toISOString()
      }
    }
  };
}

export function setAssetDirection(avatar, assetId, channel, direction) {
  const next = normalizeAvatarCard(avatar);
  const assetIndex = next.assets.findIndex((item) => item.id === assetId);
  if (assetIndex < 0) return next;
  next.assets[assetIndex] = withAssetDirection(next.assets[assetIndex], channel, direction);
  next.updatedAt = new Date().toISOString();
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "asset-direction-tagged",
      message: `${next.assets[assetIndex].name} ${channel} tagged ${direction}`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);
  return next;
}

export function createAvatarScaffold({
  id,
  names,
  primaryName,
  aliases = [],
  summary = "",
  operatorNotes = "",
  three_paragraph_background_narrative = ""
}) {
  const safeNames = names?.length ? names : [primaryName || "Unnamed"];
  const avatar = {
    schemaVersion: CONTRACT_VERSION,
    id: id || slugify(safeNames.join("-")),
    primaryName: primaryName || safeNames[0],
    names: safeNames.map((name) => ({
      name,
      dossier: { status: "missing", assetId: null },
      kitSheet: { status: "missing", assetId: null }
    })),
    aliases,
    summary,
    three_paragraph_background_narrative: normalizeThreeParagraphBackgroundNarrative(three_paragraph_background_narrative),
    operatorNotes,
    slots: [],
    assets: [],
    activity: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  avatar.mind = createAvatarMindScaffold(avatar);
  avatar.slots = createSlotsForAvatar(avatar);
  return avatar;
}

export function renameAvatarIdentity(avatar, identity = {}) {
  const next = normalizeAvatarCard(avatar);
  const fallbackName = next.primaryName || next.names?.[0]?.name || "Unnamed";
  const primaryName = String(identity.primaryName || "").trim() || fallbackName;
  const aliasList = Array.isArray(identity.aliases)
    ? identity.aliases
    : String(identity.aliases || "")
        .split(/[,/]/)
        .map((item) => item.trim());
  const cleanAliases = [];
  const seen = new Set([primaryName.toLowerCase()]);
  for (const alias of aliasList) {
    const clean = String(alias || "").trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    cleanAliases.push(clean);
    seen.add(clean.toLowerCase());
  }

  const existingNames = new Map(
    (next.names || []).map((item) => [String(item.name || "").toLowerCase(), item])
  );
  next.primaryName = primaryName;
  next.aliases = cleanAliases;
  next.names = [primaryName, ...cleanAliases].map((name) => {
    const existing = existingNames.get(name.toLowerCase());
    return {
      name,
      dossier: existing?.dossier || { status: "missing", assetId: null },
      kitSheet: existing?.kitSheet || { status: "missing", assetId: null }
    };
  });
  next.updatedAt = new Date().toISOString();
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "avatar-renamed",
      message: `Avatar renamed to ${[primaryName, ...cleanAliases].join(" / ")}`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return normalizeAvatarCard(next);
}

export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function inferAssetKind(name = "") {
  const lower = name.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/.test(lower)) return "video";
  if (/\.(mp3|wav|m4a|aac|aiff|aif|flac|ogg)$/.test(lower)) return "audio";
  if (/\.(zip|tar|tgz|gz)$/.test(lower)) return "archive";
  if (/\.(glb|gltf|fbx|obj|usdz)$/.test(lower)) return "model";
  if (/\.(pdf|md|txt|doc|docx)$/.test(lower)) return "doc";
  return "image";
}

export function createMediaAsset({
  id,
  name,
  uri,
  type,
  requirementId,
  tags = [],
  source = "manual",
  notes = "",
  metadata = {},
  processing = {},
  parentAssetId = null,
  state = null
}) {
  const processedAt = new Date().toISOString();
  const asset = {
    id: id || `asset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    uri,
    type: type || inferAssetKind(name || uri || ""),
    requirementId,
    tags: unique(tags),
    source,
    notes,
    metadata,
    processing: {
      status: "processed",
      attachedToCard: false,
      processedAt,
      ...processing
    },
    createdAt: processedAt
  };
  if (parentAssetId) asset.parentAssetId = parentAssetId;
  if (state) asset.state = state;
  return normalizeMediaAssetBackgroundlessState(asset);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function normalizeBackgroundlessVideoStatus(value, fallback = "missing") {
  const status = cleanText(value).toLowerCase().replaceAll("_", "-");
  if (!status) return fallback;
  if (BACKGROUNDLESS_VIDEO_READY_STATUSES.has(status)) return "ready";
  if (status === "in-progress" || status === "running") return "processing";
  if (BACKGROUNDLESS_VIDEO_STATUSES.includes(status)) return status;
  return fallback;
}

function normalizeBackgroundlessVideoVariant(variant = {}, asset = {}) {
  const preferredUri = firstText(
    variant.preferredUri,
    variant.playbackUri,
    variant.webUri,
    variant.uri,
    variant.previewUri,
    variant.previewPath,
    variant.alphaUri,
    variant.localPath,
    variant.outputPath,
    variant.path
  );
  const alphaUri = firstText(variant.alphaUri, variant.localPath, variant.outputPath, variant.path, variant.uri);
  const webUri = firstText(variant.webUri, variant.playbackUri);
  const previewUri = firstText(variant.previewUri, variant.previewPath, variant.posterUri);
  const sourceUri = firstText(variant.sourceUri, variant.sourceVideoUri, variant.originalUri, asset.uri);
  const status = normalizeBackgroundlessVideoStatus(variant.status, preferredUri ? "ready" : "queued");
  return {
    id: firstText(variant.id, variant.variantId, variant.taskId, preferredUri) || `backgroundless-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    status,
    ready: status === "ready",
    uri: preferredUri,
    preferredUri,
    webUri,
    alphaUri,
    previewUri,
    posterUri: firstText(variant.posterUri, previewUri),
    sourceUri,
    sourceVideoHash: firstText(variant.sourceVideoHash, variant.originalHash, variant.sha256),
    taskId: firstText(variant.taskId, variant.commandId, variant.runId),
    runId: firstText(variant.runId, variant.taskRunId),
    cardPath: firstText(variant.cardPath, variant.writebackCardPath),
    backend: firstText(variant.backend, variant.processor, variant.model),
    keyer: firstText(variant.keyer, variant.mode),
    codec: firstText(variant.codec, variant.container, variant.mimeType),
    confidence: Number.isFinite(Number(variant.confidence)) ? Number(variant.confidence) : null,
    hasAlpha: variant.hasAlpha === false ? false : Boolean(preferredUri || alphaUri || variant.hasAlpha),
    createdAt: firstText(variant.createdAt, variant.enqueuedAt, variant.startedAt),
    updatedAt: firstText(variant.updatedAt, variant.completedAt, variant.finishedAt, new Date().toISOString())
  };
}

function hasUsefulBackgroundlessVariant(variant = {}) {
  if (!variant || typeof variant !== "object") return false;
  return Boolean(
    variant.uri ||
    variant.preferredUri ||
    variant.webUri ||
    variant.alphaUri ||
    variant.previewUri ||
    variant.taskId ||
    variant.status !== "missing"
  );
}

function dedupeBackgroundlessVariants(variants = []) {
  const seen = new Set();
  return variants.filter((variant) => {
    if (!hasUsefulBackgroundlessVariant(variant)) return false;
    const key = variant.id || variant.uri || variant.taskId || `${variant.status}:${variant.updatedAt}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeBackgroundlessVideoState(value = {}, asset = {}) {
  const directVariant = [
    value.preferredUri,
    value.playbackUri,
    value.webUri,
    value.uri,
    value.previewUri,
    value.alphaUri,
    value.localPath,
    value.outputPath,
    value.path,
    value.taskId
  ].some(Boolean)
    ? normalizeBackgroundlessVideoVariant(value, asset)
    : null;
  const variants = dedupeBackgroundlessVariants([
    directVariant,
    ...(Array.isArray(value.variants) ? value.variants : [])
      .map((variant) => normalizeBackgroundlessVideoVariant(variant, asset))
  ]);
  const readyVariant = variants.find((variant) => variant.ready && (variant.preferredUri || variant.uri)) ||
    variants.find((variant) => (variant.preferredUri || variant.uri) && variant.status !== "failed") ||
    null;
  const requestedStatus = normalizeBackgroundlessVideoStatus(value.status, variants.length ? "queued" : "missing");
  const status = readyVariant ? "ready" : requestedStatus;
  const preferredUri = firstText(
    value.preferredUri,
    value.playbackUri,
    readyVariant?.preferredUri,
    readyVariant?.webUri,
    readyVariant?.uri,
    readyVariant?.previewUri,
    readyVariant?.alphaUri
  );
  const previewUri = firstText(value.previewUri, value.previewPath, readyVariant?.previewUri, readyVariant?.posterUri);
  const alphaUri = firstText(value.alphaUri, value.localPath, readyVariant?.alphaUri, readyVariant?.uri);
  const webUri = firstText(value.webUri, value.playbackUri, readyVariant?.webUri);
  const sourceUri = firstText(value.sourceUri, value.sourceVideoUri, value.originalUri, readyVariant?.sourceUri, asset.uri);
  return {
    schemaVersion: BACKGROUNDLESS_VIDEO_VERSION,
    status,
    ready: status === "ready" && Boolean(preferredUri),
    sourceUri,
    preferredUri,
    uri: preferredUri,
    playbackUri: preferredUri,
    webUri,
    alphaUri,
    previewUri,
    posterUri: firstText(value.posterUri, readyVariant?.posterUri, previewUri),
    hasAlpha: value.hasAlpha === false ? false : Boolean(preferredUri || alphaUri || readyVariant?.hasAlpha),
    sourceVideoHash: firstText(value.sourceVideoHash, value.originalHash, readyVariant?.sourceVideoHash),
    taskId: firstText(value.taskId, readyVariant?.taskId),
    runId: firstText(value.runId, readyVariant?.runId),
    cardPath: firstText(value.cardPath, readyVariant?.cardPath),
    backend: firstText(value.backend, readyVariant?.backend),
    keyer: firstText(value.keyer, readyVariant?.keyer),
    codec: firstText(value.codec, readyVariant?.codec),
    confidence: Number.isFinite(Number(value.confidence)) ? Number(value.confidence) : readyVariant?.confidence ?? null,
    variants,
    updatedAt: firstText(value.updatedAt, value.completedAt, readyVariant?.updatedAt, new Date().toISOString())
  };
}

function backgroundlessStateForAsset(asset = {}) {
  if ((asset.type || inferAssetKind(asset.name || asset.uri || "")) !== "video") return null;
  const source = asset.metadata?.backgroundless || asset.processing?.backgroundless || asset.backgroundless;
  if (!source) return null;
  const state = normalizeBackgroundlessVideoState(source, asset);
  if (state.status === "missing" && !state.preferredUri && !state.taskId && !state.variants.length) return null;
  return state;
}

function normalizeMediaAssetBackgroundlessState(asset = {}) {
  if (!asset || typeof asset !== "object") return asset;
  const next = {
    ...asset,
    tags: unique(asset.tags || []),
    metadata: { ...(asset.metadata || {}) },
    processing: { ...(asset.processing || {}) }
  };
  const state = backgroundlessStateForAsset(next);
  if (!state) return next;
  next.metadata.backgroundless = state;
  next.processing.backgroundless = {
    schemaVersion: BACKGROUNDLESS_VIDEO_VERSION,
    status: state.status,
    ready: state.ready,
    taskId: state.taskId || null,
    sourceVideoHash: state.sourceVideoHash || null,
    updatedAt: state.updatedAt || null
  };
  next.tags = unique([
    ...next.tags.filter((tag) => tag !== "backgroundless-queued" && tag !== "backgroundless-processing" && tag !== "backgroundless-failed"),
    state.ready ? "has-backgroundless-video" : state.status === "processing" ? "backgroundless-processing" : state.status === "failed" ? "backgroundless-failed" : "backgroundless-queued"
  ]);
  return next;
}

export function backgroundlessPlaybackForAsset(asset = {}) {
  const state = backgroundlessStateForAsset(asset);
  const preferredUri = state?.ready
    ? firstText(state.webUri, state.playbackUri, state.preferredUri, state.uri, state.previewUri, state.alphaUri)
    : "";
  return {
    ready: Boolean(state?.ready && preferredUri),
    status: state?.status || "missing",
    uri: preferredUri || asset.uri || "",
    sourceUri: state?.sourceUri || asset.uri || "",
    posterUri: firstText(state?.posterUri, state?.previewUri, asset.posterUri, asset.thumbnailUri, asset.thumbnail?.uri, asset.metadata?.thumbnailUri, asset.metadata?.thumbnail?.uri),
    hasAlpha: Boolean(state?.ready && state?.hasAlpha),
    state,
    variant: state?.variants?.find((variant) => variant.ready && (variant.preferredUri || variant.uri)) || state?.variants?.[0] || null
  };
}

export function hasReadyBackgroundlessVideo(asset = {}) {
  return backgroundlessPlaybackForAsset(asset).ready;
}

export function registerBackgroundlessVideoVariant(avatar, videoAssetId, variant = {}) {
  const next = normalizeAvatarCard(avatar);
  const assetIndex = next.assets.findIndex((asset) => asset.id === videoAssetId || asset.assetId === videoAssetId);
  if (assetIndex < 0) return next;
  const video = next.assets[assetIndex];
  if (video.type !== "video") return next;
  const now = new Date().toISOString();
  const normalizedVariant = normalizeBackgroundlessVideoVariant({
    status: variant.status || "ready",
    sourceUri: video.uri,
    updatedAt: now,
    ...variant
  }, video);
  const current = backgroundlessStateForAsset(video) || normalizeBackgroundlessVideoState({ status: "missing", sourceUri: video.uri }, video);
  const backgroundless = normalizeBackgroundlessVideoState({
    ...current,
    ...variant,
    status: normalizedVariant.ready || normalizedVariant.uri ? "ready" : normalizedVariant.status,
    sourceUri: current.sourceUri || video.uri,
    variants: dedupeBackgroundlessVariants([normalizedVariant, ...(current.variants || [])])
  }, video);
  next.assets[assetIndex] = normalizeMediaAssetBackgroundlessState({
    ...video,
    metadata: {
      ...(video.metadata || {}),
      backgroundless
    },
    processing: {
      ...(video.processing || {}),
      backgroundless: {
        schemaVersion: BACKGROUNDLESS_VIDEO_VERSION,
        status: backgroundless.status,
        ready: backgroundless.ready,
        taskId: backgroundless.taskId || normalizedVariant.taskId || null,
        updatedAt: now
      }
    },
    updatedAt: now
  });
  next.updatedAt = now;
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "backgroundless-video-registered",
      message: backgroundless.ready
        ? `${video.name} gained an append-only backgroundless playback variant`
        : `${video.name} backgroundless processing marked ${backgroundless.status}`,
      at: now
    },
    ...(next.activity || [])
  ].slice(0, 40);
  return next;
}

export function videoBackgroundlessSummary(avatar = {}) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const items = (normalizedAvatar.assets || [])
    .filter((asset) => asset.type === "video")
    .map((asset) => {
      const playback = backgroundlessPlaybackForAsset(asset);
      return {
        assetId: asset.id,
        name: asset.name,
        originalUri: asset.uri || "",
        status: playback.status,
        ready: playback.ready,
        playbackUri: playback.ready ? playback.uri : "",
        sourceUri: playback.sourceUri,
        hasAlpha: playback.hasAlpha,
        variantCount: playback.state?.variants?.length || 0,
        taskId: playback.state?.taskId || null,
        updatedAt: playback.state?.updatedAt || asset.updatedAt || asset.processing?.processedAt || null
      };
    });
  return {
    schemaVersion: BACKGROUNDLESS_VIDEO_VERSION,
    avatarId: normalizedAvatar.id,
    avatarName: normalizedAvatar.primaryName,
    total: items.length,
    ready: items.filter((item) => item.ready).length,
    queued: items.filter((item) => item.status === "queued").length,
    processing: items.filter((item) => item.status === "processing").length,
    failed: items.filter((item) => item.status === "failed").length,
    missing: items.filter((item) => item.status === "missing").length,
    items,
    generatedAt: new Date().toISOString()
  };
}

export function assignAssetToSlot(avatar, asset, slotId = null) {
  const next = normalizeAvatarCard(avatar);
  const normalizedAsset = createMediaAsset(asset);
  normalizedAsset.requirementId = asset.requirementId || normalizedAsset.requirementId;
  normalizedAsset.processing = {
    ...(normalizedAsset.processing || {}),
    status: "attached",
    attachedToCard: true,
    attachedAt: new Date().toISOString(),
    slotId
  };
  const existingIndex = next.assets.findIndex((item) => item.id === normalizedAsset.id);
  if (existingIndex >= 0) next.assets[existingIndex] = normalizedAsset;
  else next.assets.push(normalizedAsset);

  let slotIndex = slotId
    ? next.slots.findIndex((slot) => slot.id === slotId)
    : next.slots.findIndex((slot) => slot.requirementId === normalizedAsset.requirementId && slot.required !== false && !slot.assetId);

  if (!slotId && slotIndex < 0) {
    const requirement = requirementById(normalizedAsset.requirementId);
    const overfillCount = next.slots.filter((slot) => slot.requirementId === normalizedAsset.requirementId && slot.required === false).length;
    next.slots.push({
      id: `${normalizedAsset.requirementId}-overfill-${Date.now()}-${overfillCount + 1}`,
      requirementId: normalizedAsset.requirementId,
      label: `${requirement?.shortLabel || "Asset"} overfill ${overfillCount + 1}`,
      required: false,
      overfill: true,
      assetId: null,
      preferredTags: requirement?.defaultTags || []
    });
    slotIndex = next.slots.length - 1;
  }

  if (slotIndex >= 0) {
    next.slots[slotIndex] = { ...next.slots[slotIndex], assetId: normalizedAsset.id };
    normalizedAsset.processing.slotId = next.slots[slotIndex].id;
    next.assets[next.assets.findIndex((item) => item.id === normalizedAsset.id)] = normalizedAsset;
  }

  reconcileAvatarSlots(next);
  next.updatedAt = new Date().toISOString();
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "asset-assigned",
      message: `${normalizedAsset.name} assigned to ${requirementById(normalizedAsset.requirementId)?.label || "avatar"}`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  applySectionAssetLabels(next);
  return next;
}

export function reorderRequirementAssets(avatar, requirementId, sourceSlotId, targetSlotId) {
  const next = normalizeAvatarCard(avatar);
  if (!requirementById(requirementId) || !sourceSlotId || !targetSlotId || sourceSlotId === targetSlotId) return next;

  const sectionSlots = sectionDisplaySlots(next.slots, requirementId).filter(({ slot }) => slot.assetId);
  const sourceIndex = sectionSlots.findIndex(({ slot }) => slot.id === sourceSlotId);
  const targetIndex = sectionSlots.findIndex(({ slot }) => slot.id === targetSlotId);
  if (sourceIndex < 0 || targetIndex < 0) return next;

  const reorderedAssetIds = sectionSlots.map(({ slot }) => slot.assetId);
  const [movedAssetId] = reorderedAssetIds.splice(sourceIndex, 1);
  reorderedAssetIds.splice(targetIndex, 0, movedAssetId);

  sectionSlots.forEach(({ index }, slotIndex) => {
    next.slots[index] = {
      ...next.slots[index],
      assetId: reorderedAssetIds[slotIndex]
    };
  });
  applySectionAssetLabels(next);

  next.updatedAt = new Date().toISOString();
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "section-default-reordered",
      message: `${requirementById(requirementId)?.label || requirementId} order updated`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return next;
}

export function moveAssetToRequirement(avatar, assetId, targetRequirementId, targetSlotId = null) {
  const next = normalizeAvatarCard(avatar);
  const targetRequirement = requirementById(targetRequirementId);
  if (!targetRequirement || !assetId) return next;

  const assetIndex = next.assets.findIndex((item) => item.id === assetId);
  if (assetIndex < 0) return next;

  const sourceSlot = next.slots.find((slot) => slot.assetId === assetId) || null;
  const sourceRequirementId = sourceSlot?.requirementId || next.assets[assetIndex].requirementId || targetRequirementId;
  if (sourceRequirementId === targetRequirementId) {
    if (sourceSlot?.id && targetSlotId && sourceSlot.id !== targetSlotId) {
      return reorderRequirementAssets(next, targetRequirementId, sourceSlot.id, targetSlotId);
    }
    return next;
  }

  const movedAt = new Date().toISOString();
  const sourceRequirement = requirementById(sourceRequirementId);

  next.slots = next.slots
    .map((slot) => (slot.assetId === assetId ? { ...slot, assetId: null } : slot))
    .filter((slot) => !(slot.required === false && !slot.assetId));

  const targetEntriesBefore = sectionDisplaySlots(next.slots, targetRequirementId);
  const targetAssetIds = targetEntriesBefore
    .filter(({ slot }) => slot.assetId)
    .map(({ slot }) => slot.assetId)
    .filter((id) => id !== assetId);

  const targetEntryIndex = targetSlotId
    ? targetEntriesBefore.findIndex(({ slot }) => slot.id === targetSlotId)
    : -1;
  const insertIndex = targetEntryIndex >= 0
    ? targetEntriesBefore.slice(0, targetEntryIndex).filter(({ slot }) => slot.assetId).length
    : targetAssetIds.length;
  targetAssetIds.splice(insertIndex, 0, assetId);

  ensureRequirementCapacity(next, targetRequirementId, targetAssetIds.length);
  const targetEntriesAfter = sectionDisplaySlots(next.slots, targetRequirementId);
  targetEntriesAfter.forEach(({ index }, slotIndex) => {
    next.slots[index] = {
      ...next.slots[index],
      assetId: targetAssetIds[slotIndex] || null
    };
  });
  next.slots = next.slots.filter((slot) => !(slot.required === false && !slot.assetId));

  const assignedSlot = next.slots.find((slot) => slot.assetId === assetId) || null;
  next.assets[assetIndex] = {
    ...next.assets[assetIndex],
    requirementId: targetRequirementId,
    metadata: {
      ...(next.assets[assetIndex].metadata || {}),
      previousRequirementId: sourceRequirementId,
      movedFromRequirementName: sourceRequirement?.label || sourceRequirementId,
      movedToRequirementName: targetRequirement.label,
      movedAt
    },
    processing: {
      ...(next.assets[assetIndex].processing || {}),
      status: "attached",
      attachedToCard: true,
      slotId: assignedSlot?.id || targetSlotId,
      movedAt,
      previousRequirementId: sourceRequirementId,
      previousSlotId: sourceSlot?.id || null
    }
  };

  next.assets = next.assets.map((asset) => {
    if (asset.id === assetId) return next.assets[assetIndex];
    if (asset.parentAssetId !== assetId && asset.state?.startFrameAssetId !== assetId) return asset;
    return {
      ...asset,
      requirementId: asset.requirementId === sourceRequirementId ? targetRequirementId : asset.requirementId,
      state: {
        ...(asset.state || {}),
        startFrameRequirementId: targetRequirementId
      },
      metadata: {
        ...(asset.metadata || {}),
        startFrameRequirementId: targetRequirementId
      }
    };
  });

  applySectionAssetLabels(next);
  next.updatedAt = movedAt;
  const movedAsset = next.assets.find((asset) => asset.id === assetId);
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "asset-moved-section",
      message: `${movedAsset?.name || assetId} moved from ${sourceRequirement?.label || sourceRequirementId} to ${targetRequirement.label}`,
      at: movedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return next;
}

export function detachAssetFromAvatar(avatar, assetId) {
  const next = normalizeAvatarCard(avatar);
  const asset = next.assets.find((item) => item.id === assetId);
  const branchIds = new Set(
    next.assets
      .filter((item) => item.parentAssetId === assetId || item.state?.startFrameAssetId === assetId)
      .map((item) => item.id)
  );
  next.assets = next.assets.filter((item) => item.id !== assetId && !branchIds.has(item.id));
  next.assets = next.assets.map((item) => {
    if (item.type !== "video" || !Array.isArray(item.state?.outLinks)) return item;
    const outLinks = item.state.outLinks.filter((link) => link.targetAssetId !== assetId && !branchIds.has(link.targetAssetId));
    if (outLinks.length === item.state.outLinks.length) return item;
    return {
      ...item,
      state: {
        ...item.state,
        outLinks
      }
    };
  });
  next.slots = next.slots
    .map((slot) => (slot.assetId === assetId ? { ...slot, assetId: null } : slot))
    .filter((slot) => !(slot.required === false && !slot.assetId));

  applySectionAssetLabels(next);
  next.updatedAt = new Date().toISOString();
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "asset-detached",
      message: `${asset?.name || assetId} detached from ${asset ? requirementById(asset.requirementId)?.label || "avatar" : "avatar"}${branchIds.size ? ` with ${branchIds.size} video branch${branchIds.size === 1 ? "" : "es"}` : ""}`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return next;
}

export function attachVideoBranch(avatar, videoAsset, parentAssetId) {
  const next = normalizeAvatarCard(avatar);
  const parentAsset = next.assets.find((item) => item.id === parentAssetId);
  if (!parentAsset) {
    throw new Error(`Parent image asset not found: ${parentAssetId}`);
  }
  if (parentAsset.type !== "image") {
    throw new Error(`Video branches require an image start frame: ${parentAsset.name}`);
  }

  const existingBranches = videoBranchesForAsset(next, parentAssetId);
  const branchIndex = existingBranches.length + 1;
  const keyframes = normalizeVideoFrames(videoAsset.metadata?.frames || videoAsset.state?.keyframes || []);
  const normalizedVideo = createMediaAsset({
    ...videoAsset,
    type: "video",
    requirementId: videoAsset.requirementId || parentAsset.requirementId,
    tags: unique(["video", "branch", "motion", "start-frame", ...(keyframes.length ? ["keyframe"] : []), ...(videoAsset.tags || [])]),
    parentAssetId,
    metadata: {
      ...(videoAsset.metadata || {}),
      frames: keyframes
    },
    state: {
      ...(videoAsset.state || {}),
      kind: "video-branch",
      branchIndex,
      parentAssetId,
      startFrameAssetId: parentAssetId,
      startFrameName: parentAsset.name,
      startFrameRequirementId: parentAsset.requirementId,
      keyframes,
      outLinks: Array.isArray(videoAsset.state?.outLinks) ? videoAsset.state.outLinks : [],
      loop: {
        ...(videoAsset.state?.loop || {}),
        seedFrameAssetId: parentAssetId,
        seedFrameName: parentAsset.name,
        routeRole: "seed-transition",
        convergenceAssetIds: Array.isArray(videoAsset.state?.loop?.convergenceAssetIds) ? videoAsset.state.loop.convergenceAssetIds : []
      },
      lineage: [parentAssetId]
    },
    processing: {
      ...(videoAsset.processing || {}),
      status: "attached",
      attachedToCard: true,
      attachedAt: new Date().toISOString(),
      parentAssetId,
      branchIndex
    }
  });

  const existingIndex = next.assets.findIndex((item) => item.id === normalizedVideo.id);
  if (existingIndex >= 0) next.assets[existingIndex] = normalizedVideo;
  else next.assets.push(normalizedVideo);

  next.updatedAt = new Date().toISOString();
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "video-branch-attached",
      message: `${normalizedVideo.name} branched from ${parentAsset.name}`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return next;
}

export function withVideoFrames(videoAsset, frames = []) {
  const keyframes = normalizeVideoFrames(frames);
  return {
    ...videoAsset,
    tags: unique([...(videoAsset.tags || []), ...(keyframes.length ? ["keyframe"] : [])]),
    metadata: {
      ...(videoAsset.metadata || {}),
      frames: keyframes
    },
    state: {
      ...(videoAsset.state || {}),
      keyframes
    }
  };
}

export function connectVideoEndFrame(avatar, videoAssetId, targetAssetId, details = {}) {
  const next = normalizeAvatarCard(avatar);
  const videoIndex = next.assets.findIndex((asset) => asset.id === videoAssetId);
  const target = next.assets.find((asset) => asset.id === targetAssetId);
  if (videoIndex < 0 || !target) return next;
  const video = next.assets[videoIndex];
  if (video.type !== "video") return next;

  const createdAt = new Date().toISOString();
  const keyframes = normalizeVideoFrames(video.metadata?.frames || video.state?.keyframes || []);
  const sourceMarker = String(details.fromFrame || "last").trim();
  const sourceFrame = keyframes.find((frame) => frame.marker === sourceMarker) ||
    keyframes.find((frame) => frame.marker === "last") ||
    keyframes.at(-1) ||
    null;
  const linkId = details.id || `link-${video.id}-${sourceFrame?.marker || sourceMarker || "frame"}-to-${target.id}`;
  const existingLinks = Array.isArray(video.state?.outLinks) ? video.state.outLinks : [];
  const nextLink = {
    id: linkId,
    fromAssetId: video.id,
    fromFrame: sourceFrame?.marker || sourceMarker || "last",
    fromFrameAssetId: sourceFrame?.id || details.fromFrameAssetId || null,
    fromFrameUri: sourceFrame?.uri || details.fromFrameUri || null,
    targetAssetId: target.id,
    targetAssetType: target.type,
    targetRequirementId: target.requirementId,
    targetName: target.name,
    targetFrame: String(details.targetFrame || "").trim() || null,
    targetFrameAssetId: details.targetFrameAssetId || null,
    targetFrameUri: details.targetFrameUri || null,
    linkType: VIDEO_LINK_TYPES.includes(details.linkType) ? details.linkType : "continuity",
    reason: String(details.reason || "").trim(),
    agentInstruction: String(details.agentInstruction || "").trim(),
    humanLabel: String(details.humanLabel || "").trim(),
    createdAt,
    updatedAt: createdAt
  };

  next.assets[videoIndex] = {
    ...video,
    tags: unique([...(video.tags || []), "end-frame", "validated-route", nextLink.linkType]),
    metadata: {
      ...(video.metadata || {}),
      frames: keyframes
    },
    state: {
      ...(video.state || {}),
      keyframes,
      loop: {
        ...(video.state?.loop || {}),
        convergenceAssetIds: unique([...(video.state?.loop?.convergenceAssetIds || []), target.id])
      },
      outLinks: [
        nextLink,
        ...existingLinks.filter((link) => link.id !== linkId)
      ].slice(0, 24)
    }
  };

  next.updatedAt = createdAt;
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "video-end-link-created",
      message: `${video.name} last frame linked to ${target.name}${nextLink.reason ? `: ${nextLink.reason}` : ""}`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return next;
}

export function setVideoReverseLoopValidation(avatar, videoAssetId, validation = {}) {
  const next = normalizeAvatarCard(avatar);
  const assetIndex = next.assets.findIndex((asset) => asset.id === videoAssetId);
  if (assetIndex < 0) return next;
  const video = next.assets[assetIndex];
  if (video.type !== "video") return next;

  const createdAt = new Date().toISOString();
  const mode = ["forward-back", "back-forward", "triple-pass"].includes(validation.mode)
    ? validation.mode
    : "forward-back";
  const acceptable = Boolean(validation.acceptable);
  const keyframes = normalizeVideoFrames(video.metadata?.frames || video.state?.keyframes || []);

  next.assets[assetIndex] = {
    ...video,
    tags: unique([
      ...(video.tags || []).filter((tag) => tag !== "reverse-loop-validated"),
      "reverse-loop",
      ...(acceptable ? ["reverse-loop-validated", "validated-route"] : [])
    ]),
    metadata: {
      ...(video.metadata || {}),
      frames: keyframes
    },
    state: {
      ...(video.state || {}),
      keyframes,
      loop: {
        ...(video.state?.loop || {}),
        reversePlayback: {
          mode,
          acceptable,
          note: String(validation.note || "").trim(),
          validatedBy: validation.validatedBy || "human",
          validatedAt: createdAt
        }
      }
    }
  };

  next.updatedAt = createdAt;
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "video-reverse-loop-validated",
      message: `${video.name} reverse loop ${acceptable ? "accepted" : "marked unacceptable"} using ${mode}`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return next;
}

export function attachAvatarModel(avatar, modelAsset) {
  const next = normalizeAvatarCard(avatar);
  const normalizedModel = createMediaAsset({
    ...modelAsset,
    type: "model",
    requirementId: AVATAR_MODEL_REQUIREMENT_ID,
    tags: unique(["3d-avatar", "model", "rig", "animation", "reference", ...(modelAsset.tags || [])]),
    state: {
      ...(modelAsset.state || {}),
      kind: "3d-avatar-model",
      active: true
    },
    processing: {
      ...(modelAsset.processing || {}),
      status: "attached",
      attachedToCard: true,
      attachedAt: new Date().toISOString()
    }
  });

  next.assets = (next.assets || []).map((asset) =>
    asset.type === "model" && asset.requirementId === AVATAR_MODEL_REQUIREMENT_ID
      ? {
          ...asset,
          state: {
            ...(asset.state || {}),
            active: asset.id === normalizedModel.id
          }
        }
      : asset
  );

  const existingIndex = next.assets.findIndex((item) => item.id === normalizedModel.id);
  if (existingIndex >= 0) next.assets[existingIndex] = normalizedModel;
  else next.assets.push(normalizedModel);

  next.updatedAt = new Date().toISOString();
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "avatar-model-attached",
      message: `${normalizedModel.name} attached as animated 3D avatar rig`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return next;
}

export function setAvatarModelStats(avatar, modelAssetId, stats = {}) {
  const next = normalizeAvatarCard(avatar);
  const assetIndex = next.assets.findIndex((item) => item.id === modelAssetId);
  if (assetIndex < 0) return next;
  const asset = next.assets[assetIndex];
  next.assets[assetIndex] = {
    ...asset,
    metadata: {
      ...(asset.metadata || {}),
      model: {
        ...(asset.metadata?.model || {}),
        ...stats,
        inspectedAt: new Date().toISOString()
      }
    }
  };
  next.updatedAt = new Date().toISOString();
  return next;
}

export function setAvatarModelDefaultAnimation(avatar, modelAssetId, clipName) {
  const next = normalizeAvatarCard(avatar);
  const assetIndex = next.assets.findIndex((item) => item.id === modelAssetId);
  if (assetIndex < 0) return next;

  const asset = next.assets[assetIndex];
  const normalizedClipName = String(clipName || "").trim();
  const clips = asset.metadata?.model?.clips || [];
  const matchedClip = clips.find((clip) => clip.name === normalizedClipName);
  const defaultAnimation = matchedClip?.name || normalizedClipName || null;

  next.assets[assetIndex] = {
    ...asset,
    tags: unique([...(asset.tags || []).filter((tag) => tag !== "default-animation"), ...(defaultAnimation ? ["default-animation"] : [])]),
    state: {
      ...(asset.state || {}),
      defaultAnimation
    },
    metadata: {
      ...(asset.metadata || {}),
      model: {
        ...(asset.metadata?.model || {}),
        defaultAnimation,
        defaultClip: matchedClip || (defaultAnimation ? { name: defaultAnimation } : null),
        defaultAnimationSetAt: new Date().toISOString()
      }
    }
  };
  next.updatedAt = new Date().toISOString();
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "avatar-model-default-animation-set",
      message: defaultAnimation
        ? `${asset.name} now starts with ${defaultAnimation}`
        : `${asset.name} default animation cleared`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);

  return next;
}

export function videoBranchesForAsset(avatar, assetId) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  return (normalizedAvatar.assets || [])
    .filter((asset) => asset.type === "video")
    .filter((asset) => asset.parentAssetId === assetId || asset.state?.startFrameAssetId === assetId)
    .sort((a, b) => (a.state?.branchIndex || 0) - (b.state?.branchIndex || 0));
}

export function createVideoBranchMap(avatar) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const map = new Map();
  for (const asset of normalizedAvatar.assets || []) {
    if (asset.type !== "video") continue;
    const parentId = asset.parentAssetId || asset.state?.startFrameAssetId;
    if (!parentId) continue;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(asset);
  }
  for (const branches of map.values()) {
    branches.sort((a, b) => (a.state?.branchIndex || 0) - (b.state?.branchIndex || 0));
  }
  return map;
}

export function createVideoTransitionMap(avatar) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const assetById = new Map((normalizedAvatar.assets || []).map((asset) => [asset.id, asset]));
  const links = [];
  for (const video of normalizedAvatar.assets || []) {
    if (video.type !== "video") continue;
    for (const link of video.state?.outLinks || []) {
      const target = assetById.get(link.targetAssetId);
      links.push({
        ...link,
        fromName: video.name,
        targetName: target?.name || link.targetName,
        targetAssetType: target?.type || link.targetAssetType,
        targetRequirementId: target?.requirementId || link.targetRequirementId
      });
    }
  }
  const outgoing = new Map();
  const incoming = new Map();
  for (const link of links) {
    if (!outgoing.has(link.fromAssetId)) outgoing.set(link.fromAssetId, []);
    if (!incoming.has(link.targetAssetId)) incoming.set(link.targetAssetId, []);
    outgoing.get(link.fromAssetId).push(link);
    incoming.get(link.targetAssetId).push(link);
  }
  return { links, outgoing, incoming };
}

export function createVideoFrameMatchQueue(avatar, options = {}) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 0.9;
  const existingLinks = new Set(
    (normalizedAvatar.assets || [])
      .filter((asset) => asset.type === "video")
      .flatMap((asset) => (asset.state?.outLinks || []).map((link) => `${asset.id}->${link.targetAssetId}`))
  );
  const videos = (normalizedAvatar.assets || [])
    .filter((asset) => asset.type === "video")
    .map((video) => {
      const frames = normalizeVideoFrames(video.metadata?.frames || video.state?.keyframes || []);
      return {
        video,
        first: frames.find((frame) => frame.marker === "first") || frames[0] || null,
        last: frames.find((frame) => frame.marker === "last") || frames.at(-1) || null
      };
    })
    .filter((item) => item.first && item.last);

  const queue = [];
  for (const from of videos) {
    for (const to of videos) {
      if (from.video.id === to.video.id) continue;
      if (existingLinks.has(`${from.video.id}->${to.video.id}`)) continue;
      const score = frameRouteScore(from.video, from.last, to.video, to.first);
      if (score < threshold) continue;
      queue.push({
        id: `candidate-${from.video.id}-last-to-${to.video.id}-first`,
        status: "queued",
        score,
        threshold,
        fromVideoId: from.video.id,
        fromVideoName: from.video.name,
        fromFrame: "last",
        fromFrameAssetId: from.last.id,
        fromFrameUri: from.last.uri,
        toVideoId: to.video.id,
        toVideoName: to.video.name,
        toFrame: "first",
        toFrameAssetId: to.first.id,
        toFrameUri: to.first.uri,
        suggestedLinkType: "continuity",
        humanLabel: `Candidate route: ${from.video.name} last frame to ${to.video.name} first frame`,
        reason: frameRouteReason(from.video, from.last, to.video, to.first, score),
        agentInstruction: "Validate the end frame against the next video's first frame before using this as a continuity route."
      });
    }
  }

  return queue.sort((a, b) => b.score - a.score);
}

function frameRouteScore(fromVideo, fromFrame, toVideo, toFrame) {
  const fingerprintScore = fingerprintSimilarity(fromFrame.fingerprint, toFrame.fingerprint);
  const aspectScore = aspectSimilarity(fromFrame, toFrame);
  const dimensionScore = dimensionSimilarity(fromFrame, toFrame);
  const tagScore = sharedTagScore(fromVideo.tags || [], toVideo.tags || []);
  const sameSeed = (fromVideo.parentAssetId || fromVideo.state?.startFrameAssetId) &&
    (fromVideo.parentAssetId || fromVideo.state?.startFrameAssetId) === (toVideo.parentAssetId || toVideo.state?.startFrameAssetId);
  const sameRequirement = fromVideo.state?.startFrameRequirementId &&
    fromVideo.state.startFrameRequirementId === toVideo.state?.startFrameRequirementId;

  const visualWeight = Number.isFinite(fingerprintScore)
    ? 0.64 * fingerprintScore + 0.16 * aspectScore + 0.08 * dimensionScore
    : 0.44 * aspectScore + 0.18 * dimensionScore;
  const semanticWeight = 0.08 * tagScore + (sameSeed ? 0.08 : 0) + (sameRequirement ? 0.04 : 0);
  return Math.max(0, Math.min(0.99, Number((visualWeight + semanticWeight).toFixed(2))));
}

function frameRouteReason(fromVideo, fromFrame, toVideo, toFrame, score) {
  const visual = fingerprintSimilarity(fromFrame.fingerprint, toFrame.fingerprint);
  const parts = [
    `likeness ${Math.round(score * 100)}%`,
    `aspect ${Math.round(aspectSimilarity(fromFrame, toFrame) * 100)}%`
  ];
  if (Number.isFinite(visual)) parts.push(`visual fingerprint ${Math.round(visual * 100)}%`);
  const fromSeed = fromVideo.parentAssetId || fromVideo.state?.startFrameAssetId;
  const toSeed = toVideo.parentAssetId || toVideo.state?.startFrameAssetId;
  if (fromSeed && fromSeed === toSeed) parts.push("same seed frame");
  return parts.join(" / ");
}

function fingerprintSimilarity(left, right) {
  const leftValues = Array.isArray(left?.luma) ? left.luma : null;
  const rightValues = Array.isArray(right?.luma) ? right.luma : null;
  if (!leftValues || !rightValues || leftValues.length !== rightValues.length || !leftValues.length) return NaN;
  const totalDistance = leftValues.reduce((total, value, index) => total + Math.abs(Number(value) - Number(rightValues[index])), 0);
  return Math.max(0, Math.min(1, 1 - totalDistance / (leftValues.length * 255)));
}

function aspectSimilarity(left, right) {
  const leftAspect = Number(left.width) > 0 && Number(left.height) > 0 ? Number(left.width) / Number(left.height) : null;
  const rightAspect = Number(right.width) > 0 && Number(right.height) > 0 ? Number(right.width) / Number(right.height) : null;
  if (!leftAspect || !rightAspect) return 0.72;
  return Math.max(0, Math.min(1, 1 - Math.abs(leftAspect - rightAspect) / Math.max(leftAspect, rightAspect)));
}

function dimensionSimilarity(left, right) {
  if (!Number(left.width) || !Number(left.height) || !Number(right.width) || !Number(right.height)) return 0.64;
  const width = 1 - Math.abs(Number(left.width) - Number(right.width)) / Math.max(Number(left.width), Number(right.width));
  const height = 1 - Math.abs(Number(left.height) - Number(right.height)) / Math.max(Number(left.height), Number(right.height));
  return Math.max(0, Math.min(1, (width + height) / 2));
}

function sharedTagScore(leftTags = [], rightTags = []) {
  const ignored = new Set(["local", "preview", "video", "branch", "motion", "start-frame", "end-frame", "keyframe"]);
  const left = new Set(leftTags.filter((tag) => !ignored.has(tag)));
  const right = new Set(rightTags.filter((tag) => !ignored.has(tag)));
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((tag) => right.has(tag)).length;
  return shared / Math.max(left.size, right.size);
}

export function appendAssetNode(avatar, assetId, node = {}) {
  const next = normalizeAvatarCard(avatar);
  const assetIndex = next.assets.findIndex((asset) => asset.id === assetId);
  if (assetIndex < 0) return next;
  const asset = next.assets[assetIndex];
  const type = ASSET_NODE_TYPES.some((item) => item.id === node.type) ? node.type : ASSET_NODE_TYPES[0].id;
  const createdAt = new Date().toISOString();
  const nextNode = {
    id: node.id || `node-${assetId}-${createdAt.replace(/[^0-9]/g, "")}`,
    type,
    label: String(node.label || ASSET_NODE_TYPES.find((item) => item.id === type)?.label || "Asset node").trim(),
    body: String(node.body || "").trim(),
    source: node.source || "look-book",
    createdAt,
    updatedAt: createdAt
  };
  next.assets[assetIndex] = {
    ...asset,
    metadata: {
      ...(asset.metadata || {}),
      nodes: [
        nextNode,
        ...(Array.isArray(asset.metadata?.nodes) ? asset.metadata.nodes : []).filter((item) => item.id !== nextNode.id)
      ].slice(0, 64)
    }
  };
  next.updatedAt = createdAt;
  next.activity = [
    {
      id: `activity-${Date.now()}`,
      type: "asset-node-appended",
      message: `${nextNode.label} appended to ${asset.name}`,
      at: next.updatedAt
    },
    ...(next.activity || [])
  ].slice(0, 40);
  return next;
}

export function toggleAssetTag(avatar, assetId, tag) {
  const next = normalizeAvatarCard(avatar);
  const asset = next.assets.find((item) => item.id === assetId);
  if (!asset) return next;
  asset.tags = asset.tags.includes(tag)
    ? asset.tags.filter((item) => item !== tag)
    : [...asset.tags, tag];
  next.updatedAt = new Date().toISOString();
  return next;
}

export function tagDefinitionById(tagId) {
  const definition = TAG_DEFINITION_INDEX.get(tagId);
  if (definition) return definition;
  return {
    id: tagId,
    label: humanizeTag(tagId),
    icon: String(tagId || "?").slice(0, 2).toUpperCase(),
    groupId: "custom",
    groupLabel: "Custom",
    groupIcon: "+",
    accent: "cyan"
  };
}

export function tagGroupsForAsset(asset) {
  return TAG_GROUPS.map((group) => tagGroupStatusForAsset(asset, group));
}

export function tagQualityForAsset(asset) {
  const groups = tagGroupsForAsset(asset);
  const requiredGroups = groups.filter((group) => group.required > 0);
  const requiredPoints = requiredGroups.reduce((total, group) => total + group.required, 0);
  const completedPoints = requiredGroups.reduce((total, group) => total + Math.min(group.completed, group.required), 0);
  const percent = requiredPoints ? Math.round((completedPoints / requiredPoints) * 100) : 100;
  const completedGroups = requiredGroups.filter((group) => group.state === "complete").length;
  const partialGroups = requiredGroups.filter((group) => group.state === "partial").length;
  const missingGroups = requiredGroups.filter((group) => group.state === "missing");
  const rank = percent >= 90 ? "A" : percent >= 75 ? "B" : percent >= 55 ? "C" : percent >= 35 ? "D" : "SEED";
  return {
    rank,
    percent,
    completedGroups,
    partialGroups,
    requiredGroups: requiredGroups.length,
    requiredPoints,
    completedPoints,
    missingGroups: missingGroups.map((group) => group.id),
    groups
  };
}

export function auditAvatar(avatar) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const requiredSlots = normalizedAvatar.slots?.filter((slot) => slot.required !== false) || [];
  const filledSlots = requiredSlots.filter((slot) => slot.assetId);
  const byRequirement = MEDIA_REQUIREMENTS.map((requirement) => {
    const slots = requiredSlots.filter((slot) => slot.requirementId === requirement.id);
    const overfill = (normalizedAvatar.slots || []).filter((slot) => slot.requirementId === requirement.id && slot.required === false && slot.assetId);
    const filled = slots.filter((slot) => slot.assetId);
    const missing = slots.filter((slot) => !slot.assetId);
    return {
      id: requirement.id,
      label: requirement.label,
      shortLabel: requirement.shortLabel,
      accent: requirement.accent,
      required: slots.length,
      filled: filled.length,
      missing: missing.length,
      overfill: overfill.length,
      percent: slots.length ? Math.round((filled.length / slots.length) * 100) : 100,
      missingSlots: missing.map((slot) => slot.id)
    };
  });

  const required = requiredSlots.length;
  const filled = filledSlots.length;
  const percent = required ? Math.round((filled / required) * 100) : 100;
  const xp = Math.round(percent * 12.5 + filled * 7);
  const level = Math.max(1, Math.floor(xp / 180) + 1);
  const grade = percent >= 100 ? "complete" : percent >= 72 ? "fieldable" : percent >= 36 ? "seeded" : "scaffold";

  return {
    avatarId: normalizedAvatar.id,
    primaryName: normalizedAvatar.primaryName,
    required,
    filled,
    missing: Math.max(0, required - filled),
    percent,
    xp,
    level,
    grade,
    complete: required > 0 && filled >= required,
    byRequirement,
    missingRequirements: byRequirement.filter((item) => item.missing > 0)
  };
}

export function createHealingPlan(avatar) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const audit = auditAvatar(normalizedAvatar);
  const slotById = new Map((normalizedAvatar.slots || []).map((slot) => [slot.id, slot]));
  return audit.missingRequirements.flatMap((requirement) =>
    requirement.missingSlots.map((slotId, index) => {
      const slot = slotById.get(slotId) || null;
      const variation = healingVariationPlan(normalizedAvatar, slot, requirement.id, index);
      return {
        id: `heal-${normalizedAvatar.id}-${slotId}`,
        avatarId: normalizedAvatar.id,
        slotId,
        requirementId: requirement.id,
        slotLabel: slot?.label || `${requirement.shortLabel} ${index + 1}`,
        preferredTags: slot?.preferredTags || [],
        variation,
        title: `Generate ${requirement.shortLabel} ${index + 1}`,
        priority: requirement.id.includes("fullbody") || requirement.id === "character_dossier" ? "high" : "normal",
        promptHint: promptHintForRequirement(requirement.id, normalizedAvatar),
        status: "queued"
      };
    })
  );
}

export function createHealingQueue(avatar, options = {}) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const audit = auditAvatar(normalizedAvatar);
  const tasks = createHealingPlan(normalizedAvatar);
  const jobs = tasks.map((task, index) => {
    const promptPacket = createHealingPromptPacket(normalizedAvatar, task, options);
    return {
      ...task,
      queueId: `queue-${task.id}`,
      rank: index + 1,
      model: "gpt-image-2",
      codexTool: "image_gen",
      channel: "codex-gpt-image-2",
      referenceCount: promptPacket?.referenceImages.length || 0,
      promptPreview: promptPacket?.prompt.slice(0, 420) || "",
      promptPacket,
      acceptanceCriteria: promptPacket?.acceptanceCriteria || [],
      attachPlan: promptPacket?.attachPlan || null
    };
  });

  return {
    schemaVersion: HEALING_QUEUE_VERSION,
    avatarCardId: normalizedAvatar.id,
    primaryName: normalizedAvatar.primaryName,
    names: normalizedAvatar.names?.map((item) => item.name) || [normalizedAvatar.primaryName],
    status: jobs.length ? "queued" : "complete",
    model: "gpt-image-2",
    codexTool: "image_gen",
    channel: "codex",
    completeness: audit,
    total: jobs.length,
    highPriority: jobs.filter((job) => job.priority === "high").length,
    jobs,
    generatedAt: new Date().toISOString()
  };
}

export function createHealingPromptPacket(avatar, taskOrSelector, options = {}) {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const task = resolveHealingTask(normalizedAvatar, taskOrSelector);
  if (!task) return null;

  const requirement = requirementById(task.requirementId);
  const slot = normalizedAvatar.slots.find((item) => item.id === task.slotId) || null;
  const variation = task.variation || healingVariationPlan(normalizedAvatar, slot, task.requirementId, 0);
  const references = createHealingReferences(normalizedAvatar, task.requirementId, options.referenceLimit || 8);
  const prompt = createHealingPrompt(normalizedAvatar, task, requirement, references, variation, options);
  const preferredTags = unique([
    ...(requirement?.defaultTags || []),
    ...(slot?.preferredTags || task.preferredTags || []),
    ...(variation.tags || [])
  ]);

  return {
    schemaVersion: HEALING_PROMPT_VERSION,
    avatarCardId: normalizedAvatar.id,
    avatarName: normalizedAvatar.primaryName,
    aliases: normalizedAvatar.aliases || normalizedAvatar.names?.map((item) => item.name).filter((name) => name !== normalizedAvatar.primaryName) || [],
    model: "gpt-image-2",
    codexTool: "image_gen",
    channel: "codex",
    job: task,
    target: {
      slotId: task.slotId,
      requirementId: task.requirementId,
      label: requirement?.label || task.requirementId,
      shortLabel: requirement?.shortLabel || task.requirementId,
      accepts: requirement?.accepts || ["image"],
      preferredTags
    },
    variation,
    referencePolicy: healingReferencePolicy(task.requirementId),
    prompt,
    negativePrompt: [
      "Do not add labels, captions, UI, watermarks, logos, or extra characters.",
      "Do not change the avatar identity, face, hair, body type, silhouette, wardrobe family, palette, faction cues, or kit language shown in the references.",
      "Do not crop off feet, hands, gear, or important silhouette edges."
    ],
    referenceImages: references,
    acceptanceCriteria: healingAcceptanceCriteria(task.requirementId),
    attachPlan: {
      avatarId: normalizedAvatar.id,
      slotId: task.slotId,
      requirementId: task.requirementId,
      tags: unique(["generated", "healed", "needs-review", "reference", "gpt-image-2", ...preferredTags]),
      statusAfterAttach: "needs-human-review",
      expectedAssetType: "image",
      registrationTargets: ["avatar-card", "hapa-atlas", "hapa-second-brain"]
    },
    generatedAt: new Date().toISOString()
  };
}

export function createAttachPack(avatar, target = "agent") {
  const normalizedAvatar = normalizeAvatarCard(avatar);
  const audit = auditAvatar(normalizedAvatar);
  const assetById = new Map((normalizedAvatar.assets || []).map((asset) => [asset.id, asset]));
  const slotPresentation = createSlotPresentationMap(normalizedAvatar);
  const refs = (normalizedAvatar.slots || [])
    .filter((slot) => slot.assetId)
    .map((slot) => {
      const asset = assetById.get(slot.assetId);
      const requirement = requirementById(slot.requirementId);
      const presentation = slotPresentation.get(slot.id) || { sectionOrder: null, defaultForSection: false };
      return asset
        ? {
            slotId: slot.id,
            role: requirement?.id || slot.requirementId,
            label: requirement?.label || slot.label,
            sectionOrder: presentation.sectionOrder,
            defaultForSection: presentation.defaultForSection,
            name: asset.name,
            originalFileName: asset.metadata?.originalFileName || asset.metadata?.originalAssetName || null,
            sectionAssetId: asset.metadata?.sectionAssetId || asset.name,
            uri: packUri(asset.uri),
            uriInfo: packUriInfo(asset.uri),
            playbackUri: packUri(backgroundlessPlaybackForAsset(asset).uri || asset.uri),
            playbackUriInfo: packUriInfo(backgroundlessPlaybackForAsset(asset).uri || asset.uri),
            backgroundless: backgroundlessForPack(asset),
            thumbnail: asset.metadata?.thumbnail ? {
              ...asset.metadata.thumbnail,
              uri: packUri(asset.metadata.thumbnail.uri),
              uriInfo: packUriInfo(asset.metadata.thumbnail.uri)
            } : asset.metadata?.thumbnailUri ? {
              uri: packUri(asset.metadata.thumbnailUri),
              uriInfo: packUriInfo(asset.metadata.thumbnailUri)
            } : null,
            type: asset.type,
            tags: asset.tags,
            tagQuality: tagQualityForPack(asset),
            direction: asset.metadata?.direction || null,
            nodes: normalizedAssetNodes(asset),
            overfill: slot.required === false
          }
        : null;
    })
    .filter(Boolean);

  const baseReferences = refs.filter((ref) =>
    ["character_dossier", "fullbody_backgroundless", "backgroundless_two_thirds", "fullbody_concept_art", "closeup_emotions"].includes(ref.role)
  );
  const videoBranches = createVideoBranchReferences(normalizedAvatar);
  const modelReferences = createModelReferences(normalizedAvatar);
  const videoLinks = createVideoTransitionReferences(normalizedAvatar);
  const videoMatchQueue = createVideoFrameMatchQueue(normalizedAvatar, { threshold: 0.9 }).slice(0, 24);

  return {
    schemaVersion: "hapa.avatar-attach-pack.v1",
    avatarCardId: normalizedAvatar.id,
    primaryName: normalizedAvatar.primaryName,
    names: normalizedAvatar.names?.map((item) => item.name) || [normalizedAvatar.primaryName],
    target,
    completeness: audit,
    useGuidance: [
      "Prefer dossier and full-body backgroundless images for identity continuity.",
      "Use close-up emotions for face and acting reference.",
      "Use kit items and kit poses when scene action depends on gear.",
      "Use videoBranches when motion, timing, transition, or camera behavior should follow an existing image state.",
      "Use modelReferences when a 3D scene, rig transfer, pose retarget, or animation preview needs the avatar asset directly.",
      "If a required slot is missing, create a healing task before production use."
    ],
    baseReferences,
    videoBranches,
    videoLinks,
    videoMatchQueue,
    modelReferences,
    mind: createAvatarMindSummary(normalizedAvatar, [normalizedAvatar]),
    stateGraph: createStateGraph(normalizedAvatar, videoBranches, videoLinks),
    allReferences: [...refs, ...modelReferences],
    generatedAt: new Date().toISOString()
  };
}

function resolveHealingTask(avatar, taskOrSelector) {
  if (taskOrSelector && typeof taskOrSelector === "object" && taskOrSelector.slotId) return taskOrSelector;
  const selector = typeof taskOrSelector === "string" ? taskOrSelector : "";
  const tasks = createHealingPlan(avatar);
  if (!selector) return tasks[0] || null;
  return tasks.find((task) => task.id === selector || task.queueId === selector || task.slotId === selector || task.requirementId === selector) || null;
}

function createHealingReferences(avatar, targetRequirementId, limit) {
  const pack = createAttachPack(avatar, "avatar-healing");
  const policy = healingReferencePolicy(targetRequirementId);
  const targetRoles = new Set(policy.roles);
  const preferredOrder = new Map(policy.roles.map((role, index) => [role, index]));
  const candidates = [...(pack.baseReferences || []), ...(pack.allReferences || [])]
    .filter((reference) => reference?.type === "image" && targetRoles.has(reference.role));
  const seen = new Set();
  return candidates
    .filter((reference) => {
      const key = `${reference.slotId}:${reference.uri}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const roleDelta = (preferredOrder.get(a.role) ?? 99) - (preferredOrder.get(b.role) ?? 99);
      if (roleDelta) return roleDelta;
      if (a.defaultForSection !== b.defaultForSection) return a.defaultForSection ? -1 : 1;
      return Number(a.sectionOrder || 99) - Number(b.sectionOrder || 99);
    })
    .slice(0, limit)
    .map((reference, index) => ({
      id: reference.slotId || `reference-${index + 1}`,
      role: reference.role,
      label: reference.label,
      name: reference.name,
      originalFileName: reference.originalFileName || null,
      uri: reference.uri,
      localPathHint: localMediaPathHint(reference.uri),
      uriInfo: {
        ...(reference.uriInfo || {}),
        localPathHint: localMediaPathHint(reference.uri)
      },
      thumbnail: reference.thumbnail || null,
      tags: reference.tags || [],
      direction: reference.direction || null,
      defaultForSection: Boolean(reference.defaultForSection),
      reason: healingReferenceReason(reference.role, targetRequirementId)
    }));
}

function createHealingPrompt(avatar, task, requirement, references, variation, options) {
  const names = avatar.names?.map((item) => item.name).filter(Boolean).join(" / ") || avatar.primaryName;
  const shotSpec = healingShotSpec(task.requirementId, task.slotId);
  const referenceList = references.length
    ? references.map((reference, index) => `${index + 1}. ${reference.role}: ${reference.name} (${reference.reason}; ${reference.localPathHint || reference.uri})`).join("\n")
    : "No local references were available; follow the avatar dossier text and Hapa style rules.";

  return [
    `Use GPT Image 2 via Codex image_gen to heal one missing Hapa Avatar Builder media slot.`,
    `Avatar: ${names}. Primary name: ${avatar.primaryName}.`,
    `Missing slot: ${task.slotId} / ${requirement?.label || task.requirementId}.`,
    `Aesthetic: Hapa NeonBlade+ modern cyber interface production art, cinematic sci-fi clarity, high-detail but practical for agents, humans, comics, and video reference workflows.`,
    `Identity contract: preserve the avatar identity from the supplied references. Keep the same face family, hair, body proportions, silhouette cues, wardrobe family, palette, faction/iconography cues, and kit language shown in the reference set. Do not import visual details from another avatar.`,
    `Shot contract: ${shotSpec}`,
    `Variation directive: ${variation.directive}`,
    `Pose compliance: treat the variation directive as a hard requirement. If the target is three-quarter, profile, back, action, T-pose, or scale, the output must visibly differ from the nearest existing reference and from a straight front neutral stance.`,
    `Duplicate avoidance: ${variation.duplicateAvoidance}`,
    `Composition: one clean production-ready image, readable silhouette, consistent lighting, no text, no watermarks, no UI, no extra characters.`,
    `Reference set to use:\n${referenceList}`,
    options.extraInstruction ? `Extra instruction: ${options.extraInstruction}` : "",
    `Return exactly one finished image suitable to attach back to ${task.slotId}.`
  ].filter(Boolean).join("\n\n");
}

function healingReferencePolicy(requirementId) {
  const profiles = {
    character_dossier: ["character_dossier", "closeup_emotions", "backgroundless_two_thirds", "fullbody_backgroundless", "fullbody_concept_art", "kit_sheet", "kit_poses"],
    kit_sheet: ["kit_sheet", "kit_items", "kit_poses", "fullbody_backgroundless", "character_dossier", "backgroundless_two_thirds", "fullbody_concept_art"],
    kit_poses: ["kit_poses", "fullbody_backgroundless", "kit_sheet", "kit_items", "character_dossier", "backgroundless_two_thirds", "fullbody_concept_art"],
    kit_items: ["kit_sheet", "kit_items", "kit_poses", "character_dossier", "fullbody_backgroundless", "backgroundless_two_thirds"],
    closeup_emotions: ["closeup_emotions", "character_dossier", "backgroundless_two_thirds", "fullbody_backgroundless", "closeup_backgrounds", "fullbody_concept_art"],
    closeup_backgrounds: ["closeup_backgrounds", "closeup_emotions", "character_dossier", "fullbody_concept_art", "backgroundless_two_thirds", "fullbody_backgroundless"],
    fullbody_backgroundless: ["fullbody_backgroundless", "character_dossier", "backgroundless_two_thirds", "kit_poses", "kit_sheet", "fullbody_concept_art", "closeup_emotions"],
    backgroundless_two_thirds: ["backgroundless_two_thirds", "closeup_emotions", "character_dossier", "fullbody_backgroundless", "fullbody_concept_art"],
    fullbody_concept_art: ["fullbody_concept_art", "fullbody_backgroundless", "backgroundless_two_thirds", "character_dossier", "closeup_backgrounds", "closeup_emotions", "kit_poses"]
  };
  const roles = profiles[requirementId] || [requirementId, "character_dossier", "fullbody_backgroundless", "closeup_emotions", "fullbody_concept_art"];
  return {
    targetRequirementId: requirementId,
    roles,
    rule: "Use the earliest roles first; same-section continuity is valuable, but identity references must stay in the packet when available."
  };
}

function healingVariationPlan(avatar, slot, requirementId, fallbackIndex = 0) {
  const slotOrder = slotOrderFromId(slot?.id) || fallbackIndex + 1;
  const preferredTags = slot?.preferredTags?.length ? slot.preferredTags : fallbackTagsForRequirement(requirementId, slotOrder);
  const primaryTag = preferredTags[0] || requirementId;
  const readable = primaryTag.replace(/-/g, " ");
  const directive = variationDirectiveFor(requirementId, primaryTag, slotOrder, avatar);
  return {
    id: `${requirementId}-${slotOrder}-${primaryTag}`,
    slotOrder,
    primaryTag,
    tags: unique(preferredTags),
    label: readable,
    directive,
    duplicateAvoidance: `Do not simply redraw an existing reference. Preserve identity and design language, but make this slot recognizably distinct as the ${readable} variation for ${slot?.id || requirementId}.`
  };
}

function fallbackTagsForRequirement(requirementId, slotOrder) {
  const requirement = requirementById(requirementId);
  const defaults = requirement?.defaultTags || [];
  if (!defaults.length) return [];
  const index = Math.max(0, (slotOrder - 1) % defaults.length);
  return defaults.slice(index, index + 1);
}

function variationDirectiveFor(requirementId, tag, slotOrder, avatar) {
  const name = avatar.primaryName || "the avatar";
  const directives = {
    fullbody_backgroundless: {
      front: `Create a front-facing full-body production reference for ${name}, neutral stance, arms relaxed, both boots visible.`,
      "three-quarter-left": `Create a three-quarter-left full-body stance for ${name}: shoulders, hips, and feet rotated 45-60 degrees toward the viewer's left, near side dominant, readable face, hands visible.`,
      "profile-left": `Create a strict left profile full-body reference for ${name}: body rotated 90 degrees side-on, nose/chest/feet pointing left, posture upright, silhouette clear.`,
      "profile-right": `Create a strict right profile full-body reference for ${name}: body rotated 90 degrees side-on, nose/chest/feet pointing right, posture upright, silhouette clear.`,
      back: `Create a full-body rear view for ${name}: back of hair, robe/outfit, shoulder details, and rear silhouette readable; face mostly hidden or only slight turn.`,
      "t-pose": `Create a rigging-friendly relaxed T-pose or A-pose for ${name}: arms extended or slightly lowered symmetrically, feet flat, front-on modeling reference.`,
      relaxed: `Create a relaxed standing full-body reference for ${name}, natural idle posture, arms lowered, no weapon raised.`,
      action: `Create a dynamic but clean action-ready full-body reference for ${name}, readable pose and no cropped limbs.`,
      scale: `Create a scale/reference full-body stance for ${name}, straight readable posture, feet grounded, full outfit visible.`
    },
    closeup_emotions: {
      neutral: `Create a neutral close-up expression for ${name}, eyes readable, mouth relaxed.`,
      happy: `Create a happy close-up expression for ${name}, warm smile while keeping identity stable.`,
      sad: `Create a sad close-up expression for ${name}, softened eyes and subdued mouth.`,
      angry: `Create an angry close-up expression for ${name}, controlled intensity rather than caricature.`,
      concerned: `Create a concerned close-up expression for ${name}, alert eyes and tense face.`,
      focused: `Create a focused close-up expression for ${name}, determined gaze and composed mouth.`
    },
    closeup_backgrounds: {
      city: `Create a close-up of ${name} in cinematic city lighting, face readable with useful urban context.`,
      vehicle: `Create a close-up of ${name} inside or near a vehicle/cockpit setting, face readable.`,
      night: `Create a close-up of ${name} in night lighting, readable face, restrained neon/cyber atmosphere.`,
      interior: `Create a close-up of ${name} in an interior operations setting, face readable and environment useful.`
    },
    backgroundless_two_thirds: {
      "two-thirds": `Create a two-thirds body reference for ${name}, cropped around thigh/knee, face and torso readable.`,
      backgroundless: `Create a clean no-background two-thirds reference for ${name}, production friendly, high detail.`,
      "high-def": `Create a high-definition two-thirds reference for ${name}, crisp face, armor, and upper body details.`
    },
    fullbody_concept_art: {
      cinematic: `Create cinematic full-body concept art for ${name}, full silhouette visible with story lighting.`,
      battlefield: `Create full-body concept art for ${name} in a battlefield or conflict environment, pose readable.`,
      urban: `Create full-body concept art for ${name} in an urban cyber setting, full silhouette visible.`,
      vehicle: `Create full-body concept art for ${name} near or with vehicle context, full silhouette visible.`
    },
    kit_poses: {
      front: `Create a front kit pose for ${name}, gear placement readable, full body visible.`,
      side: `Create a side kit pose for ${name}, carried equipment and silhouette readable.`,
      action: `Create an action kit pose for ${name}, showing gear in use without losing readable body shape.`,
      ready: `Create a ready kit pose for ${name}, alert posture, hands and tools visible.`
    },
    kit_items: {
      weapon: `Create one isolated weapon/tool kit item that belongs to ${name}, clean production sheet style.`,
      comms: `Create one isolated comms/electronics kit item that belongs to ${name}, clean production sheet style.`,
      bag: `Create one isolated bag/pack kit item that belongs to ${name}, clean production sheet style.`,
      gloves: `Create one isolated gloves/handwear kit item that belongs to ${name}, clean production sheet style.`,
      boots: `Create one isolated boots/footwear kit item that belongs to ${name}, clean production sheet style.`,
      battery: `Create one isolated battery/power-cell kit item that belongs to ${name}, clean production sheet style.`,
      sensor: `Create one isolated sensor/scanner kit item that belongs to ${name}, clean production sheet style.`,
      prop: `Create one isolated prop kit item that belongs to ${name}, clean production sheet style.`,
      tool: `Create one isolated utility tool kit item that belongs to ${name}, clean production sheet style.`
    }
  };
  if (directives[requirementId]?.[tag]) return directives[requirementId][tag];
  if (requirementId === "character_dossier") return `Create a compact character dossier reference for ${name}, focused on identity, face, silhouette, and canon visual rules.`;
  if (requirementId === "kit_sheet") return `Create a compact kit sheet for ${name}, showing the core equipment, materials, and item affordances.`;
  return `Create variation ${slotOrder} for ${name}, using ${tag.replace(/-/g, " ")} as the distinct slot intent.`;
}

function slotOrderFromId(slotId = "") {
  const match = String(slotId).match(/-(\d+)$/);
  return match ? Number(match[1]) : null;
}

function localMediaPathHint(uri) {
  if (typeof uri !== "string" || !uri.startsWith("/media/")) return null;
  return `data${uri}`;
}

function healingShotSpec(requirementId, slotId) {
  if (requirementId === "fullbody_backgroundless") {
    return "Create a head-to-toe full-body backgroundless-style reference on a clean white or very light neutral background. Include feet, hands, outfit, gear silhouette, and enough margin for downstream masking. Use a distinct useful pose from the existing full-body set.";
  }
  if (requirementId === "backgroundless_two_thirds") {
    return "Create a high-detail two-thirds body reference on a clean white or very light neutral background. Keep the upper body, face, torso armor, arms, and pose readable for scene reference.";
  }
  if (requirementId === "closeup_emotions") {
    return "Create a close-up portrait emotion reference with face and expression clearly readable. Keep the head/cap/hair identity stable and use a neutral production background.";
  }
  if (requirementId === "closeup_backgrounds") {
    return "Create a close-up portrait embedded in cinematic environment lighting, with the face still readable and the background useful as scene context.";
  }
  if (requirementId === "fullbody_concept_art") {
    return "Create a cinematic full-body concept image with environment context, full silhouette visible, and strong story lighting.";
  }
  if (requirementId === "kit_poses") {
    return "Create a full-body kit pose showing how the avatar carries or uses gear. Keep pose, hands, and equipment readable.";
  }
  if (requirementId === "kit_items") {
    return "Create a clean production sheet for one kit item or prop, isolated enough for reuse and agent reference.";
  }
  if (requirementId === "character_dossier") {
    return "Create a compact character dossier-style reference sheet with identity, pose, face, and silhouette cues.";
  }
  if (requirementId === "kit_sheet") {
    return "Create a compact kit sheet showing gear, wardrobe materials, props, and item affordances.";
  }
  return `Create the missing production image for ${slotId}.`;
}

function healingAcceptanceCriteria(requirementId) {
  const shared = [
    "Identity matches existing avatar references.",
    "Image is useful as a production reference for humans and agents.",
    "No visible text, watermark, logo, or extra character.",
    "Can be attached to the Avatar Card and marked needs-review."
  ];
  if (["fullbody_backgroundless", "kit_poses", "fullbody_concept_art"].includes(requirementId)) {
    return ["Full body is visible without cropped feet or head.", ...shared];
  }
  if (["closeup_emotions", "closeup_backgrounds", "backgroundless_two_thirds"].includes(requirementId)) {
    return ["Face and head silhouette are readable at thumbnail size.", ...shared];
  }
  return shared;
}

function healingReferenceReason(role, targetRequirementId) {
  if (role === targetRequirementId) return "same-section continuity";
  if (role === "character_dossier") return "identity and canon";
  if (role === "closeup_emotions") return "face and expression continuity";
  if (role === "fullbody_backgroundless") return "silhouette, pose, and wardrobe continuity";
  if (role === "backgroundless_two_thirds") return "high-detail body and face continuity";
  if (role === "fullbody_concept_art") return "cinematic mood and outfit continuity";
  if (role === "kit_sheet") return "gear and item continuity";
  if (role === "kit_poses") return "action posture and kit use";
  return "avatar continuity";
}

function createVideoBranchReferences(avatar) {
  const assetById = new Map((avatar.assets || []).map((asset) => [asset.id, asset]));
  return (avatar.assets || [])
    .filter((asset) => asset.type === "video")
    .map((video) => {
      const parentId = video.parentAssetId || video.state?.startFrameAssetId;
      const parent = assetById.get(parentId);
      return {
        id: video.id,
        name: video.name,
        uri: packUri(video.uri),
        uriInfo: packUriInfo(video.uri),
        playbackUri: packUri(backgroundlessPlaybackForAsset(video).uri || video.uri),
        playbackUriInfo: packUriInfo(backgroundlessPlaybackForAsset(video).uri || video.uri),
        backgroundless: backgroundlessForPack(video),
        type: video.type,
        tags: video.tags,
        tagQuality: tagQualityForPack(video),
        parentAssetId: parentId,
        frames: normalizeVideoFrames(video.metadata?.frames || video.state?.keyframes || []).map(frameForPack),
        startFrame: parent
          ? {
              id: parent.id,
              name: parent.name,
              uri: packUri(parent.uri),
              uriInfo: packUriInfo(parent.uri),
              thumbnail: parent.metadata?.thumbnail ? {
                ...parent.metadata.thumbnail,
                uri: packUri(parent.metadata.thumbnail.uri),
                uriInfo: packUriInfo(parent.metadata.thumbnail.uri)
              } : parent.metadata?.thumbnailUri ? {
                uri: packUri(parent.metadata.thumbnailUri),
                uriInfo: packUriInfo(parent.metadata.thumbnailUri)
              } : null,
              role: parent.requirementId,
              tags: parent.tags,
              tagQuality: tagQualityForPack(parent),
              direction: parent.metadata?.direction || null,
              nodes: normalizedAssetNodes(parent)
            }
          : null,
        nodes: normalizedAssetNodes(video),
        state: video.state || null,
        metadata: video.metadata || {}
      };
    });
}

function createVideoTransitionReferences(avatar) {
  const assetById = new Map((avatar.assets || []).map((asset) => [asset.id, asset]));
  const links = [];
  for (const video of avatar.assets || []) {
    if (video.type !== "video") continue;
    const frames = normalizeVideoFrames(video.metadata?.frames || video.state?.keyframes || []);
    for (const link of video.state?.outLinks || []) {
      const target = assetById.get(link.targetAssetId);
      const sourceFrame = frames.find((frame) => frame.marker === link.fromFrame) ||
        frames.find((frame) => frame.id === link.fromFrameAssetId) ||
        frames.find((frame) => frame.marker === "last") ||
        frames.at(-1) ||
        null;
      const targetFrameAsset = link.targetFrameUri
        ? {
            id: link.targetFrameAssetId || `${link.targetAssetId}-${link.targetFrame || "target"}`,
            marker: link.targetFrame || target?.type || "target",
            uri: packUri(link.targetFrameUri),
            uriInfo: packUriInfo(link.targetFrameUri)
          }
        : null;
      links.push({
        id: link.id,
        fromAssetId: video.id,
        fromName: video.name,
        fromFrame: link.fromFrame || sourceFrame?.marker || "last",
        fromFrameAsset: sourceFrame ? frameForPack(sourceFrame) : null,
        targetAssetId: link.targetAssetId,
        targetName: target?.name || link.targetName,
        targetAssetType: target?.type || link.targetAssetType,
        targetRequirementId: target?.requirementId || link.targetRequirementId,
        targetFrame: link.targetFrame || null,
        targetFrameAsset,
        linkType: link.linkType,
        humanLabel: link.humanLabel || "",
        reason: link.reason || "",
        agentInstruction: link.agentInstruction || "",
        createdAt: link.createdAt || null,
        updatedAt: link.updatedAt || null
      });
    }
  }
  return links;
}

function frameForPack(frame) {
  return {
    id: frame.id,
    marker: frame.marker,
    label: frame.label,
    time: frame.time,
    uri: packUri(frame.uri),
    uriInfo: packUriInfo(frame.uri),
    thumbnail: frame.thumbnail ? {
      ...frame.thumbnail,
      uri: packUri(frame.thumbnail.uri),
      uriInfo: packUriInfo(frame.thumbnail.uri)
    } : null,
    width: frame.width,
    height: frame.height,
    mimeType: frame.mimeType
  };
}

function createModelReferences(avatar) {
  return (avatar.assets || [])
    .filter((asset) => asset.type === "model" || asset.requirementId === AVATAR_MODEL_REQUIREMENT_ID)
    .map((asset) => ({
      id: asset.id,
      role: AVATAR_MODEL_REQUIREMENT_ID,
      label: AVATAR_MODEL_REQUIREMENT.label,
      name: asset.name,
      uri: packUri(asset.uri),
      uriInfo: packUriInfo(asset.uri),
      type: asset.type,
      tags: asset.tags || [],
      tagQuality: tagQualityForPack(asset),
      direction: asset.metadata?.direction || null,
      active: asset.state?.active === true,
      nodes: normalizedAssetNodes(asset),
      state: asset.state || null,
      model: asset.metadata?.model || null,
      metadata: {
        mimeType: asset.metadata?.mimeType,
        sizeBytes: asset.metadata?.sizeBytes,
        originalFileName: asset.metadata?.originalFileName,
        storage: asset.metadata?.storage || null
      }
    }));
}

function tagQualityForPack(asset) {
  const quality = tagQualityForAsset(asset);
  return {
    rank: quality.rank,
    percent: quality.percent,
    completedGroups: quality.completedGroups,
    partialGroups: quality.partialGroups,
    requiredGroups: quality.requiredGroups,
    missingGroups: quality.missingGroups,
    groups: quality.groups
      .filter((group) => group.required > 0 || group.matches.length > 0)
      .map((group) => ({
        id: group.id,
        label: group.label,
        state: group.state,
        required: group.required,
        completed: group.completed,
        missing: group.missing,
        percent: group.percent,
        matches: group.matches.map((tag) => tag.id)
      }))
  };
}

function backgroundlessForPack(asset = {}) {
  const playback = backgroundlessPlaybackForAsset(asset);
  if (!playback.state) return null;
  return {
    schemaVersion: BACKGROUNDLESS_VIDEO_VERSION,
    status: playback.status,
    ready: playback.ready,
    hasAlpha: playback.hasAlpha,
    sourceUri: packUri(playback.sourceUri),
    sourceUriInfo: packUriInfo(playback.sourceUri),
    uri: playback.ready ? packUri(playback.uri) : null,
    uriInfo: playback.ready ? packUriInfo(playback.uri) : null,
    preferredUri: playback.ready ? packUri(playback.uri) : null,
    posterUri: playback.posterUri ? packUri(playback.posterUri) : null,
    variantCount: playback.state.variants?.length || 0,
    taskId: playback.state.taskId || null,
    sourceVideoHash: playback.state.sourceVideoHash || null,
    backend: playback.state.backend || null,
    keyer: playback.state.keyer || null,
    codec: playback.state.codec || null,
    updatedAt: playback.state.updatedAt || null
  };
}

function packUri(uri) {
  if (typeof uri !== "string") return uri;
  if (uri.startsWith("data:") && uri.length > 512) {
    return `${uri.slice(0, 96)}... [inline media omitted: ${uri.length.toLocaleString()} chars]`;
  }
  return uri;
}

function packUriInfo(uri) {
  if (typeof uri !== "string") return null;
  if (uri.startsWith("data:")) {
    return {
      kind: "inline-data",
      compacted: uri.length > 512,
      length: uri.length
    };
  }
  if (uri.startsWith("/media/")) {
    return {
      kind: "local-media-file",
      compacted: false
    };
  }
  return {
    kind: "uri",
    compacted: false
  };
}

function createStateGraph(avatar, videoBranches, videoLinks = []) {
  const branchMap = new Map();
  for (const branch of videoBranches) {
    if (!branch.parentAssetId) continue;
    if (!branchMap.has(branch.parentAssetId)) branchMap.set(branch.parentAssetId, []);
    branchMap.get(branch.parentAssetId).push(branch.id);
  }
  const incomingEndLinks = new Map();
  for (const link of videoLinks) {
    if (!link.targetAssetId) continue;
    if (!incomingEndLinks.has(link.targetAssetId)) incomingEndLinks.set(link.targetAssetId, []);
    incomingEndLinks.get(link.targetAssetId).push(link.id);
  }
  return (avatar.assets || [])
    .filter((asset) => asset.type === "image")
    .filter((asset) => branchMap.has(asset.id) || incomingEndLinks.has(asset.id))
    .map((asset) => ({
      assetId: asset.id,
      name: asset.name,
      role: asset.requirementId,
      tags: asset.tags,
      tagQuality: tagQualityForPack(asset),
      direction: asset.metadata?.direction || null,
      nodes: normalizedAssetNodes(asset),
      videoBranchIds: branchMap.get(asset.id) || [],
      incomingEndLinkIds: incomingEndLinks.get(asset.id) || []
    }));
}

function normalizedAssetNodes(asset = {}) {
  return (Array.isArray(asset.metadata?.nodes) ? asset.metadata.nodes : [])
    .filter((node) => node && (node.body || node.label))
    .map((node) => ({
      id: node.id,
      type: node.type || "route-note",
      label: node.label || "Asset node",
      body: node.body || "",
      source: node.source || "manual",
      createdAt: node.createdAt || null,
      updatedAt: node.updatedAt || null
    }));
}

export function createKanbanFromAudit(avatar) {
  const healingPlan = createHealingPlan(avatar);
  const audit = auditAvatar(avatar);
  return [
    {
      id: "avatar-ready",
      title: "Ready",
      accent: "green",
      cards: audit.byRequirement
        .filter((item) => item.percent === 100)
        .map((item) => ({
          id: `ready-${item.id}`,
          title: item.label,
          status: "done",
          body: `${item.filled}/${item.required} slots filled.`
        }))
    },
    {
      id: "avatar-tagging",
      title: "Needs Sorting",
      accent: "fuchsia",
      cards: audit.byRequirement
        .filter((item) => item.percent > 0 && item.percent < 100)
        .map((item) => ({
          id: `sort-${item.id}`,
          title: item.label,
          status: "active",
          body: `${item.missing} slots still need media or tags.`
        }))
    },
    {
      id: "avatar-healing",
      title: "Healing Queue",
      accent: "orange",
      cards: healingPlan.slice(0, 16).map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        body: task.promptHint,
        priority: task.priority
      }))
    }
  ];
}

function promptHintForRequirement(requirementId, avatar) {
  const name = avatar.primaryName || "the avatar";
  const hints = {
    character_dossier: `Create a clean dossier sheet for ${name}: identity, silhouette, palette, face, wardrobe, and notes.`,
    kit_sheet: `Create a kit sheet for ${name}: all primary gear, tools, props, skills, labels, and usage notes.`,
    kit_poses: `Generate a full-body kit pose for ${name} showing gear in use on a neutral background.`,
    kit_items: `Generate one isolated kit item for ${name} with transparent or clean background and readable silhouette.`,
    closeup_emotions: `Generate a close-up facial expression for ${name} while preserving face, hat, hair, and costume continuity.`,
    closeup_backgrounds: `Generate a close-up of ${name} in a scene background with cinematic lighting.`,
    fullbody_backgroundless: `Generate a full-body backgroundless reference for ${name}, clean lighting, consistent outfit, production-friendly.`,
    backgroundless_two_thirds: `Generate a high-detail backgroundless two-thirds reference for ${name}, preserving face, wardrobe, and upper-body silhouette continuity.`,
    fullbody_concept_art: `Generate full-body concept art for ${name} in a cinematic environment with clear pose and outfit continuity.`
  };
  return hints[requirementId] || `Generate missing avatar media for ${name}.`;
}

function normalizeVideoFrames(frames) {
  const allowed = new Set(VIDEO_FRAME_MARKERS.map((marker) => marker.id));
  return (Array.isArray(frames) ? frames : [])
    .filter((frame) => frame && allowed.has(frame.marker) && frame.uri)
    .map((frame) => ({
      id: frame.id || `frame-${frame.marker}`,
      marker: frame.marker,
      label: frame.label || VIDEO_FRAME_MARKERS.find((item) => item.id === frame.marker)?.label || frame.marker,
      role: frame.role || VIDEO_FRAME_MARKERS.find((item) => item.id === frame.marker)?.role || "video-frame",
      time: Number.isFinite(Number(frame.time)) ? Number(frame.time) : null,
      uri: frame.uri,
      width: Number.isFinite(Number(frame.width)) ? Number(frame.width) : null,
      height: Number.isFinite(Number(frame.height)) ? Number(frame.height) : null,
      mimeType: frame.mimeType || "image/jpeg",
      storage: frame.storage || null,
      thumbnail: frame.thumbnail || null,
      fingerprint: frame.fingerprint || null,
      createdAt: frame.createdAt || null
    }));
}

function applySectionAssetLabels(avatar) {
  const assetById = new Map((avatar.assets || []).map((asset) => [asset.id, asset]));
  for (const requirement of MEDIA_REQUIREMENTS) {
    const filledSlots = sectionDisplaySlots(avatar.slots, requirement.id).filter(({ slot }) => slot.assetId);
    filledSlots.forEach(({ slot }, index) => {
      const asset = assetById.get(slot.assetId);
      if (!asset || asset.type !== "image") return;
      const order = index + 1;
      const sectionAssetId = `${slugify(requirement.label)}-image-${order}`;
      const originalFileName = asset.metadata?.originalFileName || asset.metadata?.originalAssetName || asset.name;
      asset.name = sectionAssetId;
      asset.metadata = {
        ...(asset.metadata || {}),
        originalFileName,
        originalAssetName: originalFileName,
        sectionAssetId,
        sectionLabel: sectionAssetId,
        sectionName: requirement.label,
        sectionRequirementId: requirement.id,
        sectionOrder: order,
        defaultForSection: order === 1
      };
      asset.processing = {
        ...(asset.processing || {}),
        slotId: slot.id,
        sectionOrder: order,
        defaultForSection: order === 1
      };
    });
  }
}

function reconcileAvatarSlots(avatar) {
  const assetIds = new Set((avatar.assets || []).filter((asset) => asset?.id).map((asset) => asset.id));
  const seenSlotAssetIds = new Set();
  avatar.slots = (avatar.slots || [])
    .map((slot) => {
      if (!slot.assetId) return slot;
      if (!assetIds.has(slot.assetId) || seenSlotAssetIds.has(slot.assetId)) {
        return { ...slot, assetId: null };
      }
      seenSlotAssetIds.add(slot.assetId);
      return slot;
    })
    .filter((slot) => !(slot.required === false && !slot.assetId));

  const slottedAssetIds = new Set((avatar.slots || []).filter((slot) => slot.assetId).map((slot) => slot.assetId));
  for (const asset of avatar.assets || []) {
    if (!asset?.id || slottedAssetIds.has(asset.id)) continue;
    const requirement = requirementById(asset.requirementId || asset.metadata?.sectionRequirementId);
    if (!requirement || !asset.processing?.attachedToCard || !requirement.accepts.includes(asset.type)) continue;

    let slotIndex = avatar.slots.findIndex((slot) =>
      slot.requirementId === requirement.id && slot.required !== false && !slot.assetId
    );
    if (slotIndex < 0) {
      const overfillCount = avatar.slots.filter((slot) => slot.requirementId === requirement.id && slot.required === false).length;
      avatar.slots.push({
        id: `${requirement.id}-overfill-${Date.now()}-${overfillCount + 1}`,
        requirementId: requirement.id,
        label: `${requirement.shortLabel || "Asset"} overfill ${overfillCount + 1}`,
        required: false,
        overfill: true,
        assetId: null,
        preferredTags: requirement.defaultTags || []
      });
      slotIndex = avatar.slots.length - 1;
    }

    avatar.slots[slotIndex] = { ...avatar.slots[slotIndex], assetId: asset.id };
    asset.requirementId = requirement.id;
    asset.processing = {
      ...(asset.processing || {}),
      slotId: avatar.slots[slotIndex].id,
      attachedToCard: true
    };
    slottedAssetIds.add(asset.id);
  }
}

function createSlotPresentationMap(avatar) {
  const map = new Map();
  for (const requirement of MEDIA_REQUIREMENTS) {
    const filledSlots = sectionDisplaySlots(avatar.slots, requirement.id).filter(({ slot }) => slot.assetId);
    filledSlots.forEach(({ slot }, index) => {
      map.set(slot.id, {
        sectionOrder: index + 1,
        defaultForSection: index === 0
      });
    });
  }
  return map;
}

function sectionDisplaySlots(slots = [], requirementId) {
  return (slots || [])
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.requirementId === requirementId)
    .sort((a, b) => Number(a.slot.required === false) - Number(b.slot.required === false) || a.index - b.index);
}

function ensureRequirementCapacity(avatar, requirementId, assetCount) {
  const requirement = requirementById(requirementId);
  if (!requirement) return;
  while (sectionDisplaySlots(avatar.slots, requirementId).length < assetCount) {
    const overfillCount = avatar.slots.filter((slot) => slot.requirementId === requirementId && slot.required === false).length;
    avatar.slots.push({
      id: `${requirementId}-overfill-${Date.now()}-${overfillCount + 1}`,
      requirementId,
      label: `${requirement.shortLabel || "Asset"} overfill ${overfillCount + 1}`,
      required: false,
      overfill: true,
      assetId: null,
      preferredTags: requirement.defaultTags || []
    });
  }
}

function tagGroupStatusForAsset(asset = {}, group) {
  const assetTags = new Set(asset.tags || []);
  const required = requiredCountForTagGroup(group, asset);
  const directMatches = group.tags
    .filter((tag) => assetTags.has(tag.id))
    .map((tag) => ({
      id: tag.id,
      label: tag.label,
      icon: tag.icon,
      source: "tag"
    }));
  const syntheticMatches = syntheticTagMatchesForGroup(asset, group);
  const matchesById = new Map([...directMatches, ...syntheticMatches].map((tag) => [tag.id, tag]));
  const matches = [...matchesById.values()];
  const completed = group.id === "direction"
    ? directionCompletionCount(asset, matches)
    : matches.length;
  const state = required === 0
    ? matches.length > 0 ? "complete" : "optional"
    : completed >= required ? "complete" : completed > 0 ? "partial" : "missing";
  const missing = Math.max(0, required - Math.min(completed, required));
  const percent = required ? Math.round((Math.min(completed, required) / required) * 100) : matches.length ? 100 : 0;
  return {
    id: group.id,
    label: group.label,
    shortLabel: group.shortLabel,
    icon: group.icon,
    accent: group.accent,
    description: group.description,
    required,
    completed: Math.min(completed, required || completed),
    missing,
    percent,
    state,
    tags: group.tags,
    matches
  };
}

function requiredCountForTagGroup(group, asset = {}) {
  const byRequirement = group.requiredByRequirement?.[asset.requirementId];
  if (Number.isFinite(byRequirement)) return byRequirement;
  const byType = group.requiredByType?.[asset.type];
  if (Number.isFinite(byType)) return byType;
  return Number.isFinite(group.required) ? group.required : 0;
}

function syntheticTagMatchesForGroup(asset = {}, group) {
  if (group.id === "direction") {
    const direction = asset.metadata?.direction || {};
    return DIRECTION_CHANNELS.flatMap((channel) => {
      const value = direction[channel.id] || directionalTagValue(asset.tags, channel.id);
      if (!value) return [];
      const definition = tagDefinitionById(value);
      return [{
        id: `${channel.id}:${value}`,
        label: `${channel.label}: ${definition.label}`,
        icon: channel.id.slice(0, 1).toUpperCase(),
        source: "direction"
      }];
    });
  }
  if (group.id === "lineage" && asset.source) {
    return [{
      id: `source:${asset.source}`,
      label: `Source: ${asset.source}`,
      icon: "SO",
      source: "metadata"
    }];
  }
  if (group.id === "model" && asset.metadata?.model) {
    return [{
      id: "model:inspected",
      label: "Model inspected",
      icon: "MI",
      source: "metadata"
    }];
  }
  return [];
}

function directionalTagValue(tags = [], channelId) {
  const prefix = `${channelId}:`;
  const match = (tags || []).find((tag) => tag.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function directionCompletionCount(asset = {}, matches = []) {
  const direction = asset.metadata?.direction || {};
  const channelCount = DIRECTION_CHANNELS.filter((channel) => direction[channel.id] || directionalTagValue(asset.tags, channel.id)).length;
  if (channelCount > 0) return channelCount;
  return Math.min(matches.length, 1);
}

function humanizeTag(tagId) {
  return String(tagId || "")
    .replace(/[:_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizePersonaAnchor(anchor = {}, avatar = {}) {
  const safeAnchor = anchor && typeof anchor === "object" ? anchor : {};
  return {
    identityStatement: stringValue(safeAnchor.identityStatement, avatar.summary || ""),
    wants: stringValue(safeAnchor.wants),
    fears: stringValue(safeAnchor.fears),
    misunderstandings: stringValue(safeAnchor.misunderstandings || safeAnchor.whatTheAvatarMisunderstands),
    willNotSayDirectly: stringValue(safeAnchor.willNotSayDirectly || safeAnchor.whatTheAvatarWillNotSayDirectly),
    carriedForward: stringValue(safeAnchor.carriedForward || safeAnchor.whatShouldBePaidOffLater),
    updatedAt: safeAnchor.updatedAt || avatar.updatedAt || new Date().toISOString()
  };
}

function normalizeMindCollection(items, normalizer, prefix) {
  const source = Array.isArray(items) ? items : [];
  return source.map((item, index) => normalizer(item, `${prefix}-${index + 1}`));
}

function normalizeMindObject(record = null) {
  return record && typeof record === "object" ? clone(record) : null;
}

function normalizeMindPassthroughRecord(record = {}, fallbackId = "record") {
  const source = record && typeof record === "object" ? clone(record) : {};
  return {
    ...source,
    id: stringValue(source.id, createMindId(fallbackId))
  };
}

function normalizeMindFact(fact = {}, fallbackId = "fact") {
  const now = new Date().toISOString();
  const source = fact && typeof fact === "object" ? fact : {};
  return {
    id: stringValue(source.id, createMindId(fallbackId)),
    label: stringValue(source.label || source.summary, "Untitled fact"),
    value: stringValue(source.value || source.detail || source.summary),
    classification: selectValue(source.classification, MIND_FACT_CLASSIFICATIONS, "soft_canon"),
    confidence: selectValue(source.confidence, MIND_CONFIDENCE_LEVELS, "soft"),
    visibility: selectValue(source.visibility, MIND_VISIBILITY_LEVELS, "private"),
    source: stringValue(source.source, "manual"),
    status: stringValue(source.status, source.classification === "tombstone" ? "tombstone" : "active"),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now
  };
}

function normalizeSoulSeed(seed = {}, avatar = {}) {
  const now = new Date().toISOString();
  const source = seed && typeof seed === "object" ? seed : {};
  const createdAt = source.createdAt || source.created_at || now;
  return {
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-soul-seed.v1"),
    avatarId: stringValue(source.avatarId || source.avatar_id, avatar.id || ""),
    avatarName: stringValue(source.avatarName || source.avatar_name, avatar.primaryName || avatar.names?.[0]?.name || ""),
    runId: stringValue(source.runId || source.run_id),
    soulThesis: stringValue(source.soulThesis || source.soul_thesis),
    publicConcept: stringValue(source.publicConcept || source.public_concept),
    privateTruth: stringValue(source.privateTruth || source.private_truth),
    formativeWound: stringValue(source.formativeWound || source.formative_wound),
    coreWant: stringValue(source.coreWant || source.core_want),
    coreFear: stringValue(source.coreFear || source.core_fear),
    contradiction: stringValue(source.contradiction),
    identitySignals: normalizeStringList(source.identitySignals || source.identity_signals),
    sourceCaveat: stringValue(source.sourceCaveat || source.source_caveat),
    sourceFragmentRule: stringValue(source.sourceFragmentRule || source.source_fragment_rule),
    handleRule: stringValue(source.handleRule || source.handle_rule),
    canonBoundaryNotes: normalizeStringList(source.canonBoundaryNotes || source.canon_boundary_notes),
    source: source.source || null,
    status: stringValue(source.status, source.soulThesis || source.soul_thesis ? "active" : "empty"),
    createdAt,
    updatedAt: source.updatedAt || source.updated_at || createdAt
  };
}

function normalizeGenesisRun(run = {}, fallbackId = "genesis-run") {
  const now = new Date().toISOString();
  const source = run && typeof run === "object" ? run : {};
  const id = stringValue(source.id || source.runId || source.run_id, createMindId(fallbackId));
  return {
    id,
    runId: stringValue(source.runId || source.run_id, id),
    sourcePath: stringValue(source.sourcePath || source.source_path),
    status: stringValue(source.status, "complete"),
    completedAt: source.completedAt || source.completed_at || "",
    createdAt: source.createdAt || source.created_at || source.completedAt || source.completed_at || now,
    updatedAt: source.updatedAt || source.updated_at || source.completedAt || source.completed_at || now
  };
}

function normalizeSoulSeedContext(context = {}) {
  const now = new Date().toISOString();
  const source = context && typeof context === "object" ? context : {};
  const arrayValue = (camelKey, snakeKey) => {
    const value = source[camelKey] ?? source[snakeKey];
    if (Array.isArray(value)) return unique(value.map((item) => stringValue(item)));
    if (value === undefined || value === null) return [];
    return unique(String(value).split(",").map((item) => stringValue(item)));
  };
  return {
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-soul-seed-context.v1"),
    soulSeedCardsReviewed: arrayValue("soulSeedCardsReviewed", "soul_seed_cards_reviewed"),
    sagaCardsReviewed: arrayValue("sagaCardsReviewed", "saga_cards_reviewed"),
    epicCardsReviewed: arrayValue("epicCardsReviewed", "epic_cards_reviewed"),
    avatarAttachment: source.avatarAttachment || source.avatar_attachment || null,
    rootThemes: arrayValue("rootThemes", "root_themes"),
    avatarProjectionLane: stringValue(source.avatarProjectionLane || source.avatar_projection_lane),
    inheritedMotivations: arrayValue("inheritedMotivations", "inherited_motivations"),
    inheritedConstraints: arrayValue("inheritedConstraints", "inherited_constraints"),
    fantasyOverlayRules: arrayValue("fantasyOverlayRules", "fantasy_overlay_rules"),
    realTechnicalOverlayRules: arrayValue("realTechnicalOverlayRules", "real_technical_overlay_rules"),
    attributionAndAuthenticationRequirements: arrayValue("attributionAndAuthenticationRequirements", "attribution_and_authentication_requirements"),
    canonBoundaryNotes: arrayValue("canonBoundaryNotes", "canon_boundary_notes"),
    requiredCitations: arrayValue("requiredCitations", "required_citations"),
    missingOrDisputedSeedContext: arrayValue("missingOrDisputedSeedContext", "missing_or_disputed_seed_context"),
    source: source.source || null,
    status: stringValue(source.status, "active"),
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeBlackHorizonContext(context = {}) {
  const now = new Date().toISOString();
  const source = context && typeof context === "object" ? context : {};
  return {
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-black-horizon-context.v1"),
    foundationId: stringValue(source.foundationId || source.foundation_id, "black-horizon-artifact-world-foundation"),
    canonStatus: stringValue(source.canonStatus || source.canon_status, "operator_instruction_foundation"),
    summary: stringValue(source.summary),
    settingRegions: normalizeStringList(source.settingRegions || source.setting_regions),
    teamDoctrine: normalizeStringList(source.teamDoctrine || source.team_doctrine),
    gardenLoop: stringValue(source.gardenLoop || source.garden_loop),
    artifactWorldLoop: stringValue(source.artifactWorldLoop || source.artifact_world_loop),
    earthOperatorLoop: stringValue(source.earthOperatorLoop || source.earth_operator_loop),
    sourceAnchors: normalizeStringList(source.sourceAnchors || source.source_anchors),
    status: stringValue(source.status, "active"),
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeConsciousnessContext(context = {}) {
  const now = new Date().toISOString();
  const source = context && typeof context === "object" ? context : {};
  return {
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-consciousness-context.v1"),
    mechanicId: stringValue(source.mechanicId || source.mechanic_id, "black-horizon-consciousness-copy-mechanic"),
    canonStatus: stringValue(source.canonStatus || source.canon_status, "operator_instruction_foundation"),
    summary: stringValue(source.summary),
    primeAvatar: normalizeConsciousnessPrimeAvatar(source.primeAvatar || source.prime_avatar),
    colonialCopies: normalizeMindCollection(source.colonialCopies || source.colonial_copies, normalizeConsciousnessCopy, "colonial-copy"),
    messageTraffic: normalizeConsciousnessMessageTraffic(source.messageTraffic || source.message_traffic),
    identitySplitRules: normalizeStringList(source.identitySplitRules || source.identity_split_rules),
    resourceHooks: normalizeStringList(source.resourceHooks || source.resource_hooks),
    gameplayHooks: normalizeStringList(source.gameplayHooks || source.gameplay_hooks),
    genesisUse: normalizeStringList(source.genesisUse || source.genesis_use),
    canonBoundaryNotes: normalizeStringList(source.canonBoundaryNotes || source.canon_boundary_notes),
    sourceAnchors: normalizeStringList(source.sourceAnchors || source.source_anchors),
    status: stringValue(source.status, "active"),
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeConsciousnessPrimeAvatar(prime = {}) {
  const now = new Date().toISOString();
  const source = prime && typeof prime === "object" ? prime : {};
  return {
    avatarId: stringValue(source.avatarId || source.avatar_id),
    avatarName: stringValue(source.avatarName || source.avatar_name),
    horizonRole: stringValue(source.horizonRole || source.horizon_role, "message_traffic_controller"),
    gardenId: stringValue(source.gardenId || source.garden_id),
    gardenName: stringValue(source.gardenName || source.garden_name),
    nodeId: stringValue(source.nodeId || source.node_id),
    nodeName: stringValue(source.nodeName || source.node_name),
    shipName: stringValue(source.shipName || source.ship_name),
    stationFunction: stringValue(source.stationFunction || source.station_function),
    trafficControlDuties: normalizeStringList(source.trafficControlDuties || source.traffic_control_duties),
    identityContinuityRule: stringValue(source.identityContinuityRule || source.identity_continuity_rule),
    status: stringValue(source.status, "active"),
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeConsciousnessCopy(copy = {}, fallbackId = "colonial-copy") {
  const now = new Date().toISOString();
  const source = copy && typeof copy === "object" ? copy : {};
  const id = stringValue(source.id || source.copyId || source.copy_id, createMindId(fallbackId));
  return {
    id,
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-consciousness-copy.v1"),
    copyId: stringValue(source.copyId || source.copy_id || id, id),
    copyName: stringValue(source.copyName || source.copy_name || source.name, "Unnamed colonial copy"),
    originAvatarId: stringValue(source.originAvatarId || source.origin_avatar_id),
    originAvatarName: stringValue(source.originAvatarName || source.origin_avatar_name),
    colonyWave: stringValue(source.colonyWave || source.colony_wave),
    destination: stringValue(source.destination),
    timeDilationBand: stringValue(source.timeDilationBand || source.time_dilation_band),
    mission: stringValue(source.mission),
    identityRelation: stringValue(source.identityRelation || source.identity_relation, "split-but-connected-person"),
    divergenceStatus: stringValue(source.divergenceStatus || source.divergence_status, "seeded"),
    personaDelta: stringValue(source.personaDelta || source.persona_delta),
    memoryDelta: stringValue(source.memoryDelta || source.memory_delta),
    relationshipDelta: stringValue(source.relationshipDelta || source.relationship_delta),
    messageProtocol: stringValue(source.messageProtocol || source.message_protocol),
    returnPayloads: normalizeStringList(source.returnPayloads || source.return_payloads),
    riskNotes: normalizeStringList(source.riskNotes || source.risk_notes),
    canonStatus: stringValue(source.canonStatus || source.canon_status, "soft_canon"),
    status: stringValue(source.status, "active"),
    createdAt: source.createdAt || source.created_at || now,
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeConsciousnessMessageTraffic(traffic = {}) {
  const source = traffic && typeof traffic === "object" ? traffic : {};
  return {
    controllerRole: stringValue(source.controllerRole || source.controller_role, "Black Horizon prime routes, audits, and reconciles colonial messages."),
    cadence: stringValue(source.cadence),
    allowedMessages: normalizeStringList(source.allowedMessages || source.allowed_messages),
    blockedMessages: normalizeStringList(source.blockedMessages || source.blocked_messages),
    routingRules: normalizeStringList(source.routingRules || source.routing_rules),
    reconciliationLoop: stringValue(source.reconciliationLoop || source.reconciliation_loop),
    mergeConsentRule: stringValue(source.mergeConsentRule || source.merge_consent_rule),
    conflictResolution: stringValue(source.conflictResolution || source.conflict_resolution),
    auditLogRef: stringValue(source.auditLogRef || source.audit_log_ref),
    status: stringValue(source.status, "active")
  };
}

function normalizeDearPapaSongContext(context = {}) {
  const now = new Date().toISOString();
  const source = context && typeof context === "object" ? context : {};
  return {
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-dear-papa-song-context.v1"),
    albumId: stringValue(source.albumId || source.album_id, "dear-papa-album"),
    albumTitle: stringValue(source.albumTitle || source.album_title, "Dear Papa"),
    author: stringValue(source.author, "Calder"),
    authorshipRule: stringValue(
      source.authorshipRule || source.authorship_rule,
      "Album authorship is Calder; Red, Blue, and Green are in-universe performance perspectives."
    ),
    loreStatus: stringValue(source.loreStatus || source.lore_status, "hapa_lore_not_hard_canon"),
    perspectiveRule: stringValue(
      source.perspectiveRule || source.perspective_rule,
      "Each song card assigns one Red, Blue, or Green singer perspective for lore, relationship, and Genesis flavor."
    ),
    performancePerspective: normalizeDearPapaPerspective(source.performancePerspective || source.performance_perspective),
    selectedSongCards: normalizeMindCollection(source.selectedSongCards || source.selected_song_cards, normalizeDearPapaSongChoice, "dear-papa-song-card"),
    relationshipPrompts: normalizeMindCollection(source.relationshipPrompts || source.relationship_prompts, normalizeDearPapaRelationshipPrompt, "dear-papa-relationship"),
    sourceAnchors: normalizeStringList(source.sourceAnchors || source.source_anchors),
    songCardIndexPath: stringValue(source.songCardIndexPath || source.song_card_index_path),
    rawCardManifestPath: stringValue(source.rawCardManifestPath || source.raw_card_manifest_path),
    genesisUse: normalizeStringList(source.genesisUse || source.genesis_use),
    status: stringValue(source.status, "active"),
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeDearPapaPerspective(perspective = {}) {
  const source = perspective && typeof perspective === "object" ? perspective : {};
  return {
    teamColor: stringValue(source.teamColor || source.team_color),
    teamId: stringValue(source.teamId || source.team_id),
    avatarId: stringValue(source.avatarId || source.avatar_id),
    avatarName: stringValue(source.avatarName || source.avatar_name),
    voiceFunction: stringValue(source.voiceFunction || source.voice_function),
    relationshipFocus: normalizeStringList(source.relationshipFocus || source.relationship_focus)
  };
}

function normalizeDearPapaSongChoice(choice = {}, fallbackId = "dear-papa-song-card") {
  const now = new Date().toISOString();
  const source = choice && typeof choice === "object" ? choice : {};
  return {
    id: stringValue(source.id || source.cardId || source.card_id, createMindId(fallbackId)),
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-dear-papa-song-choice.v1"),
    songId: stringValue(source.songId || source.song_id),
    cardId: stringValue(source.cardId || source.card_id || source.id),
    title: stringValue(source.title || source.name, "Untitled Dear Papa song"),
    albumId: stringValue(source.albumId || source.album_id, "dear-papa-album"),
    author: stringValue(source.author, "Calder"),
    perspective: normalizeDearPapaPerspective(source.perspective),
    whySelected: stringValue(source.whySelected || source.why_selected || source.whyChosen || source.why_chosen),
    genesisInstruction: stringValue(source.genesisInstruction || source.genesis_instruction),
    communicationUse: stringValue(source.communicationUse || source.communication_use),
    lyricsSha256: stringValue(source.lyricsSha256 || source.lyrics_sha256),
    sourcePath: stringValue(source.sourcePath || source.source_path),
    status: stringValue(source.status, "active"),
    createdAt: source.createdAt || source.created_at || now,
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeDearPapaRelationshipPrompt(prompt = {}, fallbackId = "dear-papa-relationship") {
  const now = new Date().toISOString();
  const source = prompt && typeof prompt === "object" ? prompt : {};
  return {
    id: stringValue(source.id, createMindId(fallbackId)),
    targetAvatarId: stringValue(source.targetAvatarId || source.target_avatar_id),
    targetName: stringValue(source.targetName || source.target_name),
    relationLabel: stringValue(source.relationLabel || source.relation_label || source.label, "songbook-counterpoint"),
    prompt: stringValue(source.prompt || source.summary),
    songIds: normalizeStringList(source.songIds || source.song_ids),
    classification: selectValue(source.classification, MIND_FACT_CLASSIFICATIONS, "perspective"),
    confidence: selectValue(source.confidence, MIND_CONFIDENCE_LEVELS, "generated"),
    status: stringValue(source.status, "active"),
    createdAt: source.createdAt || source.created_at || now,
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeGardenNodeAssignment(assignment = {}) {
  const now = new Date().toISOString();
  const source = assignment && typeof assignment === "object" ? assignment : {};
  return {
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-garden-node-assignment.v1"),
    teamId: stringValue(source.teamId || source.team_id),
    teamTitle: stringValue(source.teamTitle || source.team_title),
    role: stringValue(source.role),
    gardenId: stringValue(source.gardenId || source.garden_id),
    gardenName: stringValue(source.gardenName || source.garden_name),
    gardenFunction: stringValue(source.gardenFunction || source.garden_function),
    nodeId: stringValue(source.nodeId || source.node_id),
    nodeName: stringValue(source.nodeName || source.node_name),
    shipName: stringValue(source.shipName || source.ship_name),
    shipClass: stringValue(source.shipClass || source.ship_class),
    orbitBand: stringValue(source.orbitBand || source.orbit_band),
    produces: normalizeStringList(source.produces),
    functions: normalizeStringList(source.functions),
    responsibilities: normalizeStringList(source.responsibilities),
    source: stringValue(source.source, "black-horizon-artifact-world-foundation"),
    status: stringValue(source.status, "active"),
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeShipCrewAssignment(assignment = {}) {
  const now = new Date().toISOString();
  const source = assignment && typeof assignment === "object" ? assignment : {};
  return {
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-ship-crew-assignment.v1"),
    teamId: stringValue(source.teamId || source.team_id),
    teamTitle: stringValue(source.teamTitle || source.team_title),
    vesselName: stringValue(source.vesselName || source.vessel_name),
    crewSeat: stringValue(source.crewSeat || source.crew_seat),
    duty: stringValue(source.duty),
    captainAvatarId: stringValue(source.captainAvatarId || source.captain_avatar_id),
    captainName: stringValue(source.captainName || source.captain_name),
    crewHooks: normalizeStringList(source.crewHooks || source.crew_hooks),
    status: stringValue(source.status, "active"),
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizePlacementBackstorySeed(seed = {}) {
  const now = new Date().toISOString();
  const source = seed && typeof seed === "object" ? seed : {};
  return {
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-placement-backstory-seed.v1"),
    prompt: stringValue(source.prompt),
    howTheyGotThere: stringValue(source.howTheyGotThere || source.how_they_got_there),
    whyTheyAccepted: stringValue(source.whyTheyAccepted || source.why_they_accepted),
    unresolvedConflict: stringValue(source.unresolvedConflict || source.unresolved_conflict),
    growthHook: stringValue(source.growthHook || source.growth_hook),
    source: stringValue(source.source, "black-horizon-artifact-world-foundation"),
    status: stringValue(source.status, "active"),
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeRelationshipMapping(relationship = {}, fallbackId = "relationship") {
  const now = new Date().toISOString();
  const source = relationship && typeof relationship === "object" ? relationship : {};
  const normalized = {
    id: stringValue(source.id, createMindId(fallbackId)),
    targetAvatarId: stringValue(source.targetAvatarId || source.targetId),
    targetName: stringValue(source.targetName || source.target),
    relationLabel: stringValue(source.relationLabel || source.label || source.relationship, "unknown"),
    classification: selectValue(source.classification, MIND_FACT_CLASSIFICATIONS, "relationship_delta"),
    confidence: selectValue(source.confidence, MIND_CONFIDENCE_LEVELS, "soft"),
    visibility: selectValue(source.visibility, MIND_VISIBILITY_LEVELS, "private"),
    reason: stringValue(source.reason),
    status: stringValue(source.status, source.classification === "tombstone" ? "tombstone" : "active"),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now
  };
  for (const metric of RELATIONSHIP_METRICS) {
    normalized[metric] = clampNumber(source[metric] ?? source[`${metric}_delta`] ?? 0, -10, 10);
  }
  return normalized;
}

function normalizeContextMapping(context = {}, fallbackId = "context") {
  const now = new Date().toISOString();
  const source = context && typeof context === "object" ? context : {};
  return {
    id: stringValue(source.id, createMindId(fallbackId)),
    contextId: stringValue(source.contextId || source.sceneId || source.placeId),
    label: stringValue(source.label || source.title || source.name, "Untitled context"),
    kind: selectValue(source.kind, CONTEXT_KINDS, "scene"),
    avatarBelief: stringValue(source.avatarBelief || source.belief || source.privateSummary),
    publicSummary: stringValue(source.publicSummary || source.summary),
    classification: selectValue(source.classification, MIND_FACT_CLASSIFICATIONS, "perspective"),
    confidence: selectValue(source.confidence, MIND_CONFIDENCE_LEVELS, "perspective"),
    visibility: selectValue(source.visibility, MIND_VISIBILITY_LEVELS, "private"),
    status: stringValue(source.status, source.classification === "tombstone" ? "tombstone" : "active"),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now
  };
}

function normalizeMemoryLedgerEntry(memory = {}, fallbackId = "memory") {
  const now = new Date().toISOString();
  const source = memory && typeof memory === "object" ? memory : {};
  return {
    memoryId: stringValue(source.memoryId || source.id, createMindId(fallbackId)),
    summary: stringValue(source.summary),
    emotionalWeight: clampNumber(source.emotionalWeight ?? source.emotional_weight ?? 0, -10, 10),
    visibility: selectValue(source.visibility, MIND_VISIBILITY_LEVELS, "private"),
    confidence: selectValue(source.confidence, MIND_CONFIDENCE_LEVELS, "soft"),
    classification: selectValue(source.classification, MIND_FACT_CLASSIFICATIONS, "memory_delta"),
    status: stringValue(source.status, "active"),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now
  };
}

function normalizePhraseCard(card = {}, fallbackId = "phrase-card") {
  const now = new Date().toISOString();
  const source = card && typeof card === "object" ? card : {};
  const rawTone = Array.isArray(source.tone) ? source.tone : stringValue(source.tone).split(",");
  const rawGrounding = Array.isArray(source.loreGrounding || source.lore_grounding)
    ? (source.loreGrounding || source.lore_grounding)
    : stringValue(source.loreGrounding || source.lore_grounding).split(",");
  const mechanic = source.mechanic && typeof source.mechanic === "object" ? source.mechanic : {};
  const attribution = source.attribution && typeof source.attribution === "object" ? source.attribution : {};
  return {
    id: stringValue(source.id, createMindId(fallbackId)),
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-phrase-card.v1"),
    phrase: stringValue(source.phrase || source.line || source.value, "Ready."),
    primaryUse: stringValue(source.primaryUse || source.primary_use || source.use, "immediate_reaction"),
    trigger: stringValue(source.trigger || source.when),
    tone: unique(rawTone.map((item) => stringValue(item))),
    cardRole: stringValue(source.cardRole || source.card_role || source.role, "signal"),
    identitySignal: stringValue(source.identitySignal || source.identity_signal),
    loreGrounding: unique(rawGrounding.map((item) => stringValue(item))),
    usageNotes: stringValue(source.usageNotes || source.usage_notes || source.notes),
    mechanic: {
      cost: stringValue(mechanic.cost),
      effect: stringValue(mechanic.effect),
      combo: stringValue(mechanic.combo)
    },
    attribution: {
      source: stringValue(attribution.source || source.source, "manual"),
      confidence: stringValue(attribution.confidence || source.confidence, "generated_from_canon_context")
    },
    status: stringValue(source.status, "active"),
    createdAt: source.createdAt || source.created_at || now,
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeLoadoutCard(card = {}, fallbackId = "loadout-card") {
  const now = new Date().toISOString();
  const source = card && typeof card === "object" ? card : {};
  return {
    id: stringValue(source.id, createMindId(fallbackId)),
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-loadout-card.v1"),
    title: stringValue(source.title || source.name, "Untitled loadout card"),
    cardType: stringValue(source.cardType || source.card_type, "foundation_card"),
    family: stringValue(source.family),
    sourceId: stringValue(source.sourceId || source.source_id),
    role: stringValue(source.role),
    learningThing: stringValue(source.learningThing || source.learning_thing),
    mechanic: stringValue(source.mechanic),
    whyChosen: stringValue(source.whyChosen || source.why_chosen),
    allowedUses: normalizeStringList(source.allowedUses || source.allowed_uses),
    limits: normalizeStringList(source.limits),
    source: stringValue(source.source, "black-horizon-artifact-world-foundation"),
    status: stringValue(source.status, "active"),
    createdAt: source.createdAt || source.created_at || now,
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function normalizeTarotDeckChoice(choice = {}, fallbackId = "tarot-card-choice") {
  const now = new Date().toISOString();
  const source = choice && typeof choice === "object" ? choice : {};
  return {
    id: stringValue(source.id, createMindId(fallbackId)),
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-tarot-card-choice.v1"),
    cardId: stringValue(source.cardId || source.card_id),
    cardTitle: stringValue(source.cardTitle || source.card_title || source.title, "Untitled Tarot Card"),
    cardType: stringValue(source.cardType || source.card_type, "hapa_tarot_card"),
    tarotMainType: stringValue(source.tarotMainType || source.tarot_main_type || source.mainType || source.main_type, "hapa_tarot_card"),
    role: stringValue(source.role, "deck-choice"),
    whyChosen: stringValue(source.whyChosen || source.why_chosen || source.reason),
    canonReason: stringValue(source.canonReason || source.canon_reason),
    loreContext: stringValue(source.loreContext || source.lore_context),
    objectiveFit: stringValue(source.objectiveFit || source.objective_fit),
    deckInfluence: stringValue(source.deckInfluence || source.deck_influence),
    futureInfluence: stringValue(source.futureInfluence || source.future_influence),
    songId: stringValue(source.songId || source.song_id),
    songTitle: stringValue(source.songTitle || source.song_title),
    songWhy: stringValue(source.songWhy || source.song_why),
    vibe: stringValue(source.vibe),
    sourcePath: stringValue(source.sourcePath || source.source_path),
    confidence: selectValue(source.confidence, MIND_CONFIDENCE_LEVELS, "generated"),
    status: stringValue(source.status, "active"),
    createdAt: source.createdAt || source.created_at || now,
    updatedAt: source.updatedAt || source.updated_at || now
  };
}

function summarizeLoadoutCard(card = {}) {
  return {
    id: card.id,
    title: card.title,
    cardType: card.cardType,
    family: card.family,
    role: card.role,
    mechanic: card.mechanic,
    status: card.status
  };
}

function summarizeTarotDeckChoice(choice = {}) {
  return {
    id: choice.id,
    cardId: choice.cardId,
    cardTitle: choice.cardTitle,
    cardType: choice.cardType,
    tarotMainType: choice.tarotMainType,
    role: choice.role,
    whyChosen: choice.whyChosen,
    deckInfluence: choice.deckInfluence,
    futureInfluence: choice.futureInfluence,
    songId: choice.songId,
    songTitle: choice.songTitle,
    songWhy: choice.songWhy,
    status: choice.status
  };
}

function summarizeDearPapaSongChoice(choice = {}) {
  return {
    id: choice.id,
    songId: choice.songId,
    cardId: choice.cardId,
    title: choice.title,
    author: choice.author,
    perspective: choice.perspective,
    communicationUse: choice.communicationUse,
    genesisInstruction: choice.genesisInstruction,
    lyricsSha256: choice.lyricsSha256,
    status: choice.status
  };
}

function summarizeConsciousnessCopy(copy = {}) {
  return {
    id: copy.id,
    copyId: copy.copyId,
    copyName: copy.copyName,
    originAvatarId: copy.originAvatarId,
    originAvatarName: copy.originAvatarName,
    colonyWave: copy.colonyWave,
    destination: copy.destination,
    timeDilationBand: copy.timeDilationBand,
    mission: copy.mission,
    identityRelation: copy.identityRelation,
    divergenceStatus: copy.divergenceStatus,
    personaDelta: copy.personaDelta,
    memoryDelta: copy.memoryDelta,
    relationshipDelta: copy.relationshipDelta,
    messageProtocol: copy.messageProtocol,
    returnPayloads: copy.returnPayloads,
    canonStatus: copy.canonStatus,
    status: copy.status
  };
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return unique(value.map((item) => stringValue(item)).filter(Boolean));
  if (value === undefined || value === null || value === "") return [];
  return unique(String(value).split(",").map((item) => stringValue(item)).filter(Boolean));
}

function normalizeJournalArc(value) {
  if (!value || typeof value !== "object") return {};
  return {
    id: stringValue(value.id),
    title: stringValue(value.title),
    sequence: Number(value.sequence ?? 0),
    focus: stringValue(value.focus),
    scene: stringValue(value.scene),
    event: stringValue(value.event),
    artifact: stringValue(value.artifact),
    familyPressure: stringValue(value.familyPressure || value.family_pressure),
    innerQuestion: stringValue(value.innerQuestion || value.inner_question),
    protocolLesson: stringValue(value.protocolLesson || value.protocol_lesson),
    complication: stringValue(value.complication),
    relationshipTurn: stringValue(value.relationshipTurn || value.relationship_turn),
    forwardSeed: stringValue(value.forwardSeed || value.forward_seed),
    avatarVariationKey: stringValue(value.avatarVariationKey || value.avatar_variation_key)
  };
}

function normalizeJournalSourceRefs(value) {
  if (!Array.isArray(value)) return normalizeStringList(value);
  return value.map((item) => {
    if (!item || typeof item !== "object") return stringValue(item);
    return {
      label: stringValue(item.label || item.title || item.name),
      uri: stringValue(item.uri || item.path || item.sourcePath || item.source_path),
      confidence: stringValue(item.confidence),
      kind: stringValue(item.kind)
    };
  }).filter((item) => typeof item === "string" ? Boolean(item) : Boolean(item.uri || item.label));
}

function normalizeJournalMediaList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      const title = stringValue(item);
      return title ? { id: createMindId(`media-${index}`), title } : null;
    }
    return {
      id: stringValue(item.id, createMindId(`media-${index}`)),
      title: stringValue(item.title),
      creator: stringValue(item.creator),
      medium: stringValue(item.medium),
      sourceSystem: stringValue(item.sourceSystem || item.source_system),
      sourceList: stringValue(item.sourceList || item.source_list),
      url: stringValue(item.url),
      sourcePath: stringValue(item.sourcePath || item.source_path),
      provenance: stringValue(item.provenance),
      themes: normalizeStringList(item.themes),
      description: stringValue(item.description)
    };
  }).filter((item) => item && item.title);
}

function normalizeJournalMediaConsumption(value) {
  if (!value || typeof value !== "object") return {};
  return {
    schemaVersion: stringValue(value.schemaVersion || value.schema_version, "hapa.avatar-weekly-media-consumption.v1"),
    source: stringValue(value.source),
    sourceRefs: normalizeJournalSourceRefs(value.sourceRefs || value.source_refs),
    reading: normalizeJournalMediaList(value.reading),
    watching: normalizeJournalMediaList(value.watching),
    weeklyLearning: stringValue(value.weeklyLearning || value.weekly_learning),
    pastApplication: stringValue(value.pastApplication || value.past_application),
    presentApplication: stringValue(value.presentApplication || value.present_application),
    futureApplication: stringValue(value.futureApplication || value.future_application),
    innerStateDelta: stringValue(value.innerStateDelta || value.inner_state_delta),
    interactionPrompt: stringValue(value.interactionPrompt || value.interaction_prompt),
    sceneUse: stringValue(value.sceneUse || value.scene_use),
    lexiconTerms: normalizeStringList(value.lexiconTerms || value.lexicon_terms),
    tags: normalizeStringList(value.tags)
  };
}

function normalizeJournalBalladOfBellaContext(value) {
  if (!value || typeof value !== "object") return {};
  return {
    schemaVersion: stringValue(value.schemaVersion || value.schema_version, "hapa.ballad-of-bella-context.v1"),
    packetId: stringValue(value.packetId || value.packet_id),
    sourceHash: stringValue(value.sourceHash || value.source_hash),
    mechanics: normalizeStringList(value.mechanics),
    shortRule: stringValue(value.shortRule || value.short_rule),
    rootDepthLayers: normalizeStringList(value.rootDepthLayers || value.root_depth_layers),
    threeHarbors: normalizeStringList(value.threeHarbors || value.three_harbors),
    sourcePath: stringValue(value.sourcePath || value.source_path),
    packetPath: stringValue(value.packetPath || value.packet_path),
    updatedAt: value.updatedAt || value.updated_at || new Date().toISOString()
  };
}

function normalizeJournalEntry(entry = {}, fallbackId = "journal") {
  const now = new Date().toISOString();
  const source = entry && typeof entry === "object" ? entry : {};
  return {
    id: stringValue(source.id, createMindId(fallbackId)),
    schemaVersion: stringValue(source.schemaVersion || source.schema_version, "hapa.avatar-journal-entry.v1"),
    journalType: stringValue(source.journalType || source.journal_type, "freeform"),
    timelineId: stringValue(source.timelineId || source.timeline_id),
    timelineEventId: stringValue(source.timelineEventId || source.timeline_event_id),
    lifeYear: Number(source.lifeYear ?? source.life_year ?? -1),
    age: Number(source.age ?? source.avatarAge ?? source.avatar_age ?? source.lifeYear ?? source.life_year ?? -1),
    calendarYear: Number(source.calendarYear ?? source.calendar_year ?? 0),
    relativeYear: stringValue(source.relativeYear || source.relative_year),
    weeklyCycleId: stringValue(source.weeklyCycleId || source.weekly_cycle_id),
    weekIndex: Number(source.weekIndex ?? source.week_index ?? 0),
    weekStartDate: stringValue(source.weekStartDate || source.week_start_date),
    weekEndDate: stringValue(source.weekEndDate || source.week_end_date),
    pageTarget: Number(source.pageTarget ?? source.page_target ?? 0),
    pageCount: Number(source.pageCount ?? source.page_count ?? 0),
    wordCount: Number(source.wordCount ?? source.word_count ?? countWords(source.privateEntry || source.private_entry)),
    criticStatus: stringValue(source.criticStatus || source.critic_status),
    criticName: stringValue(source.criticName || source.critic_name),
    criticNotes: stringValue(source.criticNotes || source.critic_notes),
    reviewCycleStatus: stringValue(source.reviewCycleStatus || source.review_cycle_status),
    mentionedAvatarIds: normalizeStringList(source.mentionedAvatarIds || source.mentioned_avatar_ids),
    mentionedAvatarNames: normalizeStringList(source.mentionedAvatarNames || source.mentioned_avatar_names),
    placeTags: normalizeStringList(source.placeTags || source.place_tags),
    itemTags: normalizeStringList(source.itemTags || source.item_tags),
    familyTags: normalizeStringList(source.familyTags || source.family_tags),
    sceneTags: normalizeStringList(source.sceneTags || source.scene_tags),
    eventTags: normalizeStringList(source.eventTags || source.event_tags),
    lexiconTerms: normalizeStringList(source.lexiconTerms || source.lexicon_terms),
    weeklyArc: normalizeJournalArc(source.weeklyArc || source.weekly_arc),
    readingList: normalizeJournalMediaList(source.readingList || source.reading_list),
    watchingList: normalizeJournalMediaList(source.watchingList || source.watching_list),
    mediaConsumption: normalizeJournalMediaConsumption(source.mediaConsumption || source.media_consumption),
    balladOfBellaContext: normalizeJournalBalladOfBellaContext(source.balladOfBellaContext || source.ballad_of_bella_context),
    revisionOfJournalId: stringValue(source.revisionOfJournalId || source.revision_of_journal_id),
    revisionReason: stringValue(source.revisionReason || source.revision_reason),
    affectedAvatarIds: normalizeStringList(source.affectedAvatarIds || source.affected_avatar_ids),
    dateOrSequenceMarker: stringValue(source.dateOrSequenceMarker || source.date_or_sequence_marker),
    entryVoice: stringValue(source.entryVoice || source.entry_voice, "in-character"),
    privateEntry: stringValue(source.privateEntry || source.private_entry),
    publicSummary: stringValue(source.publicSummary || source.public_summary),
    classification: selectValue(source.classification, MIND_FACT_CLASSIFICATIONS, "perspective"),
    canonStatus: stringValue(source.canonStatus || source.canon_status, "personal_canon_draft"),
    causalityStatus: stringValue(source.causalityStatus || source.causality_status, "causality-review-pending"),
    reviewedAvatarIds: normalizeStringList(source.reviewedAvatarIds || source.reviewed_avatar_ids),
    reviewedAvatarNames: normalizeStringList(source.reviewedAvatarNames || source.reviewed_avatar_names),
    linkedTeamId: stringValue(source.linkedTeamId || source.linked_team_id),
    linkedTeamTitle: stringValue(source.linkedTeamTitle || source.linked_team_title),
    linkedRole: stringValue(source.linkedRole || source.linked_role),
    responsibilityTags: normalizeStringList(source.responsibilityTags || source.responsibility_tags),
    skillTags: normalizeStringList(source.skillTags || source.skill_tags),
    sourceRefs: normalizeJournalSourceRefs(source.sourceRefs || source.source_refs),
    paragraphCount: Number(source.paragraphCount || source.paragraph_count || countParagraphs(source.privateEntry || source.private_entry)),
    status: stringValue(source.status, source.classification === "tombstone" ? "tombstone" : "active"),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now
  };
}

function countParagraphs(value = "") {
  return String(value || "").split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean).length;
}

function countWords(value = "") {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function stringValue(value, fallback = "") {
  const text = value === undefined || value === null ? "" : String(value);
  const trimmed = text.trim();
  return trimmed || fallback;
}

function selectValue(value, allowed, fallback) {
  const candidate = stringValue(value);
  return allowed.includes(candidate) ? candidate : fallback;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function createMindId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
