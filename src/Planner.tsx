import { useRef, useState, type FormEvent } from 'react'

import { patterns, suggestedPattern, type Pattern } from './plannerProfiles'

const currencies = ['USD','EUR','AED','GBP','CHF','CAD','AUD'] as const
const steps = ['Organization','Goal and team','Budget inputs','Your plan']
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
  const monthlyMinor = Math.round(Number(cost)*100)
  const setupMinor = Math.round(Number(setup)*100)
  let activeHires = 0
  let total = 0
  const plan = Array.from({length:phaseCount},(_,index)=>{
    const added = Math.floor(hires/phaseCount)+(index<hires%phaseCount?1:0)
    const firstMonth = Math.floor(index*months/phaseCount)+1
    const lastMonth = Math.floor((index+1)*months/phaseCount)
    const phaseRoles = gaps.slice(activeHires,activeHires+added).map(([role])=>role)
    activeHires += added
    const spend = activeHires*monthlyMinor*(lastMonth-firstMonth+1)+added*setupMinor
    total += spend
    return {added, firstMonth,lastMonth,roles:phaseRoles,spend}
  })
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
        <label>Currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Monthly cost per new hire, including employer costs (optional)<input type="number" min="0" max="10000000" step="0.01" value={cost} onChange={e=>setCost(e.target.value)} placeholder="Enter your own estimate"/></label>
        <label>One-time hiring and setup cost per hire (optional)<input type="number" min="0" max="10000000" step="0.01" value={setup} onChange={e=>setSetup(e.target.value)}/></label>
      </>}
      <div className="site-actions">{step>0&&<button type="button" className="site-button secondary" onClick={()=>move(step-1)}>Back</button>}
        <button className="site-button" disabled={loading}>{step===2?'Show my plan':'Continue'}</button></div>
    </form>:<div className="planner-results">
      <p>{name&&<strong>{name} · </strong>}{objective}</p>
      {description&&<p>{description}</p>}
      <div className="budget-result"><p>Estimated hiring budget over {months} months</p>
        <strong>{hires>0 && cost===''?'Cost estimate needed':money.format(total/100)+' '+currency}</strong>
        <p>{hires} new {hires===1?'hire':'hires'}{cost!==''&&' · '+money.format(hires*monthlyMinor/100)+' additional monthly cost at target size'}</p>
      </div>
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
        {cost!==''&&<strong>{money.format(phase.spend/100)}</strong>}
      </li>)}</ol>:<p>{pattern?.milestones[0]||'Assign an owner and agree on a first milestone.'} This plan keeps the team at its current size.</p>}
      {hires>0&&cost===''&&<button type="button" className="site-button secondary" onClick={()=>move(2)}>Add cost estimate</button>}
      {hires>0&&cost!==''&&<p className="planner-note">New hires start at the beginning of each phase. The estimate covers their monthly cost and the setup costs entered here. Plan separately for your existing team, overhead and contingency.</p>}
      <div className="site-actions"><button type="button" className="site-button secondary" onClick={()=>move(0)}>Edit plan inputs</button><a className="site-button" href="/signup">Open a private workspace</a></div>
    </div>}
  </section>
}
