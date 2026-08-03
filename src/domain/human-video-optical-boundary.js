const EXPLICIT_KNOWLEDGE_PATTERNS = [
  /(^|\s)@[A-Za-z0-9][\w.-]*/u,
  /\b(?:avatar|card|song|reference|lore)\s*:[A-Za-z0-9][\w.-]*/iu,
  /\b(?:intended|deliberate|intentional|likely|probable|possible)\s+(?:as\s+)?(?:an?\s+)?(?:visual\s+)?reference\s+(?:to|for)\b/iu,
  /\b(?:intended|designed|meant)\s+to\s+(?:visually\s+)?(?:reference|evoke|match|represent|symbolize)\b/iu,
  /\bvisually\s+echo(?:es)?\b[^.\n]{0,120}\b(?:concept|lore|album|song|card|avatar)\b/iu,
  /\b(?:matches?|matched|matching|is\s+(?:a\s+)?match(?:ed)?(?:\s+(?:to|with|for))?|corresponds?|identified?\s+as|recogniz(?:e|ed)\s+as|references?|is\s+related\s+to|relates?\s+to|is\s+connected\s+to|connects?\s+to|resembles?|evokes?|visually\s+echo(?:es)?)\b[^.\n]{0,120}\b(?:hapa|echo\s+state)\b/iu,
  /\b(?:hapa|echo\s+state)\b[^.\n]{0,120}\b(?:matches?|matched|matching|is\s+(?:a\s+)?match(?:ed)?(?:\s+(?:to|with|for))?|corresponds?|identified?\s+as|recogniz(?:e|ed)\s+as|references?|is\s+related\s+to|relates?\s+to|is\s+connected\s+to|connects?\s+to|resembles?|evokes?|visually\s+echo(?:es)?)\b/iu,
  /\b(?:relationship|connection|association|correspondence|match)\s+(?:with|to)\s+(?:hapa|echo\s+state)\b/iu,
  /\b(?:matches?|matched|matching|corresponds?|identified?\s+as|recogniz(?:e|ed)\s+as|references?|resembles?|evokes?|is\s+related\s+to|is\s+connected\s+to)\b[^.\n]{0,120}\b(?:Avatar|Card|Song|Album|Lore)\s+[A-Z][\w'-]*/u,
];

export function assertHumanVideoOpticalTextBoundary(input, options = {}) {
  const visit = (value, path = []) => {
    if (typeof value === "string") {
      if (EXPLICIT_KNOWLEDGE_PATTERNS.some((pattern) => pattern.test(value))) {
        const error = new Error(`Vision-only optical text at ${path.join(".") || "result"} contains an explicit Hapa/Echo identity, relationship, or reference assertion. Record only literal visible signals for the separate Reference Pass.`);
        error.code = options.code || "optical_worker_knowledge_claim_forbidden";
        error.statusCode = 400;
        throw error;
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, [...path, String(index)]));
      return;
    }
    if (!value || typeof value !== "object") return;
    Object.entries(value).forEach(([key, child]) => visit(child, [...path, key]));
  };
  visit(input);
}
