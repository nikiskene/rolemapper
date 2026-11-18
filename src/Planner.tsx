import { useRef, useState, type FormEvent } from 'react'

import { annualWage, hiringBudget, matchWageCity, wageCities, wageSource } from './talentBenchmarks'
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
  const [overrides,setOverrides] = useState<Record<string,string>>({})
  const [useBenchmarks,setUseBenchmarks] = useState(false)
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
  const money = new Intl.NumberFormat('en',{style:'currency',currency,minimumFractionDigits:0,maximumFractionDigits:2})
  const setupMinor = Math.round(Number(setup)*100)
  const marketLabel = [city.trim(),market==='us'?'United States':market==='remote'?'Remote':market==='other'?null:market].filter(Boolean).join(', ')
  const wageCity = market==='us' && currency==='USD' && goal!=='other' ? matchWageCity(city) : undefined
  const hiresByRole = gaps.slice(0,Math.max(0,hires)).map(([role])=>{
    const wage=wageCity?annualWage(role,wageCity):undefined
    const own=overrides[role]
    const monthly=own!==undefined&&own!==''?Math.round(Number(own)*100):
      wage&&useBenchmarks?Math.round(wage.mean/12*(1+Number(burden)/100)*100):
      cost!==''?Math.round(Number(cost)*100):null
    return {role,wage,monthly,estimated:!!wage&&useBenchmarks&&!own}
  })
  const hiresBenchmarked = hiresByRole.some(role=>role.estimated)
  const fallback = cost===''?null:Math.round(Number(cost)*100)
  let assigned = 0
  const {plan,total,activeMonthly,missing} = hiringBudget(Array.from({length:phaseCount},(_,index)=>{
    const added = Math.floor(hires/phaseCount)+(index<hires%phaseCount?1:0)
    const firstMonth = Math.floor(index*months/phaseCount)+1
    const lastMonth = Math.floor((index+1)*months/phaseCount)
    const phaseRoles = hiresByRole.slice(assigned,assigned+added)
    assigned += added
    const generic = added-phaseRoles.length
    return {added,firstMonth,lastMonth,roles:phaseRoles.map(row=>row.role),
      known:phaseRoles.filter(row=>row.monthly!==null).length+(fallback===null?0:generic),
      monthly:phaseRoles.reduce((sum,row)=>sum+(row.monthly??0),0)+(fallback??0)*generic}
  }),setupMinor)
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
        <label>Where will you hire?<select value={market} onChange={e=>{
          const next=e.target.value
          setMarket(next)
          setUseBenchmarks(false)
          const local:Record<string,string>={us:'USD',Austria:'EUR',Germany:'EUR','United Arab Emirates':'AED','United Kingdom':'GBP',Switzerland:'CHF',Canada:'CAD',Australia:'AUD',India:'INR',Singapore:'SGD'}
          if(local[next]&&!cost&&!setup&&!Object.values(overrides).some(Boolean))setCurrency(local[next])
        }}>
          <option value="">Choose a hiring market (optional)</option>
          <option value="us">United States</option>
          {['Austria','Germany','United Arab Emirates','United Kingdom','Switzerland','Canada','Australia','India','Singapore'].map(value=><option key={value}>{value}</option>)}
          <option value="remote">Remote across markets</option><option value="other">Other market</option>
        </select></label>
        <label>{market==='other'?'City and country (optional)':'City or region (optional)'}<input value={city} list={market==='us'?'wage-cities':undefined} onChange={e=>setCity(e.target.value)} maxLength={100} /></label>
        {market==='us'&&<datalist id="wage-cities">{wageCities.map(value=><option key={value} value={value}/>)}</datalist>}
        <label>Budget currency<select value={currency} onChange={e=>{setCurrency(e.target.value);setUseBenchmarks(false)}}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
        <p className="planner-note">Enter every estimate in {currency}. The configurator doesn’t convert currencies.</p>
        {hires>0&&<>
          {wageCity&&hiresByRole.some(role=>role.wage)?<section className="site-sources" aria-label="Salary benchmarks">
            <strong>{wageCity} metro wage benchmarks</strong>
            <p><a href={wageSource} target="_blank" rel="noreferrer">U.S. Bureau of Labor Statistics · May 2025</a> · Annual employee wages for comparable occupations in the metropolitan area. Ranges show the middle 50% of wages where available. Add employer taxes and benefits separately.</p>
            <div className="planner-coverage"><label><input type="checkbox" checked={useBenchmarks} onChange={e=>setUseBenchmarks(e.target.checked)}/><span>Use benchmarks for roles without my own estimate</span></label></div>
            {useBenchmarks&&<label>Extra employer costs (% of benchmark wage)<input type="number" min="0" max="300" step="0.1" value={burden} onChange={e=>setBurden(e.target.value)} placeholder="0 (wages only)"/></label>}
          </section>:market&&<p className="planner-note">{market==='us'&&!city.trim()?'Enter a city to look up local wages.':'Local wage benchmarks are unavailable for these roles, location or currency. Enter your estimates below.'}</p>}
          {hiresByRole.map(({role,wage,monthly,estimated})=><div className="site-sources" key={role}>
            <strong>{role}</strong>
            {wage&&<p>{money.format(wage.mean)} average annual wage · {wage.title}
              {wage.low!=null&&wage.high!=null&&<> · {money.format(wage.low)}–{money.format(wage.high)} middle 50%</>}
              {estimated&&monthly!==null?' · '+money.format(monthly/100)+'/month in plan':''}</p>}
            <label>Monthly cost override for {role}<input type="number" min="0" max="10000000" step="0.01" value={overrides[role]??''} onChange={e=>setOverrides(values=>({...values,[role]:e.target.value}))} placeholder="Optional · include employer costs"/></label>
          </div>)}
        </>}
        <label>Fallback monthly cost per hire (optional)<input type="number" min="0" max="10000000" step="0.01" value={cost} onChange={e=>setCost(e.target.value)} placeholder="For hires without a role estimate"/></label>
        <label>One-time hiring and setup cost per hire (optional)<input type="number" min="0" max="10000000" step="0.01" value={setup} onChange={e=>setSetup(e.target.value)}/></label>
      </>}
      <div className="site-actions">{step>0&&<button type="button" className="site-button secondary" onClick={()=>move(step-1)}>Back</button>}
        <button className="site-button" disabled={loading}>{step===2?'Show my plan':'Continue'}</button></div>
    </form>:<div className="planner-results">
      <p>{name&&<strong>{name} · </strong>}{objective}</p>
      {description&&<p>{description}</p>}
      <div className="budget-result"><p>Estimated hiring budget over {months} months</p>
        <strong>{missing>0&&total===0?'Cost estimate needed':(missing?'Partial budget: ':'')+money.format(total/100)+' '+currency}</strong>
        <p>{hires} new {hires===1?'hire':'hires'}{marketLabel&&' · '+marketLabel}{(activeMonthly>0||!missing)&&hires>0&&' · '+money.format(activeMonthly/100)+(missing?' known':' additional')+' monthly cost at target size'}</p>
        {missing>0&&<p>{missing} {missing===1?'hire needs':'hires need'} a cost estimate.</p>}
        {hiresBenchmarked&&<p>Includes wage estimates for the {wageCity} metro area{Number(burden)>0?' plus '+burden+'% for employer costs':' (employer taxes and benefits excluded for benchmarked roles)'}.</p>}
      </div>
      {hiresByRole.length>0&&<details className="site-sources"><summary>Cost by role</summary><ul>{hiresByRole.map(({role,monthly,estimated})=><li key={role}>{role} · {monthly===null?'Estimate needed':money.format(monthly/100)+'/month'}{estimated?' (metro wage benchmark)':''}</li>)}</ul></details>}
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
        {(!phase.partial||phase.spend>0)&&<strong>{phase.partial?'Partial: ':''}{money.format(phase.spend/100)}</strong>}
      </li>)}</ol>:<p>{pattern?.milestones[0]||'Assign an owner and agree on a first milestone.'} This plan keeps the team at its current size.</p>}
      {missing>0&&<button type="button" className="site-button secondary" onClick={()=>move(2)}>Add cost estimate</button>}
      {hires>0&&<p className="planner-note">New hires start at the beginning of each phase. The estimate covers their monthly cost and the setup costs entered here. Plan separately for your existing team, overhead and contingency.</p>}
      <div className="site-actions"><button type="button" className="site-button secondary" onClick={()=>move(0)}>Edit plan inputs</button><a className="site-button" href="/signup">Open a private workspace</a></div>
    </div>}
  </section>
}
