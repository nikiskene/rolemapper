import { useRef, useState, type FormEvent } from 'react'

const goals = {
  sales: {label:'Win more customers', roles:['Sales lead','Customer success lead','Account executive','Revenue operations specialist']},
  delivery: {label:'Deliver more work', roles:['Delivery lead','Operations coordinator','Implementation specialist','Quality lead']},
  product: {label:'Build and launch a product', roles:['Product lead','Product engineer','Product designer','Customer success lead']},
} as const
type Goal = keyof typeof goals
const currencies = ['USD','EUR','AED','GBP','CHF','CAD','AUD'] as const
const steps = ['Your goal','Team size','Budget inputs','Your plan']
const phases = ['Establish ownership','Add capacity','Build for scale']

export function Planner() {
  const [step,setStep] = useState(0)
  const [goal,setGoal] = useState<Goal>('sales')
  const [objective,setObjective] = useState('')
  const [current,setCurrent] = useState(1)
  const [target,setTarget] = useState(5)
  const [months,setMonths] = useState(12)
  const [currency,setCurrency] = useState('USD')
  const [cost,setCost] = useState('')
  const [setup,setSetup] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const hires = target-current
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
    const roles = Array.from({length:Math.min(added,4)},(_,roleIndex)=>{
      const suggestions = goals[goal].roles
      return suggestions[(activeHires + roleIndex)%suggestions.length]
    })
    activeHires += added
    const spend = activeHires*monthlyMinor*(lastMonth-firstMonth+1)+added*setupMinor
    total += spend
    return {added, firstMonth,lastMonth,roles:[...new Set(roles)],spend}
  })
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
        <label>What needs to change?<select value={goal} onChange={e=>setGoal(e.target.value as Goal)}>
          {Object.entries(goals).map(([value,option])=><option key={value} value={value}>{option.label}</option>)}
        </select></label>
        <label>What would success look like? (optional)<textarea value={objective} onChange={e=>setObjective(e.target.value)} maxLength={300} placeholder="For example, grow from 10 to 30 enterprise customers."/></label>
      </>}
      {step===1&&<>
        <label>How many people are on the team today?<input type="number" min="1" max="500" step="1" required value={Number.isNaN(current)?'':current} onChange={e=>setCurrent(e.target.valueAsNumber)}/></label>
        <label>How many people should be on the team at the end of the plan?<input type="number" min={current||1} max="500" step="1" required value={Number.isNaN(target)?'':target} onChange={e=>setTarget(e.target.valueAsNumber)}/></label>
        <label>How many months do you have?<input type="number" min="1" max="60" step="1" required value={Number.isNaN(months)?'':months} onChange={e=>setMonths(e.target.valueAsNumber)}/></label>
      </>}
      {step===2&&<>
        <label>Currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Monthly cost per new hire, including employer costs<input type="number" min="0" max="10000000" step="0.01" required={hires>0} value={cost} onChange={e=>setCost(e.target.value)} placeholder="Enter your own estimate"/></label>
        <label>One-time hiring and setup cost per hire (optional)<input type="number" min="0" max="10000000" step="0.01" value={setup} onChange={e=>setSetup(e.target.value)}/></label>
      </>}
      <div className="site-actions">{step>0&&<button type="button" className="site-button secondary" onClick={()=>move(step-1)}>Back</button>}
        <button className="site-button">{step===2?'Show my plan':'Continue'}</button></div>
    </form>:<div className="planner-results">
      <p>{objective||goals[goal].label}</p>
      <div className="budget-result"><p>Estimated growth budget over {months} months</p><strong>{money.format(total/100)} {currency}</strong>
        <p>{hires} new {hires===1?'hire':'hires'} · {money.format(hires*monthlyMinor/100)} additional monthly cost at target size</p></div>
      <h3>Suggested starting team</h3>
      <p>Assign these responsibilities to the people you have today. One person can cover several until there’s enough work to hire.</p>
      <ul><li>Founding lead for decisions and priorities</li><li>{goals[goal].roles[0]} for the growth goal</li><li>{goals[goal].roles[1]} for delivery and follow-through</li></ul>
      {hires>0 ? <><h3>Growth phases</h3><ol className="phase-list">{plan.map((phase,index)=><li key={phase.firstMonth}>
        <div><h4>{phases[index]}</h4><p>{phase.firstMonth===phase.lastMonth?`Month ${phase.firstMonth}`:`Months ${phase.firstMonth}–${phase.lastMonth}`} · Add {phase.added} {phase.added===1?'hire':'hires'}</p>
        <p>Roles to consider: {phase.roles.join(', ')}{phase.added>4?' and additional capacity as needed':''}.</p></div>
        <strong>{money.format(phase.spend/100)}</strong>
      </li>)}</ol></>:<p>This plan keeps the team at its current size. Start by assigning the responsibilities above.</p>}
      <p className="planner-note">The budget assumes new hires start at the beginning of each phase. It includes their pay and the setup costs you entered, and excludes the current team, overhead and any additional taxes or contingency.</p>
      <div className="site-actions"><button type="button" className="site-button secondary" onClick={()=>move(0)}>Edit plan inputs</button><a className="site-button" href="/signup">Open a private workspace</a></div>
    </div>}
  </section>
}
