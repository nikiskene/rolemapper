import { annualWage, matchWageCity, wageCities, wageSource } from './talentBenchmarks'

export type Wage = {
  title:string; code?:string; amount:number; low:number|null; high:number|null
  currency:string; period:'hour'|'month'|'year'; statistic:'mean'|'median'
  geography:string; reference:string; publisher:string; url:string; basis:string
  licence?:string; attribution?:string; range:string; notes?:string; basic?:[number|null,number|null,number|null]
}
type CanadaRow = [string,'hour'|'year',number|null,number|null,number|null,number|null,number|null,number|null,string,string,string]
type Canada = {regions:Record<string,[string,string]>;occupations:Record<string,string>;rows:Record<string,Record<string,CanadaRow>>}
type London = Record<string,[string,number|null,number|null,number|null,number|null,number,string]>
type Singapore = {
  reference:string
  rows:Record<string,[[number|null,number|null,number|null],[number|null,number|null,number|null]]>
}
type Austria = Record<string,[string,number|null,number|null,number|null]>
export type WageData = {canada?:Canada;london?:London;ukNational?:London;singapore?:Singapore;austria?:Austria}

export const marketCurrencies:Record<string,string> = {
  us:'USD', Austria:'EUR', Germany:'EUR', 'United Arab Emirates':'AED', 'United Kingdom':'GBP',
  Switzerland:'CHF', Canada:'CAD', Australia:'AUD', India:'INR', Singapore:'SGD',
}
export const marketNames = Object.keys(marketCurrencies).filter(market=>market!=='us')
const canadaChoices: Record<string,string> = {Toronto:'ER3530',Vancouver:'ER5920'}
const normalize = (text:string) => text.trim().replace(/\s+/g,' ').toLowerCase()
const canadaNames = (data:Canada) => Object.entries(data.regions)
  .filter(([code])=>code.length===6)
  .map(([code,[name,province]])=>[name+(code==='ER5920'?'–Southwest':'')+', '+province,code] as const)
  .sort(([a],[b])=>a.localeCompare(b))

export function locations(market:string,data:WageData) {
  if(market==='us') return wageCities
  if(market==='Canada'&&data.canada) return [...Object.keys(canadaChoices),...canadaNames(data.canada).map(([name])=>name)]
  if(market==='United Kingdom') return ['London']
  if(market==='Singapore') return ['Singapore']
  if(market==='Austria') return ['Vienna']
  return []
}

const disciplines = {
  'Software developer':['21232','2134','software developer'],
  'Product designer':['21233','2141','interaction designer'],
  'Web designer':['21233','2141','interaction designer'],
  'Marketing specialist':['11202','3554','digital marketing professional'],
  'Marketing manager':['10022','2432','marketing manager'],
  'Sales manager':['60010','3556','sales manager'],
  'Project management':['11201','2440','business/financial project management professional'],
  'Operations coordinator':['13201','3543',''],
  'Accountant':['11100','2421','accountant (excluding tax accountant)'],
  'Financial analyst':['11101','2422','financial analyst'],
  'Customer support':['64409','7211','customer service officer/clerk'],
  'Event planner':['12103','3557','exhibition/conference/event planner'],
  'Public relations':['11202','2493','public relations/corporate communications professional'],
} as const
type Discipline = keyof typeof disciplines
const roleDisciplines:Record<string,Discipline> = {
  'product engineer':'Software developer','software engineer':'Software developer','software developer':'Software developer',
  'product designer':'Product designer','web designer':'Web designer','operations coordinator':'Operations coordinator',
  'award program lead':'Event planner','jury coordinator':'Event planner','community coordinator':'Event planner',
  'nominee outreach coordinator':'Public relations','distribution lead':'Marketing specialist',
  'delivery lead':'Project management','implementation and customer success lead':'Project management',
  'enterprise partnerships lead':'Sales manager','local market launch lead':'Marketing manager',
  'member support coordinator':'Customer support','customer resolution coordinator':'Customer support',
  'customer support':'Customer support','customer service representative':'Customer support',
  'sales manager':'Sales manager','marketing specialist':'Marketing specialist','marketing manager':'Marketing manager',
  'accountant':'Accountant','financial analyst':'Financial analyst',
}
const ambiguous = (role:string) => ['product manager','product lead'].includes(normalize(role))
export const isProductRole = ambiguous

function canadaWage(data:Canada,city:string,code:string):Wage|undefined {
  const cityKey = normalize(city)
  const [cityWithoutProvince, provinceSuffix] = cityKey.split(',').map(part=>part.trim())
  const names = canadaNames(data)
  const regionalMatches = names.filter(([name])=>normalize(name).split(',')[0]===cityWithoutProvince)
  const cityAliases:Record<string,string[]> = {toronto:['on','ontario'],vancouver:['bc','british columbia']}
  const matchingAlias = Object.entries(canadaChoices).find(([name])=>{
    const alias = normalize(name)
    return alias===cityWithoutProvince && (!provinceSuffix||cityAliases[alias].includes(provinceSuffix))
  })?.[1]
  const geo = names.find(([name])=>normalize(name)===cityKey)?.[1]
    ?? matchingAlias ?? (!provinceSuffix&&regionalMatches.length===1 ? regionalMatches[0][1] : undefined)
  const province = geo ? data.regions[geo][1] : undefined
  const provincialGeo = Object.keys(data.regions).find(key=>key.length===4 && data.regions[key][1]===province)
  for(const key of [geo,provincialGeo,'ER00']){
    if(!key) continue
    const row = data.rows[key]?.[code]
    if(!row || row[2]===null) continue
    const [reference,period,amount,low,high,,,,survey,comment,sourceMethod] = row
    // The publisher sometimes models a local estimate from a broader input. Keep that note visible.
    const geography = key==='ER00'?'Canada national':key===geo
      ? (key==='ER5920'?'Lower Mainland–Southwest':data.regions[key][0])+' economic region'
      : data.regions[key][0]+' province'
    return {title:data.occupations[code],code:'NOC 2021 '+code,amount,low,high,currency:'CAD',period,
      statistic:'median',geography,reference,publisher:'Employment and Social Development Canada · Job Bank wages, November 2025',
      url:'https://open.canada.ca/data/en/dataset/adad580f-76b0-4502-bd05-20c125de9116',
      licence:'https://open.canada.ca/en/open-government-licence-canada/',
      attribution:'Contains information licensed under the Open Government Licence – Canada.',
      basis:'Published employee wages. Employer contributions and benefits are separate planning assumptions.',
      range:'Published low–high',notes:[survey,sourceMethod,comment,geo&&key!==geo?'Regional median unavailable. Using the displayed broader geography.':''].filter(Boolean).join(' · ')}
  }
}

const austrianGroups:Partial<Record<Discipline,[string,string]>> = {
  'Software developer':['25','Information and communications technology professionals'],
  'Customer support':['42','Customer services clerks'],
  'Accountant':['24','Business and administration professionals'],
  'Financial analyst':['24','Business and administration professionals'],
  'Marketing specialist':['24','Business and administration professionals'],
  'Public relations':['24','Business and administration professionals'],
}

function publishedWage(market:string,city:string,discipline:Discipline,data:WageData):Wage|undefined {
  const [noc,soc,mom] = disciplines[discipline]
  if(market==='Austria'&&data.austria){
    const group = austrianGroups[discipline]
    const row = group && data.austria[group[0]]
    if(!group || !row || row[1]===null) return
    const [original,amount,low,high] = row
    return {title:group[1],code:'ÖISCO-08 '+group[0],amount,low,high,currency:'EUR',period:'hour',
      statistic:'median',geography:'Austria national',reference:'October 2022',
      publisher:'Statistics Austria · Structure of Earnings Survey, Table 5',
      url:'https://www.statistik.at/fileadmin/pages/335/VSE2022_tab2_bruttostundenverdienste_nach_merkmalen_der_besch.ods',
      licence:'https://www.statistik.at/en/about-us/responsibilities-and-principles/legal-basis/website-information',
      basis:'Gross hourly earnings excluding overtime, for employees of covered private establishments with at least 10 workers. Apprentices excluded.',
      range:'P25–P75',notes:'Adapted from Statistics Austria. Published group: '+original}
  }
  if(market==='Canada'&&data.canada) return canadaWage(data.canada,city,noc)
  if(market==='United Kingdom'){
    const local = normalize(city)==='london' ? data.london?.[soc] : undefined
    const useLocal = local?.[1]!=null
    const row = useLocal ? local : data.ukNational?.[soc]
    if(!row || row[1]===null) return
    const [title,amount,low,high,,sourceRow,flags] = row
    const table = useLocal ? '15' : '14'
    const dataset = useLocal ? 'regionbyoccupation4digitsoc2010ashetable15' : 'occupation4digitsoc2010ashetable14'
    return {title,code:'SOC 2020 '+soc,amount,low,high,currency:'GBP',period:'year',statistic:'median',
      geography:useLocal?'London workplace region':'United Kingdom national',reference:'2025 revised',
      publisher:'Office for National Statistics · ASHE Table '+table+'.7a',
      url:'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/'+dataset,
      licence:'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      attribution:'Contains public sector information licensed under the Open Government Licence v3.0.',
      basis:'Annual gross pay for full-time employee jobs, all sexes. Employer contributions and benefits are separate.',
      range:'P25–P75',notes:'Full-Time sheet, row '+sourceRow+', median column D.'
        +(local?.[1]===null?' The London median is suppressed or unavailable.':'')
        +(flags.includes('x')?' Some statistics are suppressed by ONS.':'')}
  }
  if(market==='Singapore'&&(!city.trim()||normalize(city)==='singapore')&&data.singapore){
    const row = data.singapore.rows[mom]
    if(!row || row[0][0]===null) return
    const [[amount,low,high], basic] = row
    return {title:mom,amount,low,high,basic,currency:'SGD',period:'month',statistic:'median',geography:'Singapore national (city-state)',
      reference:data.singapore.reference,publisher:'Singapore Ministry of Manpower · Resident Occupational Wages',
      url:'https://data.gov.sg/datasets/d_9917e751f7498502f70052a940a3f312/view',
      licence:'https://developers.data.gov.sg/open-data-licence',
      attribution:'Contains information from Resident Occupational Wages, '+data.singapore.reference+' accessed on 18 November 2026 from data.gov.sg, made available under the Singapore Open Data Licence v1.0.',
      basis:'Monthly gross wage includes regular overtime, commissions and allowances. Bonuses and employer CPF are excluded.',
      range:'P25–P75',notes:'Full-time residents at private establishments with at least 25 employees.'}
  }
}

export function wageOptions(role:string,market:string,city:string,data:WageData) {
  if(market==='us'){
    const metro = matchWageCity(city)
    const lookup = ['software developer','software engineer'].includes(normalize(role))?'Product engineer':role
    const wage = metro && !ambiguous(role) ? annualWage(lookup,metro) : undefined
    const project = metro && ambiguous(role) ? annualWage('Delivery lead',metro) : undefined
    const sales = metro && ambiguous(role) ? annualWage('Enterprise partnerships lead',metro) : undefined
    const wrap = (item:NonNullable<typeof wage>):Wage => ({
      title:item.title,code:'SOC '+item.code,amount:item.mean,low:item.low??null,high:item.high??null,currency:'USD',period:'year',
      statistic:'mean',geography:metro+' metro area',reference:'May 2025',
      publisher:'U.S. Bureau of Labor Statistics · OEWS',url:wageSource,range:'P25–P75',
      basis:'Annual employee wages. Add employer taxes and benefits separately.',
    })
    if(wage) return [wrap(wage)]
    return [project,sales].flatMap(item=>item?[wrap(item)]:[])
  }
  const key = normalize(role)
  const direct = Object.hasOwn(roleDisciplines,key) ? roleDisciplines[key] : undefined
  const candidates:Discipline[] = ambiguous(role)?['Project management','Marketing manager']:direct?[direct]:[]
  return candidates.flatMap(candidate=>{
    const wage = publishedWage(market,city,candidate,data)
    return wage?[wage]:[]
  })
}
export function monthlyWage(wage:Wage,hours:number,weeks:number) {
  if(wage.period==='hour') return wage.amount*hours*weeks/12
  return wage.period==='year'?wage.amount/12:wage.amount
}
export function amountText(currency:string,value:number,precision=2) {
  return currency+' '+new Intl.NumberFormat('en',{maximumFractionDigits:precision}).format(value)
}
