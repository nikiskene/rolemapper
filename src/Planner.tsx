import { useRef, useState, type FormEvent } from 'react'

import { amountText, isProductRole, marketCurrencies, monthlyWage, wageOptions } from './internationalWages'
import { HireWageFields, LocationInput, MarketChoices, WageDetails, useWageData, type HireInput, type PlannedHire } from './PlannerWages'
import { patterns, suggestedPattern, type Pattern } from './plannerProfiles'

const currencies = ['USD','EUR','AED','GBP','CHF','CAD','AUD','INR','SGD','MXN','PLN','CZK','JPY','NZD','BRL','ZAR'] as const
const steps = ['Organization','Goal and team','Location and budget','Your plan']
const phases = ['Establish ownership','Add capacity','Build for scale']

type Source = {url:string;title:string;headings:string[];excerpt:string}
type SiteProfile = {name:string;description:string;text:string;sources:Source[];insights:{label:string;quote:string;url:string}[]}

export function Planner() {
  const [step,setStep] = useState(0)
  const [goal,setGoal] = useState<Pattern|'other'|''>('')
  const [siteUrl,setSiteUrl] = useState('')
  const [profile,setProfile] = useState<SiteProfile|null>(null)
  const [name,setName] = useState('')
  const [description,setDescription] = useState('')
  const [loading,setLoading] = useState(false)
  const [siteError,setSiteError] = useState('')
  const [covered,setCovered] = useState<string[]>([])
  const [priority,setPriority] = useState('')
  const [customRole,setCustomRole] = useState('')
  const [objective,setObjective] = useState('')
  const [current,setCurrent] = useState<number>(NaN)
  const [target,setTarget] = useState<number>(NaN)
  const [months,setMonths] = useState(12)
  const [currency,setCurrency] = useState('USD')
  const [market,setMarket] = useState('')
  const [city,setCity] = useState('')
  const [hireInputs,setHireInputs] = useState<Record<string,HireInput>>({})
  const [hours,setHours] = useState('40')
  const [weeks,setWeeks] = useState('52')
  const {data:wageData,loaded:wagesLoaded,failed:wageFailures} = useWageData(step>=2)
  const [useBenchmarks,setUseBenchmarks] = useState(true)
  const [burden,setBurden] = useState('')
  const [cost,setCost] = useState('')
  const [setup,setSetup] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const pattern = goal && goal!=='other' ? patterns[goal] : undefined
  const roles = pattern?.roles ?? (customRole.trim() ? [[customRole.trim(),'Owns the first responsibility you identified.']] : [])
  const gaps = roles.filter(([role])=>!covered.includes(role))
    .sort(([a],[b])=>Number(b===priority)-Number(a===priority))
  const suggestedHires = Math.min(gaps.length, 2)
  const hires = Number.isNaN(target) ? Math.min(suggestedHires,500-current) : target-current
  const phaseCount = Math.min(3, months, Math.max(hires, 1))
  const marketLabel = [city.trim(),market==='us'?'United States':market==='remote'?'Remote':market==='other'?null:market].filter(Boolean).join(', ')
  const namedHires = gaps.slice(0,Math.max(0,hires))
  const hiresByRole:PlannedHire[] = Array.from({length:Math.max(0,hires)},(_,index)=>{
    const named = namedHires[index]?.[0]
    const role = named ?? 'Additional hire '+(index-namedHires.length+1)
    const id = named ? 'role:'+named : 'hire:'+index
    const input = hireInputs[id] ?? {}
    const hireMarket = input.market || market
    const hireCity = input.market ? input.city??'' : city
    const hireCurrency = marketCurrencies[hireMarket] ?? currency
    const options = named||hireMarket==='Austria' ? wageOptions(role,hireMarket,hireCity,wageData) : []
    const needsProxy = isProductRole(role) || options.length>1
    const wage = needsProxy ? options.find(option=>option.title===input.proxy) : options[0]
    const allocation = Number(input.allocation??100)/100
    const wageMonthly = wage ? monthlyWage(wage,Number(hours),Number(weeks))*allocation : null
    const manual = input.manual?.[hireCurrency] ?? ''
    const manualWage = manual!=='' ? Number(manual)*allocation : null
    const published = useBenchmarks ? wageMonthly : null
    const fallback = cost!==''&&hireCurrency===currency ? Number(cost)*allocation : null
    const assumption = manualWage ?? published ?? fallback
    const assumptionSource = manualWage!==null ? 'Manual override' : published!==null ? 'Published wage' : fallback!==null ? 'Shared fallback' : ''
    const employerRate = input.burden || burden
    const employer = assumption===null||employerRate==='' ? null : assumption*(1+Number(employerRate)/100)
    return {id,role,named:!!named,market:hireMarket,city:hireCity,currency:hireCurrency,input,options,wage,needsProxy,assumption,assumptionSource,employer}
  })
  const missing = hiresByRole.filter(hire=>hire.assumption===null).length
  const employerMissing = hiresByRole.filter(hire=>hire.assumption!==null&&hire.employer===null).length
  const total = new Map<string,number>()
  const activeMonthly = new Map<string,number>()
  let assigned = 0
  const plan = Array.from({length:phaseCount},(_,index)=>{
    const added = Math.floor(hires/phaseCount)+(index<hires%phaseCount?1:0)
    const firstMonth = Math.floor(index*months/phaseCount)+1
    const lastMonth = Math.floor((index+1)*months/phaseCount)
    const newHires = hiresByRole.slice(assigned,assigned+added)
    assigned += added
    for(const hire of newHires){
      const monthly = hire.employer ?? hire.assumption
      if(monthly!==null) activeMonthly.set(hire.currency,(activeMonthly.get(hire.currency)??0)+Math.round(monthly*100))
    }
    const spend = new Map([...activeMonthly].map(([code,minor])=>[code,minor*(lastMonth-firstMonth+1)]))
    if(setup!==''&&added) spend.set(currency,(spend.get(currency)??0)+Math.round(Number(setup)*100)*added)
    for(const [code,minor] of spend) total.set(code,(total.get(code)??0)+minor)
    return {added,firstMonth,lastMonth,roles:newHires.filter(hire=>hire.named).map(hire=>hire.role),spend,
      partial:hiresByRole.slice(0,assigned).some(hire=>hire.employer===null)}
  })
  const moneyList = (values:Map<string,number>)=>[...values].sort(([a],[b])=>a.localeCompare(b)).map(([code,minor])=>amountText(code,minor/100)).join(' · ')
  const changeHire = (id:string,values:Partial<HireInput>) => setHireInputs(current=>({...current,[id]:{...current[id],...values}}))
  async function readSite() {
    if (loading || !siteUrl.trim()) return
    setLoading(true)
    setSiteError('')
    setProfile(null)
    try {
      const result = await fetch('/api/site-context',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:siteUrl.trim()}),
      })
      const data = await result.json()
      if (!result.ok) throw new Error(data.error || 'Website lookup failed.')
      const found = data as SiteProfile
      setProfile(found)
      if (found.name) setName(found.name)
      if (found.description) setDescription(found.description)
      const recommendation = suggestedPattern(found.text)
      if (recommendation && recommendation!==goal) {
        setGoal(recommendation)
        setCovered([])
        setPriority('')
      }
    } catch {
      setSiteError('We couldn’t read that site. Try its public HTTPS address or continue with a short description.')
    } finally {
      setLoading(false)
    }
  }

  function move(next:number) {
    setStep(next)
    requestAnimationFrame(()=>heading.current?.focus())
  }
  function advance(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    move(step+1)
  }

  return <section className="planner-card" aria-labelledby="planner-step">
    <ol className="planner-steps" aria-label="Planner progress">{steps.map((label,index)=><li key={label} aria-current={step===index?'step':undefined}>{label}</li>)}</ol>
    <h2 id="planner-step" ref={heading} tabIndex={-1}>{steps[step]}</h2>
    {step!==3?<form onSubmit={advance} key={step}>
      {step===0&&<>
        <label>Public website (optional)<input inputMode="url" autoComplete="url" maxLength={500} value={siteUrl}
          onChange={event=>{setSiteUrl(event.target.value);setSiteError('');setProfile(null)}} placeholder="example.com" disabled={loading}/></label>
        <div><button type="button" className="site-button secondary" disabled={loading||!siteUrl.trim()} onClick={()=>void readSite()}>{loading?'Reading website…':'Read website'}</button></div>
        {siteError&&<p role="status">{siteError}</p>}
        {!!profile?.insights.length&&<section className="site-sources" aria-label="Website highlights">
          <strong>What we found</strong>
          <ul>{profile.insights.map(insight=><li key={insight.label}><strong>{insight.label}</strong>
            <p>{insight.quote} <a href={insight.url} target="_blank" rel="noreferrer" aria-label={insight.label+' source'}>Source</a></p>
          </li>)}</ul>
        </section>}
        {profile&&<details className="site-sources"><summary>Found {profile.sources.length} public {profile.sources.length===1?'page':'pages'}. Review sources</summary>
          <ul>{profile.sources.map(source=><li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
            {source.excerpt&&<p>{source.excerpt}</p>}
            {source.headings.length>0&&<p>{source.headings.join(' · ')}</p>}
          </li>)}</ul>
        </details>}
        <label>Organization name (optional)<input maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label>
        <label>What does the organization do? (optional)<textarea maxLength={360} value={description} onChange={event=>setDescription(event.target.value)} placeholder="What do you offer, and who is it for?"/></label>
        <label>What work do you want to grow?<select required value={goal} onChange={event=>{
          setGoal(event.target.value as Pattern|'other'|'')
          setCovered([])
          setPriority('')
        }}>
          <option value="">Choose an operating pattern</option>
          {Object.entries(patterns).map(([value,option])=><option key={value} value={value}>{option.label}</option>)}
          <option value="other">Something else</option>
        </select></label>
        {profile&&goal&&<p>Review the description and choose the work you want this plan to focus on.</p>}
      </>}
      {step===1&&<>
        <label>What would success look like?<textarea required value={objective} onChange={e=>setObjective(e.target.value)} maxLength={300} placeholder={pattern?.example||'Describe an observable milestone.'}/></label>
        {goal==='other'&&<label>What new responsibility needs an owner?<input value={customRole} onChange={event=>setCustomRole(event.target.value)} maxLength={100} required/></label>}
        {pattern&&<fieldset className="planner-coverage"><legend>Which responsibilities already have enough coverage?</legend>
          {roles.map(([role,duty])=><label key={role}>
            <input type="checkbox" checked={covered.includes(role)} onChange={event=>{
              setCovered(existing=>event.target.checked?[...existing,role]:existing.filter(value=>value!==role))
              if (event.target.checked && priority===role) setPriority('')
            }}/>
            <span><strong>{role}</strong><small>{duty}</small></span>
          </label>)}
        </fieldset>}
        {gaps.length>1&&<label>Which gap should you address first?<select value={priority} onChange={event=>setPriority(event.target.value)}>
          <option value="">Suggest a priority</option>
          {gaps.map(([role])=><option key={role}>{role}</option>)}
        </select></label>}
        <label>How many people are on the team today?<input type="number" min="1" max="500" step="1" required value={Number.isNaN(current)?'':current} onChange={e=>setCurrent(e.target.valueAsNumber)}/></label>
        <label>Target team size (optional)<input type="number" min={current||1} max="500" step="1" placeholder="Suggest a starting point" value={Number.isNaN(target)?'':target} onChange={e=>setTarget(e.target.valueAsNumber)}/></label>
        <label>How many months do you have?<input type="number" min="1" max="60" step="1" required value={Number.isNaN(months)?'':months} onChange={e=>setMonths(e.target.valueAsNumber)}/></label>
      </>}
      {step===2&&<>
        <label>Where will you hire?<select value={market} onChange={event=>{
          const next = event.target.value
          setMarket(next)
          setCity(next==='Singapore'?'Singapore':'')
          if(marketCurrencies[next]&&!cost&&!setup) setCurrency(marketCurrencies[next])
        }}><MarketChoices/></select></label>
        <LocationInput id="wage-cities" market={market} city={city} change={value=>{
          setCity(value)
          if(!market&&/^(vienna|wien)$/i.test(value.trim())){
            setMarket('Austria')
            if(!cost&&!setup) setCurrency('EUR')
          }
        }} data={wageData}/>
        <label>Currency for shared budget inputs<select value={currency} onChange={event=>setCurrency(event.target.value)}>
          {currencies.map(code=><option key={code}>{code}</option>)}
        </select></label>
        {!wagesLoaded&&<p role="status">Loading international wage benchmarks…</p>}
        {!!wageFailures.length&&<p role="status">Benchmarks could not load for {wageFailures.join(', ')}. You can enter wages manually.</p>}
        {hires>0&&<>
          <div className="planner-coverage"><label><input type="checkbox" checked={useBenchmarks} onChange={event=>setUseBenchmarks(event.target.checked)}/><span>Use published wages where available</span></label></div>
          <label>Default extra employer costs (% of wage)<input type="number" min="0" max="300" step="0.1" value={burden}
            onChange={event=>setBurden(event.target.value)} placeholder="Leave blank if unknown"/></label>
          {hiresByRole.some(hire=>hire.wage?.period==='hour')&&<>
            <label>Full-time hours per week<input type="number" required min="1" max="80" step="0.5" value={hours} onChange={event=>setHours(event.target.value)}/></label>
            <label>Paid weeks per year<input type="number" required min="1" max="52" value={weeks} onChange={event=>setWeeks(event.target.value)}/></label>
          </>}
          {hiresByRole.filter(hire=>hire.named).map(hire=><HireWageFields key={hire.id} hire={hire} data={wageData} hours={Number(hours)} weeks={Number(weeks)}
            manual={hire.input.manual?.[hire.currency]??''} change={values=>changeHire(hire.id,values)}/>)}
          {hires>namedHires.length&&<details><summary>Set locations and wages for additional hires</summary>
            {hiresByRole.filter(hire=>!hire.named).map(hire=><HireWageFields key={hire.id} hire={hire} data={wageData} hours={Number(hours)} weeks={Number(weeks)}
              manual={hire.input.manual?.[hire.currency]??''} change={values=>changeHire(hire.id,values)}/>)}
          </details>}
        </>}
        <label>Fallback full-time monthly wage ({currency})<input type="number" min="0" max="10000000" step="0.01" value={cost}
          onChange={event=>setCost(event.target.value)} placeholder="For hires in this currency without a wage estimate"/></label>
        <label>One-time hiring and setup cost per hire ({currency})<input type="number" min="0" max="10000000" step="0.01"
          value={setup} onChange={event=>setSetup(event.target.value)}/></label>
      </>}
      <div className="site-actions">{step>0&&<button type="button" className="site-button secondary" onClick={()=>move(step-1)}>Back</button>}
        <button className="site-button" disabled={loading||(step===2&&!wagesLoaded)}>{step===2?'Show my plan':'Continue'}</button></div>
    </form>:<div className="planner-results">
      <p>{name&&<strong>{name} · </strong>}{objective}</p>
      {description&&<p>{description}</p>}
      <div className="budget-result"><p>Estimated hiring budget over {months} months</p>
        <strong>{total.size?(missing||employerMissing?'Partial budget · ':'')+moneyList(total):hires>0?'Cost estimate needed':amountText(currency,0)}</strong>
        <p>{hires} new {hires===1?'hire':'hires'}{marketLabel&&' · Default market: '+marketLabel}</p>
        {activeMonthly.size>0&&<p>{moneyList(activeMonthly)} per month at target size</p>}
        {missing>0&&<p>{missing} {missing===1?'hire needs':'hires need'} a wage estimate.</p>}
        {employerMissing>0&&<p>Employer costs are unknown for {employerMissing} {employerMissing===1?'hire':'hires'}. Their subtotals include wages only.</p>}
        {total.size>1&&<p>Each currency is shown separately.</p>}
      </div>
      {hiresByRole.length>0&&<details className="site-sources"><summary>Cost by role</summary>
        <ul>{hiresByRole.map(hire=><li key={hire.id}>
          <strong>{hire.role}</strong>{hire.city&&' · '+hire.city}
          {hire.wage&&<WageDetails wage={hire.wage} role={hire.role} proxy={hire.needsProxy} hours={Number(hours)} weeks={Number(weeks)}/>}
          <p>Monthly wage used for planning · {hire.assumption===null?'Estimate needed':amountText(hire.currency,hire.assumption)+' · '+hire.assumptionSource}</p>
          <p>Estimated monthly employer cost · {hire.employer===null?'Unknown':amountText(hire.currency,hire.employer)}</p>
        </li>)}</ul>
      </details>}
      <h3>Suggested starting responsibilities</h3>
      <p>One person can cover several responsibilities. Confirm who has capacity before hiring.</p>
      <ul>
        <li><strong>Accountable lead</strong> — owns the milestone and decisions.</li>
        {roles.map(([role,duty])=><li key={role}><strong>{role}</strong> — {duty} {covered.includes(role)?'Covered today.':'Needs coverage.'}</li>)}
      </ul>
      <h3>Growth phases</h3>
      {hires>0?<ol className="phase-list">{plan.map((phase,index)=><li key={phase.firstMonth}>
        <div><h4>{phases[index]}</h4><p>{phase.firstMonth===phase.lastMonth?`Month ${phase.firstMonth}`:`Months ${phase.firstMonth}–${phase.lastMonth}`} · Add {phase.added} {phase.added===1?'hire':'hires'}</p>
        {pattern&&<p>{pattern.milestones[index]}</p>}
        {phase.roles.length>0&&<p>Roles to consider: {phase.roles.join(', ')}.</p>}
        {phase.added>phase.roles.length&&<p>Use the remaining headcount for capacity where the workload justifies it.</p>}</div>
        {phase.spend.size>0&&<strong>{phase.partial?'Partial · ':''}{moneyList(phase.spend)}</strong>}
      </li>)}</ol>:<p>{pattern?.milestones[0]||'Assign an owner and agree on a first milestone.'} This plan keeps the team at its current size.</p>}
      {missing>0&&<button type="button" className="site-button secondary" onClick={()=>move(2)}>Add cost estimate</button>}
      {hires>0&&<p className="planner-note">New hires start at the beginning of each phase. The estimate covers their monthly cost and the setup costs entered here. Plan separately for your existing team, overhead and contingency.</p>}
      <div className="site-actions"><button type="button" className="site-button secondary" onClick={()=>move(0)}>Edit plan inputs</button><a className="site-button" href="/signup">Open a private workspace</a></div>
    </div>}
  </section>
}
