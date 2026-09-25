/**
 * Word lists the checks match against.
 *
 * These are heuristics, not truth. They encode the patterns that show up
 * over and over in entry-level resumes, mostly from Indian undergraduate
 * programmes where the "personal details + declaration" template is still
 * taught. Keep entries lowercase; matching is done on lowercased text.
 */

/** Verbs that describe ownership of work. Used to grade bullet openings. */
export const ACTION_VERBS: readonly string[] = [
  'accelerated', 'achieved', 'added', 'analysed', 'analyzed', 'architected', 'automated',
  'benchmarked', 'built', 'centralised', 'centralized', 'collaborated', 'compiled', 'configured',
  'consolidated', 'constructed', 'converted', 'coordinated', 'created', 'cut', 'debugged',
  'decreased', 'deployed', 'designed', 'developed', 'devised', 'diagnosed', 'documented',
  'doubled', 'drove', 'earned', 'eliminated', 'engineered', 'enhanced', 'established',
  'evaluated', 'expanded', 'extended', 'facilitated', 'fixed', 'forecast', 'formulated',
  'founded', 'generated', 'guided', 'halved', 'handled', 'hosted', 'identified', 'implemented',
  'improved', 'increased', 'initiated', 'instrumented', 'integrated', 'introduced', 'launched',
  'led', 'localised', 'localized', 'maintained', 'managed', 'mapped', 'measured', 'mentored',
  'migrated', 'modelled', 'modeled', 'modernised', 'modernized', 'monitored', 'negotiated',
  'optimised', 'optimized', 'orchestrated', 'organised', 'organized', 'overhauled', 'parsed',
  'partnered', 'performed', 'pioneered', 'planned', 'presented', 'prototyped', 'published',
  'rearchitected', 'rebuilt', 'reduced', 'refactored', 'released', 'removed', 'repaired',
  'replaced', 'reported', 'researched', 'resolved', 'restructured', 'revamped', 'saved',
  'scaled', 'scripted', 'secured', 'shipped', 'simplified', 'solved', 'sourced', 'standardised',
  'standardized', 'streamlined', 'strengthened', 'supported', 'surveyed', 'sustained', 'synced',
  'taught', 'tested', 'tracked', 'trained', 'transformed', 'translated', 'trimmed', 'tuned',
  'unified', 'upgraded', 'validated', 'visualised', 'visualized', 'won', 'wrote',
];

/**
 * Phrases that consume space without saying anything. Every fresher writes
 * them, so they carry no signal for a recruiter.
 */
export const FILLER_PHRASES: readonly string[] = [
  'a quick learner', 'ability to work under pressure', 'as per requirement', 'best of my knowledge',
  'bunch of', 'dynamic personality', 'eager to learn', 'excellent communication',
  'exposure to', 'familiar with', 'go-getter', 'good communication skills', 'good knowledge of',
  'hard working', 'hard-working', 'hardworking', 'helped in', 'honest and sincere',
  'i hereby declare', 'involved in', 'keen to learn', 'known for', 'looking for a good opportunity',
  'out of the box', 'passionate', 'problem solving skills', 'quick learner', 'reputed organisation',
  'reputed organization', 'responsible for', 'results-driven', 'seeking a challenging',
  'self-motivated', 'self motivated', 'sincere and hardworking', 'synergy', 'take initiative',
  'team player', 'think outside the box', 'utilise my skills', 'utilize my skills',
  'well versed', 'well-versed', 'willing to learn', 'work under pressure', 'worked on',
  'working knowledge', 'go the extra mile', 'detail oriented', 'detail-oriented',
];

/**
 * Details that belong on a government form, not a resume. In most markets
 * asking for these is unlawful, and volunteering them invites bias.
 */
export const PERSONAL_DETAILS: readonly string[] = [
  "father's name", 'fathers name', 'father name', "mother's name", 'mothers name',
  'date of birth', 'dob:', 'd.o.b', 'birth date', 'marital status', 'nationality',
  'religion', 'caste', 'category:', 'gender:', 'sex:', 'blood group', 'passport number',
  'aadhaar', 'aadhar', 'pan number', 'declaration', 'i hereby declare', 'passport size',
  'permanent address', 'languages known:', 'hobbies:', 'age:', 'height:', 'weight:',
];

/** Objective-statement openings that signal a template resume. */
export const WEAK_OPENERS: readonly string[] = [
  'to obtain a position', 'seeking a position', 'looking for an opportunity',
  'to work in a reputed', 'i am a', 'i am an', 'my objective', 'to secure a',
  'where i can utilise', 'where i can utilize', 'to enhance my skills',
];

/**
 * Concrete, searchable technologies. Grouped so the skills check can tell a
 * candidate who lists one language from one who shows an actual stack.
 */
export const SKILL_GROUPS: Readonly<Record<string, readonly string[]>> = {
  languages: [
    'javascript', 'typescript', 'python', 'java', 'kotlin', 'swift', 'c++', 'c#', 'c language',
    'go', 'golang', 'rust', 'ruby', 'php', 'scala', 'dart', 'r', 'matlab', 'perl', 'bash',
    'shell scripting', 'sql', 'html', 'css', 'sass', 'scss',
  ],
  frontend: [
    'react', 'react.js', 'reactjs', 'next.js', 'nextjs', 'angular', 'vue', 'vue.js', 'svelte',
    'redux', 'zustand', 'tailwind', 'tailwindcss', 'bootstrap', 'material ui', 'jquery',
    'webpack', 'vite', 'three.js', 'd3.js', 'flutter', 'react native', 'jetpack compose',
  ],
  backend: [
    'node.js', 'nodejs', 'express', 'nestjs', 'django', 'flask', 'fastapi', 'spring',
    'spring boot', 'laravel', 'rails', '.net', 'asp.net', 'graphql', 'rest api', 'grpc',
    'websocket', 'microservices', 'kafka', 'rabbitmq', 'celery',
  ],
  data: [
    'mysql', 'postgresql', 'postgres', 'mongodb', 'sqlite', 'redis', 'elasticsearch',
    'dynamodb', 'firebase', 'firestore', 'supabase', 'snowflake', 'bigquery', 'hadoop',
    'spark', 'pandas', 'numpy', 'scikit-learn', 'sklearn', 'tensorflow', 'pytorch', 'keras',
    'opencv', 'nltk', 'power bi', 'tableau', 'looker', 'dbt', 'airflow', 'etl',
  ],
  infra: [
    'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform', 'ansible',
    'jenkins', 'github actions', 'gitlab ci', 'circleci', 'nginx', 'linux', 'ubuntu',
    'vercel', 'netlify', 'heroku', 'cloudflare', 'ec2', 's3', 'lambda', 'ci/cd',
  ],
  tools: [
    'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'postman', 'figma',
    'selenium', 'cypress', 'playwright', 'jest', 'vitest', 'pytest', 'junit', 'mocha',
    'swagger', 'notion', 'slack', 'agile', 'scrum', 'kanban', 'tdd', 'unit testing',
  ],
};

/** Flat list of every known technology term. */
export const ALL_SKILLS: readonly string[] = Object.values(SKILL_GROUPS).flat();

/**
 * "Skills" that are really personality claims. Harmless in small doses but
 * they should never outnumber the real ones.
 */
export const SOFT_SKILL_FLUFF: readonly string[] = [
  'ms office', 'microsoft office', 'ms word', 'ms excel', 'ms powerpoint', 'typing',
  'internet surfing', 'computer basics', 'leadership quality', 'time management',
  'multitasking', 'positive attitude', 'punctuality', 'discipline', 'adaptability',
  'interpersonal skills', 'decision making', 'creativity', 'flexibility',
];

/** Headings the resume is expected to carry, and the patterns that find them. */
export const SECTION_PATTERNS: ReadonlyArray<{
  key:
    | 'education' | 'skills' | 'projects' | 'experience' | 'summary'
    | 'certifications' | 'achievements' | 'personal' | 'declaration';
  label: string;
  /** Matched against a candidate heading line, lowercased. */
  re: RegExp;
  /** Counts toward the "expected sections" score. */
  expected: boolean;
}> = [
  { key: 'education', label: 'Education', expected: true, re: /^(education|academic|academics|academic (background|qualification|details)|qualifications?|educational qualifications?)\b/ },
  { key: 'skills', label: 'Skills', expected: true, re: /^(technical )?(skills?|competenc(y|ies)|tech(nical)? stack|technologies|areas of expertise)\b/ },
  { key: 'projects', label: 'Projects', expected: true, re: /^(academic |personal |key |major |selected )?projects?\b|^project work\b/ },
  { key: 'experience', label: 'Experience', expected: true, re: /^(work |professional |relevant |industrial )?(experience|employment|internships?|training|apprenticeship)\b/ },
  { key: 'summary', label: 'Summary', expected: false, re: /^(summary|professional summary|profile|about me|career (objective|summary)|objective)\b/ },
  { key: 'certifications', label: 'Certifications', expected: false, re: /^(certifications?|certificates?|courses?|licenses?|trainings?)\b/ },
  { key: 'achievements', label: 'Achievements', expected: false, re: /^(achievements?|accomplishments?|awards?|honors?|honours?|extra[- ]?curricular|activities|positions? of responsibility|volunteer)\b/ },
  { key: 'personal', label: 'Personal details', expected: false, re: /^(personal (details|information|profile)|bio[- ]?data|hobbies|interests|languages known)\b/ },
  { key: 'declaration', label: 'Declaration', expected: false, re: /^declaration\b/ },
];

/**
 * Units that turn a claim into a measurable result. Used to find quantified
 * bullets like "cut load time by 40%" or "handled 500+ records".
 */
export const METRIC_UNIT_PATTERN =
  /\b\d+(?:[.,]\d+)?\s?(?:%|percent|x\b|k\b|lakh|lakhs|crore|crores|mn\b|million|billion|bn\b|users?|customers?|students?|clients?|members?|downloads?|installs?|requests?|queries|records?|rows?|entries|tickets?|orders?|transactions?|pages?|articles?|posts?|repos?|commits?|tests?|bugs?|hours?|hrs?|mins?|minutes?|seconds?|secs?|ms\b|days?|weeks?|months?|years?|yrs?|rs\.?|inr|usd|\$|₹|gb\b|mb\b|kb\b|tb\b|fps\b|qps\b|rps\b|teams?|people|members|participants?)/gi;

/** A bare percentage or currency figure anywhere in a line. */
export const LOOSE_METRIC_PATTERN = /(\d+(?:[.,]\d+)?\s?%|[₹$]\s?\d|\b\d{3,}\b)/;

/** First-person pronouns. Resumes are written in implied first person. */
export const PRONOUN_PATTERN = /\b(i|i'm|i am|i've|i'll|my|me|myself|mine)\b/gi;

/** Common words to drop when mining a job description for keywords. */
export const STOPWORDS: ReadonlySet<string> = new Set(
  `a about above across after again against all almost alone along already also although always am among an and
  another any anybody anyone anything anywhere apply are area areas around as ask asked asking asks at away back
  backed backing backs be became because become becomes been before began behind being beings below best better
  between big both but by came can cannot candidate candidates case cases certain certainly clear clearly come
  company could day days did differ different differently do does doing done down downed downing downs during
  each early either else end ended ending ends enough equally etc even evenly ever every everybody everyone
  everything everywhere excellent experience face faces fact facts far felt few find finds first for four from
  full fully further furthered furthering furthers gave general generally get gets give given gives go going good
  goods got great greater greatest group grouped grouping groups had has have having he her here herself high
  higher highest him himself his how however if important in interest interested interesting interests into is it
  its itself join just keep keeps kind knew know known knows large largely last later latest least less let lets
  like likely long longer longest looking made make making man many may me member members men might more most
  mostly mr mrs much must my myself necessary need needed needing needs never new newer newest next no nobody non
  noone not nothing now nowhere number numbers of off often old older oldest on once one only open opened opening
  opens or order ordered ordering orders other others our out over part parted parting parts per perhaps place
  places please plus point pointed pointing points possible preferred present presented presenting presents
  problem problems put puts quite rather really required requirement requirements responsibilities right role
  room rooms said same saw say says second seconds see seem seemed seeming seems sees several shall she should
  show showed showing shows side sides since small smaller smallest so some somebody someone something somewhere
  state states still stop strong strongly such sure take taken team than that the their them then there
  therefore these they thing things think thinks this those though thought thoughts three through thus to today
  together too took toward turn turned turning turns two under until up upon us use used uses using very want
  wanted wanting wants was way ways we well wells went were what when where whether which while who whole whose
  why will with within without work worked working works would year years yet you young younger youngest your
  yours ability across additional adept ideal opportunity opportunities candidate looking hiring apply
  responsibilities qualifications benefits salary location remote onsite hybrid position job title description
  about us who we are what you will do nice to have must have bonus points`
    .split(/\s+/)
    .filter(Boolean),
);

/** Multi-word phrases worth keeping intact when mining a job description. */
export const KEYWORD_BIGRAM_ALLOWLIST: ReadonlySet<string> = new Set([
  'machine learning', 'deep learning', 'data structures', 'data science', 'data analysis',
  'data engineering', 'computer science', 'software development', 'software engineering',
  'web development', 'mobile development', 'full stack', 'front end', 'back end',
  'rest api', 'unit testing', 'version control', 'object oriented', 'operating systems',
  'cloud computing', 'natural language', 'computer vision', 'business intelligence',
  'continuous integration', 'test automation', 'code review', 'agile methodology',
  'problem solving', 'system design', 'distributed systems', 'microservices architecture',
]);

/** File-name patterns that read as careless to a recruiter. */
export const SLOPPY_FILENAME_PATTERN =
  /(^|[^a-z])(final|final2|finalfinal|new|latest|copy|draft|updated?|v\d|resume\d|untitled|document|doc\d|cv\d|fresher|naukri|mynewresume)([^a-z]|$)/i;
