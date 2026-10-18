/**
 * Everything personal on the site comes from this file.
 *
 * `null` (or an empty list) means "not provided yet". Those render as clearly
 * marked empty slots, so nothing on the site is ever made up.
 *
 * Rule of thumb for what's in here: Devansh's own work (projects, research) or
 * publicly verifiable facts (published papers, his GitHub). Anything that needs
 * an employer's permission, or that his source documents disagree on, is left
 * out until confirmed — see NOTES at the bottom.
 */

export type Project = {
  title: string;
  /** Short context: "Hackathon · 2-day build", a course code, a role. */
  tag: string;
  /** The problem and what it is, in one or two lines. */
  summary: string;
  /** The key decision — the pit-wall call that shows judgment. */
  call?: string;
  /** A concrete outcome or number. */
  result?: string;
  stack: string[];
  href?: string;
  graphic?: Graphic;
};

export type Position = {
  title: string;
  org: string;
  period: string;
  summary?: string;
};

export type Skill = {
  name: string;
  /** What it is, in plain words, for readers outside the field. */
  about: string;
  /** Where he used it: the project or job that proves it. */
  proof: string;
  /** The same places as `proof`, by their names in PROOF_PLACES (for the proof map). */
  where: ProofPlace[];
};

/** Everywhere a skill is proven, as the proof map names them. */
export const PROOF_PLACES = [
  "KLJ Group",
  "Times Internet",
  "ParentSquare",
  "Atlas",
  "Fairness framework",
  "TLS 1.3 + OPAQUE",
  "AES CTF",
  "Research papers",
  "Coursework",
] as const;
export type ProofPlace = (typeof PROOF_PLACES)[number];

/** A headline number for the stat band at the top of Highlights. */
export type Stat = { value: string; label: string; glyph?: StatGlyph };

/** A small mark under a stat's number, drawn from the same fact. */
export type StatGlyph =
  /** The measured range behind a factor, on an axis from 0 to `max`. */
  | { kind: "range"; from: number; to: number; max: number }
  /** A keyspace, as a grid swept full. */
  | { kind: "grid" }
  /** One mark per day, paper or lakh. */
  | { kind: "marks"; count: number; mark: "day" | "sheet" | "coin" };

/** A gantry on the lap: a big headline for the board, and the full line for the caption. */
export type Milestone = {
  year: string;
  /** Big text on the gantry board: a number or a short word. */
  headline: string;
  /** What the headline counts, in a few words ("participants", "tests pass"), so a number never stands alone. */
  unit?: string;
  title: string;
  detail: string;
  graphic?: Graphic;
  /** Where this milestone happened, as the skills list names it: its skills are "proven here" on the lap. */
  place?: ProofPlace;
};

/**
 * A data graphic, drawn next to the text it comes from. Every number and
 * label in one must already be in that text: a graphic shows a fact, it
 * never adds one.
 */
export type Graphic = GraphicBody & {
  /** How to read the graphic, in plain words, shown on hover. */
  tip?: string;
};

type GraphicBody =
  /** A podium with one step lit. */
  | { kind: "podium"; place: 1 | 2 | 3; label: string }
  /** A unit chart: one mark per person, unit or lakh. `plus` marks "350+". */
  | {
      kind: "units";
      groups: {
        count: number;
        label: string;
        /** Shown instead of the count, e.g. "₹6 lakh". */
        value?: string;
        plus?: boolean;
        mark?: "dot" | "cross" | "coin";
        /** What one mark stands for, when it isn't one of `label`. */
        each?: string;
      }[];
      notes?: string[];
    }
  /** The papers in `publications`, one sheet each, by year. */
  | { kind: "papers" }
  /** What each part of a stack was for, a row each. */
  | { kind: "layers"; rows: { label: string; items: string[] }[] }
  /** Columns of boxes, each column wired to the next. */
  | { kind: "flow"; columns: string[][]; note?: string }
  /** A span of years with a label at each end. */
  | { kind: "span"; from: number; to: number; labels: [string, string] }
  /** A measured range on an axis from 0 to `max`, with the factor between its ends. */
  | { kind: "range"; from: number; to: number; max: number; label: string; factor: string }
  /** What the server never does with a secret, plus the tests that pass. */
  | { kind: "vault"; secret: string; never: string[]; tests: { passed: number; total: number } }
  /** A keyspace of 2^bits keys, swept end to end, and the before/after of the rewrite. */
  | { kind: "keyspace"; bits: number; before: string; after: string };

export type Publication = {
  title: string;
  /** A few words for the paper's subject, from its title. */
  topic: string;
  venue: string;
  year: number;
  /** Full URL to the paper (a DOI link), so the claim is checkable. */
  href?: string;
};

export type Award = {
  title: string;
  detail: string;
  year: string;
  graphic?: Graphic;
};

export type Site = {
  name: string;
  role: string | null;
  /** The restraint thesis: two or three sentences at the top of Highlights. */
  summary: string | null;
  /** The thesis's three examples, each pointed at the project it comes from (a title in `projects`). */
  calls: { text: string; project: string }[];
  /** The About page, in his own voice. One string per paragraph. */
  about: string[];
  /** The About section's team sheet: short lines taken from the paragraphs above, nothing new. */
  teamSheet: { label: string; value: string }[];
  location: string | null;
  /** Short, bold lines for the home-page ticker. */
  ticker: string[];
  /** Headline numbers shown as a telemetry band on Highlights. */
  stats: Stat[];
  /** The lap on the home page: one gantry per milestone, in order. Only facts that appear elsewhere on the site. */
  lap: Milestone[];
  /** e.g. "/resume.pdf" once the file is in /public */
  resumeUrl: string | null;
  email: string | null;
  links: { linkedin: string | null; github: string | null };
  projects: Project[];
  experience: Position[];
  skills: Skill[];
  publications: Publication[];
  awards: Award[];
};

/*
 * Data graphics. Each one is drawn from the sentence it sits next to (the
 * milestone, project or award quoting the same numbers), so a graphic never
 * says more than the text does.
 */
const G = {
  nasa: { kind: "podium", place: 1, label: "India", tip: "Ranked #1 in India at NASA's international hackathon." },
  iste: {
    kind: "units",
    groups: [{ count: 150, plus: true, label: "students led" }],
    tip: "One dot = one student in the club he ran as General Secretary.",
  },
  bvest: {
    kind: "units",
    groups: [
      { count: 100, label: "organizing team" },
      { count: 350, plus: true, label: "participants" },
      { count: 3, mark: "coin", value: "₹3 lakh", label: "sponsorship", each: "₹1 lakh" },
    ],
    tip: "One dot = one person: the 100 organisers he led, then the 350+ who took part. One coin = ₹1 lakh (₹100,000) raised.",
  },
  jobcadet: {
    kind: "units",
    groups: [{ count: 6, mark: "coin", value: "₹6 lakh", label: "NASSCOM seed funding", each: "₹1 lakh" }],
    tip: "One coin = ₹1 lakh (₹100,000) of seed funding from NASSCOM, India's IT-industry body.",
  },
  papers: { kind: "papers", tip: "One sheet per peer-reviewed paper, by year and subject." },
  times: {
    kind: "layers",
    rows: [
      { label: "Async events", items: ["Kafka"] },
      { label: "Caching", items: ["Redis"] },
      { label: "Shipping", items: ["Docker", "CI/CD"] },
      { label: "Cloud", items: ["AWS", "GCP"] },
    ],
    tip: "What each part of the stack was for: moving events, caching, shipping code, and where it ran.",
  },
  klj: {
    kind: "flow",
    columns: [["Billing automation", "Email-thread reader", "Voice + vision search"], ["vLLM"], ["Local models", "Cloud models"]],
    note: "Python and Go on the serving path",
    tip: "Three products, one serving layer (vLLM) in the middle, running on both local and cloud models.",
  },
  asu: {
    kind: "span",
    from: 2025,
    to: 2027,
    labels: ["Started · Tempe", "Class of 2027"],
    tip: "The MS in Computer Science, from starting in 2025 to the class of 2027.",
  },
  triage: {
    kind: "flow",
    columns: [["Customer-health score"], ["Deterministic rules"], ["Which accounts", "Why", "What next"]],
    note: "Rules, not ML: easier to trust and explain",
    tip: "The existing health score goes in, fixed rules sit in the middle, and three answers come out.",
  },
  fairness: {
    kind: "range",
    from: 0.04,
    to: 0.28,
    max: 0.3,
    label: "Fairness gap · threshold alone",
    factor: "7×",
    tip: "The gap in how often each group gets a yes from the model (0 means equal). Moving only the threshold took it from 0.04 to 0.28.",
  },
  tls: {
    kind: "vault",
    secret: "Password",
    never: ["sees it", "stores it", "pre-computes against it"],
    tests: { passed: 12, total: 12 },
    tip: "The password stays on the user's side: the server never sees it, never stores it, and can't prepare guesses in advance. All 12 tests pass.",
  },
  aes: {
    kind: "keyspace",
    bits: 24,
    before: "Python · too slow",
    after: "C · seconds",
    tip: "The square is the whole search: 2²⁴ ≈ 16.8 million possible keys for a weakened AES. Rewriting the search in C made it finish in seconds.",
  },
  atlas: {
    kind: "units",
    groups: [
      { count: 45, mark: "dot", label: "units" },
      { count: 3, mark: "cross", label: "hospitals" },
    ],
    notes: ["2-day build", "18 tests", "A human approves every dispatch"],
    tip: "One dot = one simulated emergency unit; one cross = one hospital, with live capacity tracking.",
  },
  asuEt: {
    kind: "layers",
    rows: [
      { label: "Work", items: ["DevOps", "Infrastructure"] },
      { label: "Inside", items: ["GitHub org", "AWS"] },
    ],
    tip: "What the role covers, and where the work runs.",
  },
} satisfies Record<string, Graphic>;

export const site: Site = {
  name: "Devansh Verma",
  role: "Software & AI Engineer",

  summary:
    "I build machine-learning systems and run them on real infrastructure. The thread through my work is restraint: a rules layer instead of a rebuilt scoring model, a human approving every automated dispatch, fairness reported as a full range instead of one flattering number. I would rather ship the version that holds up than the version that only demos well.",

  calls: [
    { text: "A rules layer instead of a rebuilt scoring model", project: "Customer-health triage engine" },
    { text: "A human approving every automated dispatch", project: "Atlas — emergency-dispatch copilot" },
    { text: "Fairness reported as a full range instead of one flattering number", project: "Fairness stress-testing framework" },
  ],

  about: [
    "I grew up in New Delhi and moved around a lot, but went to the same school the whole way through — one fixed point while everything else changed. Now I'm in Tempe for an MS in Computer Science at Arizona State.",
    "My favourite player is Messi, and the reason is the honest one: in raw ability he isn't on another planet, he's just outworked everyone for twenty years. Craft over talent. That's the standard I hold my own work to.",
    "Three words my friends use for me: loyal, tenacious, argumentative. I ship fast, I push back when something's too safe, and I'd rather hand you a working prototype than a document describing one.",
    "Away from the keyboard: Barcelona, Vettel-era F1, and more anime and manga than I'll admit on a professional site.",
  ],

  teamSheet: [
    { label: "Home", value: "New Delhi → Tempe" },
    { label: "Favourite player", value: "Messi · craft over talent" },
    { label: "In three words", value: "Loyal · tenacious · argumentative" },
    { label: "Off the keyboard", value: "Barcelona · Vettel-era F1 · anime and manga" },
  ],

  location: "Tempe, Arizona",

  ticker: [
    "7× fairness swing from one threshold",
    "Secure login from scratch: 0 passwords seen by the server",
    "Weakened AES cracked: 2²⁴ keys, Python → C",
    "Atlas — 45 units, 3 hospitals, a 2-day build",
    "NASSCOM-funded startup founder",
    "3 peer-reviewed ML papers",
    "NASA Space Apps 2021 — #1 in India",
  ],

  stats: [
    { value: "7×", label: "fairness swing from one threshold", glyph: { kind: "range", from: 0.04, to: 0.28, max: 0.3 } },
    { value: "2²⁴", label: "keys brute-forced · weakened AES", glyph: { kind: "grid" } },
    { value: "2-day", label: "Atlas build · 45 units · 3 hospitals", glyph: { kind: "marks", count: 2, mark: "day" } },
    { value: "3", label: "peer-reviewed ML papers", glyph: { kind: "marks", count: 3, mark: "sheet" } },
    { value: "₹6L", label: "NASSCOM-funded startup", glyph: { kind: "marks", count: 6, mark: "coin" } },
  ],

  lap: [
    {
      year: "2021",
      headline: "#1",
      unit: "in India",
      title: "NASA Space Apps Challenge",
      detail: "Led the backend that turned NASA datasets into visualizations.",
      graphic: G.nasa,
    },
    {
      year: "2022",
      headline: "150+",
      unit: "students led",
      title: "ISTE Club — General Secretary",
      detail: "Across events and technical initiatives.",
      graphic: G.iste,
    },
    {
      year: "2023",
      headline: "350+",
      unit: "participants",
      title: "BVEST Hackathon",
      detail: "Led a 100-student organizing team. Raised ₹3 lakh in sponsorship.",
      graphic: G.bvest,
    },
    {
      year: "2023",
      headline: "₹6L",
      unit: "seed funding",
      title: "Founded JobCadet",
      detail: "An AI recruitment startup, backed by NASSCOM.",
      graphic: G.jobcadet,
    },
    {
      year: "2023–24",
      headline: "3",
      unit: "peer-reviewed papers",
      title: "Published by Springer",
      detail: "Metal–organic frameworks. Human activity recognition. Speech emotion recognition.",
      graphic: G.papers,
      place: "Research papers",
    },
    {
      year: "2024",
      headline: "ML → prod",
      unit: "APIs and pipelines",
      title: "Times Internet",
      detail: "ML inference APIs and content-classification pipelines, live on Kafka, Redis, Docker, AWS and GCP.",
      graphic: G.times,
      place: "Times Internet",
    },
    {
      year: "2025",
      headline: "vLLM",
      unit: "3 products served",
      title: "LLMs in production · KLJ Group",
      detail: "Billing automation. An email-thread reader. Voice + vision search.",
      graphic: G.klj,
      place: "KLJ Group",
    },
    {
      year: "2025",
      headline: "MS CS",
      unit: "class of 2027",
      title: "Arizona State University",
      detail: "Master's in Computer Science, Tempe.",
      graphic: G.asu,
    },
    {
      year: "2026",
      headline: "Triage",
      unit: "rules, not ML",
      title: "ParentSquare",
      detail: "Tells success managers which accounts need attention, why, and what to do next.",
      graphic: G.triage,
      place: "ParentSquare",
    },
    {
      year: "2026",
      headline: "7×",
      unit: "fairness swing",
      title: "Fairness, stress-tested · team lead",
      detail: "The threshold alone swung the fairness gap 0.04 → 0.28. As big as switching the debiasing method.",
      graphic: G.fairness,
      place: "Fairness framework",
    },
    {
      year: "2026",
      headline: "0",
      unit: "passwords seen",
      title: "Secure login, from scratch",
      detail: "TLS 1.3 + OPAQUE in Python. The server never sees, stores or pre-computes against your password. 12/12 tests.",
      graphic: G.tls,
      place: "TLS 1.3 + OPAQUE",
    },
    {
      year: "CTF",
      headline: "2²⁴",
      unit: "keys brute-forced",
      title: "Weakened AES, cracked",
      detail: "A capture-the-flag key. Too slow in Python; rewritten in C, it fell in seconds.",
      graphic: G.aes,
      place: "AES CTF",
    },
    {
      year: "2026",
      headline: "2 days",
      unit: "to build",
      title: "Atlas — emergency-dispatch copilot",
      detail: "45 units. 3 hospitals. A human approves every dispatch.",
      graphic: G.atlas,
      place: "Atlas",
    },
    {
      year: "Now",
      headline: "Live",
      unit: "current role",
      title: "ASU Enterprise Technology",
      detail: "Student Engineer: DevOps and infrastructure.",
      graphic: G.asuEt,
    },
  ],

  resumeUrl: "/resume.pdf",
  email: "dverma26@asu.edu",
  links: {
    linkedin: "https://www.linkedin.com/in/devansh-verma",
    github: "https://github.com/DevanshV08",
  },

  projects: [
    {
      title: "Atlas — emergency-dispatch copilot",
      tag: "Hackathon · 2-day build · 2026",
      summary:
        "A copilot for 911 dispatch: it transcribes incoming calls, clusters duplicate reports into single incidents, and recommends which units to send.",
      call:
        "The system only recommends — a human dispatcher approves every dispatch. The optimizer re-plans the moment a higher-priority call lands, instead of treating allocation as a one-shot decision.",
      result: "45 units and 3 hospitals simulated with live capacity tracking; 18 tests; built in two days.",
      graphic: G.atlas,
      stack: ["FastAPI", "SQLAlchemy", "React", "Leaflet", "WebSockets", "Docker Compose", "LLMs"],
    },
    {
      title: "Fairness stress-testing framework",
      tag: "Team lead · graduate ML · 2026",
      summary:
        "A framework that tests whether a published fairness fix actually holds up when you change the random seed, the decision threshold, or the subgroup you look at.",
      call:
        "Reported the full range of results across random seeds and thresholds instead of the usual single flattering number — and showed that how fragile a fix is depends on the model.",
      result: "Threshold choice alone swung the fairness gap 7× (0.04 → 0.28), as much as switching the debiasing method.",
      graphic: G.fairness,
      stack: ["scikit-learn", "XGBoost", "Fairlearn", "pandas", "NumPy"],
    },
    {
      title: "Secure login: TLS 1.3 + OPAQUE, from scratch",
      tag: "Applied cryptography · 2026",
      summary:
        "A TLS 1.3–style secure connection built from scratch in Python, with OPAQUE password login in place of the usual Diffie-Hellman key exchange: the server never sees, stores or can pre-compute against your password.",
      call:
        "Ran the OPRF on plain Ed25519 curve operations instead of the textbook Ristretto255 — safe here because every OPRF output is hashed, so no raw curve point is ever exposed.",
      result: "A wrong password fails on your own device and leaks nothing to the server. 12/12 tests pass.",
      graphic: G.tls,
      stack: ["Python", "Ed25519", "X25519", "AES-GCM", "HKDF", "X.509"],
    },
    {
      title: "Customer-health triage engine",
      tag: "Software Engineer Intern · 2026",
      summary:
        "A triage layer on top of an existing customer-health score that tells success managers which accounts need attention, why, and what to do next.",
      call:
        "Built it as deterministic rules, not ML — the logic didn't need a model, and a model would have been harder to trust and to explain to the people acting on it.",
      result: "Surfaced quietly at-risk accounts the existing score never flagged.",
      graphic: G.triage,
      stack: ["Python", "pandas"],
    },
  ],

  experience: [
    {
      title: "Student Engineer, Engineering Technology",
      org: "ASU Enterprise Technology",
      period: "2026 – present",
      summary:
        "DevOps and infrastructure work in the university's central technology organization, inside its GitHub org and AWS environment.",
    },
    {
      title: "Software Engineer Intern",
      org: "ParentSquare",
      period: "2026",
      summary:
        "Built the customer-health triage engine above, plus CRUD feature work on the Digital Business Review product in React and TypeScript on a pull-request CI/CD workflow.",
    },
    {
      title: "AI Engineer",
      org: "KLJ Group",
      period: "2025",
      summary:
        "Built and ran LLM inference pipelines for three products — billing automation, an email-thread reader, and voice + vision search — with Python and Go on the serving path and local and cloud models served through vLLM.",
    },
    {
      title: "AI / ML Engineer",
      org: "Times Internet",
      period: "2024",
      summary:
        "Shipped ML inference APIs and content-classification pipelines; Kafka for async events, Redis for caching, Docker and CI/CD, deployed across AWS and GCP.",
    },
    {
      title: "Hardware Benchmarking, Central Testing Team",
      org: "91mobiles",
      period: "2023 – 2024",
      summary:
        "Benchmarked and analyzed phones across CPU, GPU, memory and thermals, and trained new interns on the process.",
    },
    {
      title: "Founder",
      org: "JobCadet",
      period: "2023 – 2024",
      summary: "AI recruitment startup; raised ₹6 lakh in NASSCOM seed funding.",
    },
  ],

  skills: [
    { name: "Python", about: "The default language for machine learning, data and back-end work.", proof: "KLJ pipelines · fairness framework · triage engine", where: ["KLJ Group", "Fairness framework", "ParentSquare"] },
    { name: "Go", about: "Google's language for fast, simple network services.", proof: "KLJ serving path", where: ["KLJ Group"] },
    { name: "C", about: "A low-level language that runs close to the hardware, used here for raw speed.", proof: "AES cryptanalysis", where: ["AES CTF"] },
    { name: "React · TypeScript", about: "The most widely used library for web interfaces, written in typed JavaScript.", proof: "ParentSquare DBR · Atlas", where: ["ParentSquare", "Atlas"] },
    { name: "FastAPI", about: "A Python framework for building web APIs.", proof: "Atlas", where: ["Atlas"] },
    { name: "vLLM / LLM serving", about: "Running large language models in production; vLLM is an open-source engine that serves them fast.", proof: "KLJ inference products", where: ["KLJ Group"] },
    { name: "PyTorch · scikit-learn · XGBoost", about: "Python's core machine-learning toolkits: deep learning, classic ML and gradient-boosted trees.", proof: "research · fairness framework", where: ["Research papers", "Fairness framework"] },
    { name: "Docker", about: "Packages an app with everything it needs, so it runs the same anywhere.", proof: "Times Internet · Atlas", where: ["Times Internet", "Atlas"] },
    { name: "Kafka · Redis", about: "Kafka streams events between services; Redis is an in-memory store, often used as a cache.", proof: "Times Internet pipelines", where: ["Times Internet"] },
    { name: "AWS · GCP", about: "Amazon's and Google's cloud platforms.", proof: "Times Internet deployments", where: ["Times Internet"] },
    { name: "Applied cryptography", about: "Building real security (encryption, key exchange, secure login) and breaking weakened versions of it.", proof: "TLS 1.3 + OPAQUE · AES CTF", where: ["TLS 1.3 + OPAQUE", "AES CTF"] },
    { name: "D3.js", about: "A JavaScript library for interactive data visualisation.", proof: "interactive data-viz coursework", where: ["Coursework"] },
  ],

  publications: [
    {
      title: "Detection of Open Metal Sites in Metal–Organic Frameworks Using Machine Learning",
      topic: "Metal–organic frameworks",
      venue: "ICICC 2023, Springer LNNS",
      year: 2023,
      href: "https://doi.org/10.1007/978-981-99-3315-0_25",
    },
    {
      title: "Vision-Based Human Activity Recognition Using CNN and LSTM Architecture",
      topic: "Human activity recognition",
      venue: "Advanced Computing (IACC 2023), Springer CCIS",
      year: 2024,
      href: "https://doi.org/10.1007/978-3-031-56700-1_10",
    },
    {
      title: "Multi-featured Speech Emotion Recognition Using Extended Convolutional Neural Network",
      topic: "Speech emotion recognition",
      venue: "Advanced Computing (IACC 2023), Springer CCIS",
      year: 2024,
      href: "https://doi.org/10.1007/978-3-031-56700-1_26",
    },
  ],

  awards: [
    {
      title: "NASA Space Apps Challenge",
      detail: "Ranked #1 in India — led backend work turning NASA datasets into visualizations.",
      year: "2021",
      graphic: G.nasa,
    },
    {
      title: "BVEST Hackathon",
      detail: "Led a 100-student organizing team; 350+ participants and ₹3 lakh in sponsorship raised.",
      year: "2023",
      graphic: G.bvest,
    },
    {
      title: "ISTE Club — General Secretary",
      detail: "Led 150+ students across events and technical initiatives.",
      year: "2022",
      graphic: G.iste,
    },
  ],
};

/** How many project slots the Highlights page shows before real ones exist. */
export const PROJECT_SLOTS = 3;
