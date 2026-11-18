// BLS OEWS, May 2025, national mean annual wages, USD.
export const wageSource = 'https://www.bls.gov/news.release/ocwage.t01.htm'
const occupations = {
  project: ['Project management specialists', 110740],
  events: ['Meeting, convention, and event planners', 66520],
  relations: ['Public relations specialists', 84120],
  fundraising: ['Fundraisers', 77200],
  service: ['Customer service representatives', 46590],
  sales: ['Sales managers', 164350],
  salesEngineering: ['Sales engineers', 130140],
  software: ['Software developers', 148100],
  design: ['Web and digital interface designers', 117490],
} as const
const roleOccupation: Partial<Record<string,keyof typeof occupations>> = {
  'Award program lead':'project',
  'Nominee outreach coordinator':'relations',
  'Jury coordinator':'events',
  'Partnerships lead':'fundraising',
  'Chapter program lead':'project',
  'Community coordinator':'events',
  'Local partnerships lead':'fundraising',
  'Member support coordinator':'service',
  'Distribution lead':'relations',
  'Dispatch and service operations lead':'project',
  'Customer resolution coordinator':'service',
  'Enterprise partnerships lead':'sales',
  'Solutions engineer':'salesEngineering',
  'Implementation and customer success lead':'project',
  'Delivery lead':'project',
  'Operations coordinator':'project',
  'Product engineer':'software',
  'Product designer':'design',
}
export function annualWage(role:string) {
  const occupation=roleOccupation[role]
  return occupation?occupations[occupation]:undefined
}

export function hiringBudget<T extends {added:number;firstMonth:number;lastMonth:number;known:number;monthly:number}>(phases:T[], setupMinor:number) {
  let activeMonthly=0, missing=0, total=0
  const plan=phases.map(phase=>{
    activeMonthly+=phase.monthly
    missing+=phase.added-phase.known
    const spend=activeMonthly*(phase.lastMonth-phase.firstMonth+1)+phase.added*setupMinor
    total+=spend
    return {...phase,spend,partial:missing>0}
  })
  return {plan,total,activeMonthly,missing}
}
