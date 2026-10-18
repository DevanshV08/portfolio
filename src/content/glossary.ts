/**
 * Plain-language definitions for the jargon on the site, shown when someone
 * hovers or focuses a term. These explain what a thing *is*, in general; they
 * never add a claim about the work (that stays in site.ts).
 *
 * `terms` are matched as whole words, longest first, and only the first
 * mention in each block of text is marked. `inline: false` entries are only
 * used for chips (stack lists, skills), not marked inside sentences.
 */
export type GlossaryEntry = { terms: string[]; text: string; inline?: boolean };

export const GLOSSARY: GlossaryEntry[] = [
  // Security and cryptography
  {
    terms: ["TLS 1.3", "TLS-1.3", "TLS"],
    text: "The protocol behind the padlock in your browser: it sets up an encrypted connection to a website. 1.3 is the current version.",
  },
  {
    terms: ["OPAQUE"],
    text: "A modern password-login protocol: the server can check your password without ever seeing it or storing it.",
  },
  { terms: ["Diffie-Hellman"], text: "The classic way for two computers to agree on a secret key over an open network." },
  {
    terms: ["OPRF"],
    text: "Oblivious pseudorandom function: the server helps turn the password into a key without learning the password.",
  },
  { terms: ["Ed25519"], text: "A widely used elliptic curve, behind many digital signatures and SSH keys." },
  {
    terms: ["Ristretto255"],
    text: "A safer way of using the same curve that removes a known pitfall (the cofactor); the textbook choice for OPAQUE.",
  },
  { terms: ["X25519"], text: "Diffie-Hellman key agreement on Curve25519, the standard in modern TLS." },
  { terms: ["AES-GCM"], text: "AES in a mode that both encrypts data and detects any tampering with it." },
  { terms: ["HKDF"], text: "A standard way to turn one shared secret into several separate keys." },
  { terms: ["X.509"], text: "The certificate format websites use to prove who they are." },
  {
    terms: ["AES-128", "AES"],
    text: "The Advanced Encryption Standard, the cipher used almost everywhere. A full 128-bit key is far beyond brute force.",
  },
  {
    terms: ["reduced-round"],
    text: "AES-128 scrambles data in 10 rounds; a reduced-round version runs fewer, which makes it breakable. The usual setup for a security challenge.",
  },
  {
    terms: ["capture-the-flag", "CTF"],
    text: "Capture the flag: a security competition where you break deliberately weakened systems.",
  },
  { terms: ["2²⁴"], text: "2 to the power of 24: 16,777,216 possibilities." },

  // Machine learning and fairness
  {
    terms: ["demographic parity", "fairness gap"],
    text: "A fairness measure: the difference between groups in how often a model gives the positive outcome. 0 means every group gets it at the same rate.",
  },
  { terms: ["decision threshold"], text: "The cut-off score above which a model says yes." },
  { terms: ["debiasing method"], text: "A technique applied to a model to reduce unfair differences between groups." },
  {
    terms: ["random seed"],
    text: "The starting number for a model's randomness; changing it can quietly change the results.",
  },
  { terms: ["inference"], text: "Running a trained model to get its answers, as opposed to training it." },
  { terms: ["LLMs", "LLM"], text: "Large language models: the kind of AI behind chat assistants." },
  { terms: ["vLLM"], text: "An open-source engine for serving large language models quickly and cheaply." },
  { terms: ["CNN"], text: "Convolutional neural network: a model type built for images and signals." },
  { terms: ["LSTM"], text: "A neural network with memory, suited to sequences such as video frames or speech." },
  {
    terms: ["metal–organic frameworks"],
    text: "Porous crystalline materials built from metal ions linked by organic molecules.",
  },
  { terms: ["Fairlearn"], text: "An open-source toolkit for measuring and improving fairness in machine-learning models." },
  { terms: ["XGBoost"], text: "A popular library for gradient-boosted decision trees, strong on tabular data." },

  // Infrastructure and tools
  { terms: ["Kafka"], text: "A system for streaming events between services reliably." },
  { terms: ["Redis"], text: "A very fast in-memory data store, often used as a cache." },
  { terms: ["CI/CD"], text: "Automated testing and deployment on every code change." },
  { terms: ["DevOps"], text: "Automating how software is built, tested, shipped and run." },
  { terms: ["CRUD"], text: "Create, read, update, delete: the basic operations behind most app features." },
  { terms: ["NASSCOM"], text: "India's national IT-industry association." },
  { terms: ["FastAPI"], text: "A Python framework for building web APIs." },
  { terms: ["WebSockets"], text: "A live, two-way connection between a browser and a server." },
  { terms: ["Leaflet"], text: "A JavaScript library for interactive maps." },
  { terms: ["SQLAlchemy"], text: "A Python toolkit for working with databases." },
  { terms: ["D3.js"], text: "A JavaScript library for interactive data visualisation." },

  // Common enough to leave unmarked in sentences, but explained on chips.
  { terms: ["Python"], text: "The default language for machine learning, data and back-end work.", inline: false },
  { terms: ["Go"], text: "Google's language for fast, simple network services.", inline: false },
  { terms: ["React"], text: "The most widely used library for building web interfaces.", inline: false },
  { terms: ["TypeScript"], text: "JavaScript with types, which catches mistakes before the code runs.", inline: false },
  { terms: ["Docker Compose"], text: "Runs several Docker containers together as one app.", inline: false },
  { terms: ["Docker"], text: "Packages software with everything it needs, so it runs the same anywhere.", inline: false },
  { terms: ["pandas"], text: "Python's main library for working with tables of data.", inline: false },
  { terms: ["NumPy"], text: "Python's core library for fast numerical arrays.", inline: false },
  { terms: ["scikit-learn"], text: "The standard Python library for classic machine learning.", inline: false },
  { terms: ["PyTorch"], text: "A leading deep-learning framework.", inline: false },
];

/** Stable id for an entry's hidden definition (for aria-describedby). */
export const glossaryId = (index: number) => `gloss-${index}`;

/** The entry for an exact chip label ("Docker", "AES-GCM"), if there is one. */
export function lookupTerm(label: string) {
  const index = GLOSSARY.findIndex((e) => e.terms.includes(label));
  return index >= 0 ? { index, entry: GLOSSARY[index] } : null;
}

export type GlossPart = string | { text: string; index: number };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let pattern: RegExp | null = null;
const termIndex = new Map<string, number>();

/** Splits text into plain runs and glossary terms (the first mention of each entry). */
export function glossarize(text: string): GlossPart[] {
  if (!pattern) {
    const all: string[] = [];
    GLOSSARY.forEach((entry, i) => {
      if (entry.inline === false) return;
      for (const t of entry.terms) {
        termIndex.set(t, i);
        all.push(t);
      }
    });
    all.sort((a, b) => b.length - a.length);
    // Whole words only: no letter or digit right before (group 1) or after the term (group 2).
    // A captured prefix rather than a lookbehind, which older Safari can't parse.
    pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${all.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  }
  const parts: GlossPart[] = [];
  const seen = new Set<number>();
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const term = match[2];
    const start = match.index + match[1].length;
    const index = termIndex.get(term);
    if (index === undefined || seen.has(index)) continue;
    seen.add(index);
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ text: term, index });
    last = start + term.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
