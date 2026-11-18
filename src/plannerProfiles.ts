export const patterns = {
  award: {
    label: 'Run an award or recognition program',
    signals: [/beautiful success award|award(s)? program|award nominations|nominations/i, /jur(y|ors)|judging|recognition/i],
    roles: [
      ['Award program lead','Owns the calendar, criteria and delivery of the award cycle.'],
      ['Nominee outreach coordinator','Builds a strong nomination pipeline and helps entrants complete submissions.'],
      ['Jury coordinator','Recruits judges, manages conflicts and keeps evaluations on schedule.'],
      ['Partnerships lead','Secures sponsors and partners aligned with the program.'],
    ],
    milestones: ['Agree on criteria and run one end-to-end award cycle.', 'Build a recurring nomination pipeline and onboard judges.', 'Document the cycle and secure partners for the next edition.'],
    example: 'Run one complete award cycle with 50 qualified nominations.',
  },
  network: {
    label: 'Grow a chapter or member network',
    signals: [/chapter network|local chapters|community chapters|member network/i, /community members|volunteers|chapter lead/i],
    roles: [
      ['Chapter program lead','Defines the chapter model and supports local leads.'],
      ['Community coordinator','Onboards members and helps chapters run recurring events.'],
      ['Local partnerships lead','Recruits chapter hosts and local partners.'],
      ['Member support coordinator','Keeps feedback, participation and retention visible.'],
    ],
    milestones: ['Support one pilot chapter with a clear mandate.', 'Repeat what worked with more local leads.', 'Give chapters standard tools and a reliable support rhythm.'],
    example: 'Launch three chapters that each run a recurring program.',
  },
  research: {
    label: 'Publish research and build an audience',
    signals: [/research institute|research program|thought leadership|publish research/i, /reports|researchers|publications/i],
    roles: [
      ['Research lead','Sets the agenda, methods and quality bar.'],
      ['Research and editorial coordinator','Moves work from sourcing and interviews through review and publication.'],
      ['Distribution lead','Gets the findings to the audiences that can use them.'],
      ['Research partnerships lead','Builds relationships with contributors and research partners.'],
    ],
    milestones: ['Choose a focused question and publish one pilot piece.', 'Set a publication cadence and distribution plan.', 'Repeat with contributors and measure audience reach.'],
    example: 'Publish four reports that reach our target audience.',
  },
  field: {
    label: 'Scale a local service or provider network',
    signals: [/home repair|handyman|plumber|electrician|tradespeople|field service/i, /vetted pros|dispatch|job completion|provider network|contractors/i],
    roles: [
      ['Dispatch and service operations lead','Owns intake, matching, scheduling and response times.'],
      ['Provider network and quality lead','Recruits and verifies providers and follows up on job quality.'],
      ['Customer resolution coordinator','Handles job updates, escalations and service recovery.'],
      ['Local market launch lead','Builds provider coverage and demand in the next service area.'],
    ],
    milestones: ['Make response times and job quality reliable in one area.', 'Add provider capacity and track completion and rework.', 'Expand only after the current service area can run reliably.'],
    example: 'Double completed jobs in Vienna while keeping first response under 24 hours.',
  },
  sales: {
    label: 'Win and onboard more business customers',
    signals: [/agentic os|on-prem|enterprise software|b2b|corporates/i, /pilot|implementation|data sovereignty|proof of concept|integration|datenhoheit/i, /agentic os|enterprise software|on-prem/i],
    roles: [
      ['Enterprise partnerships lead','Qualifies buyers and owns the pipeline from first conversation to pilot.'],
      ['Solutions engineer','Scopes integrations, security requirements and pilot success criteria.'],
      ['Implementation and customer success lead','Moves pilots into production and owns adoption.'],
      ['Account executive','Builds repeatable sales from the pilot evidence.'],
    ],
    milestones: ['Agree on the buyer, pilot offer and success criteria.', 'Deliver a few pilots and capture what blocks deployment.', 'Turn successful pilots into repeatable sales and onboarding.'],
    example: 'Convert three pilots into annual customers.',
  },
  delivery: {
    label: 'Deliver more work for existing customers',
    signals: [/consulting|professional services|client delivery|agency/i, /workshops|projects|service delivery/i],
    roles: [
      ['Delivery lead','Owns schedules, output quality and commitments to customers.'],
      ['Operations coordinator','Plans capacity, handoffs and project logistics.'],
      ['Delivery specialist','Adds hands-on project capacity where demand is proven.'],
      ['Quality lead','Makes review, escalation and customer feedback repeatable.'],
    ],
    milestones: ['Define a delivery standard and establish ownership.', 'Add capacity at the busiest handoff.', 'Standardize quality checks before increasing volume again.'],
    example: 'Deliver twice as many projects without extending turnaround.',
  },
  product: {
    label: 'Build and launch a product',
    signals: [/software|platform|product|app/i, /release|roadmap|developer|prototype/i],
    roles: [
      ['Product lead','Chooses the user problem and owns scope and priorities.'],
      ['Product engineer','Builds and operates the initial product.'],
      ['Product designer','Validates workflows and improves adoption.'],
      ['Customer success lead','Supports early users and brings feedback into the roadmap.'],
    ],
    milestones: ['Confirm the problem and define an initial release.', 'Ship to early users and measure adoption.', 'Improve retention and support before scaling distribution.'],
    example: 'Release a product that 20 pilot users use weekly.',
  },
} as const

export type Pattern = keyof typeof patterns

export function suggestedPattern(text:string):Pattern|undefined {
  const ranked = (Object.keys(patterns) as Pattern[]).map(key=>({
    key,
    score:patterns[key].signals.reduce((score,signal,index)=>score+(signal.test(text)?3-index:0),0),
  })).sort((a,b)=>b.score-a.score)
  return ranked[0].score>=3 && ranked[0].score>ranked[1].score ? ranked[0].key : undefined
}
