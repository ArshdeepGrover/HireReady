/**
 * Demo content. Two versions of the same real candidate, the author: the
 * template resume most people are taught to write, and the same history
 * rewritten around evidence. Loading both is the quickest way to show what the
 * checks are actually asking for.
 *
 * The phone number is a deliberate placeholder (+91 00000 00000). It still
 * counts as a phone number for the checks, but it reaches nobody.
 */

export interface Sample {
  id: 'weak' | 'strong';
  label: string;
  note: string;
  text: string;
}

const WEAK = [
  'ARSHDEEP SINGH',
  'Email: arshdeepgroverdev@gmail.com | Phone: +91 00000 00000',
  '',
  'CAREER OBJECTIVE',
  'I am a hardworking and passionate software developer looking for a good opportunity in a',
  'reputed organisation where I can utilise my skills and grow along with the company.',
  '',
  'EXPERIENCE',
  'Commudle',
  '- Responsible for working on Angular and Ruby on Rails projects',
  '- Was involved in the payment gateway integration also',
  '- Worked on Google Tag Manager and Sentry',
  'Netplus Broadband',
  '- Responsible for handling customer complaints',
  '',
  'EDUCATION',
  'B.Tech (IT), BBSBEC, Punjab',
  '12th, PSEB',
  '',
  'SKILLS',
  'Angular, Rails, HTML, CSS, MS Office, Good communication skills, Team player, Hardworking',
  '',
  'PERSONAL DETAILS',
  'Nationality: Indian',
  'Hobbies: Photography, web designing',
  '',
  'DECLARATION',
  'I hereby declare that the above information is true to the best of my knowledge.',
  '',
  'Arshdeep Singh',
].join('\n');

const STRONG = [
  'Arshdeep Singh',
  'arshdeepgroverdev@gmail.com | +91 00000 00000 | Delhi NCR, India | Open to remote',
  'https://www.linkedin.com/in/arshdeepgrover | https://arshdeepgrover.dev',
  '',
  'SUMMARY',
  'Full-stack developer with 4 years of experience shipping Angular and Ruby on Rails applications',
  'at Commudle, a developer community platform. Grew from intern to Lead Software Developer,',
  'owning features end to end, from payments to analytics.',
  '',
  'SKILLS',
  'Languages: JavaScript, TypeScript, Ruby, SQL, HTML, CSS, SCSS',
  'Frameworks: Angular, Ruby on Rails, Tailwind CSS, Bootstrap, Nebular, jQuery',
  'Platforms: Sanity (headless CMS), Razorpay, Google Tag Manager, Sentry, Schema.org',
  'Tools: Git, GitHub, GitLab, npm, Figma, Agile',
  '',
  'EXPERIENCE',
  'Lead Software Developer, Commudle, New Delhi (May 2024 – Present)',
  '- Led development of the Angular and Ruby on Rails platform serving 50,000+ developers',
  '- Designed and implemented secure Razorpay payment integrations, streamlining transaction workflows',
  '- Mentored developers and ran Agile sprint planning and code reviews for the web team',
  '',
  'Software Developer, Commudle, New Delhi (Aug 2022 – Apr 2024)',
  '- Built reusable Angular components in TypeScript and SCSS, improving frontend load times by 20%',
  '- Integrated Google Tag Manager for real-time analytics, so tracking changes ship without a redeploy',
  '- Collaborated with designers in Figma and with product managers to ship features in Agile sprints',
  '',
  'Software Developer Intern, Commudle, New Delhi (May 2022 – Jul 2022)',
  '- Developed responsive Angular interfaces used by 10,000+ monthly users',
  '- Integrated Sanity.io as a headless CMS, reducing content update time by 30%',
  '',
  'Technical Support Executive, Netplus Broadband, Ludhiana, Punjab (Dec 2020 – Apr 2022)',
  '- Resolved 50+ broadband and network support tickets a day',
  '- Managed a team of 4 support technicians and streamlined logging, cutting resolution time by 25%',
  '',
  'Teaching Assistant, Coding Ninjas, New Delhi (Apr 2020 – Aug 2020)',
  '- Supported 50+ students debugging Node.js and frontend code across full-stack assignments',
  '',
  'Social Media Handler, BBSBEC, Sirhind, Punjab (Nov 2019 – Nov 2020)',
  "- Managed the college's Facebook and Instagram channels, growing student engagement by 40%",
  '',
  'EDUCATION',
  'B.Tech, Information Technology, Baba Banda Singh Bahadur Engineering College (MRSPTU), Punjab (2016 – 2020)',
  '',
  'CERTIFICATIONS',
  '- Angular Basics and SQL Basics, HackerRank (May 2025)',
  '- Full Stack Web Development (Front End and Node.js), Coding Ninjas (2019 – 2020)',
  '',
  'ACHIEVEMENTS',
  '- Won first place in the web design competition at BBSBEC (Sep 2018)',
  '- Led the Institution of Engineers (India) student chapter; IEEE student branch member (2017 – 2020)',
  '- Judged hackathons and mentored students at developer community events',
].join('\n');

export const SAMPLES: readonly Sample[] = [
  {
    id: 'weak',
    label: 'Before',
    note: 'Arshdeep\'s resume, written the way the college template teaches. Every heading is there, and it still fails.',
    text: WEAK,
  },
  {
    id: 'strong',
    label: 'After',
    note: 'The same person and the same history, rewritten around evidence.',
    text: STRONG,
  },
];

export const SAMPLE_JOB_DESCRIPTION = [
  'Software Development Engineer — Full Stack (Angular, Ruby on Rails)',
  '',
  'We are an edtech company building live learning tools for 200,000 students across India.',
  'You will join the product engineering team that owns our web platform, working remotely or from',
  'our Delhi NCR office.',
  '',
  'What you will do',
  '- Build and maintain features in Angular and TypeScript on the frontend',
  '- Design REST APIs in Ruby on Rails backed by PostgreSQL',
  '- Integrate payment gateways such as Razorpay and keep checkout reliable',
  '- Instrument the product with analytics and error monitoring (Google Tag Manager, Sentry)',
  '- Review code, write unit tests and mentor junior developers',
  '',
  'What we are looking for',
  '- 3+ years building production web applications with Angular',
  '- Solid Ruby on Rails and SQL experience',
  '- Comfortable with Git, CI/CD and Docker',
  '- Experience with a headless CMS is a bonus',
  '- Clear communication with designers and product managers',
].join('\n');
