import metroWages from './metroWages.json'

// BLS OEWS, May 2025. Each row is annual mean, 25th percentile, 75th percentile, in USD.
const metros: Record<string, Record<string, (number|null)[]>> = metroWages
export const wageCities = Object.keys(metros)
export const wageSource = 'https://www.bls.gov/oes/2025/may/oessrcma.htm'
const occupations = {
  project: ['Project management specialists', '131082'],
  events: ['Meeting, convention, and event planners', '131121'],
  relations: ['Public relations specialists', '273031'],
  fundraising: ['Fundraisers', '131131'],
  service: ['Customer service representatives', '434051'],
  sales: ['Sales managers', '112022'],
  salesEngineering: ['Sales engineers', '419031'],
  software: ['Software developers', '151252'],
  design: ['Web and digital interface designers', '151255'],
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
export function matchWageCity(input:string) {
  const city = input.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').toLowerCase()
  return wageCities.find(option => {
    const label = option.toLowerCase()
    return city === label || city === label.split(',')[0] || city === label.replace(',', '')
  })
}

export function annualWage(role:string, city:string) {
  const occupation = roleOccupation[role]
  if (!occupation || !Object.hasOwn(occupations, occupation)) return
  const [title, code] = occupations[occupation]
  const [mean, low, high] = metros[city]?.[code] ?? []
  if (mean == null) return
  return {title, code, mean, low, high}
}
