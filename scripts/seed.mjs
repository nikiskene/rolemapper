import { createClient } from '@supabase/supabase-js'
import { must, sampleFields } from './sample.mjs'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) {
  throw new Error('The fictional seed requires a local Supabase URL and publishable key.')
}
const db = createClient(url, key, {auth:{persistSession:false, autoRefreshToken:false}})
const credentials = {email:'mapmaker@example.com',password:'Fictional-local-demo-2026'}
let signIn = await db.auth.signInWithPassword(credentials)
if (!signIn.data.session) {
  must(await db.auth.signUp(credentials))
  signIn = await db.auth.signInWithPassword(credentials)
}
must(signIn)
const name = 'Moonbeam Instruments (fictional)'
const companies = must(await db.from('companies').select('id').eq('name',name))
if (!companies.length) {
  const workspace = must(await db.rpc('create_company',{company_name:name}))
  const save = async fields => must(await db.rpc('save_card',{workspace,card:null,fields:sampleFields(fields)}))
  const founderCard = await save({bio:'Avery builds imaginary instruments for curious teams.'})
  const founder = must(await db.from('placements').select('person_id').eq('id',founderCard).single())
  await save({zone:'team',title:'Acting product lead',remit:'Owns discovery and delivery.',person_id:founder.person_id,bio:'Avery builds imaginary instruments for curious teams.'})
  await save({zone:'investors',title:'Board member',person_name:'Rowan Finch',remit:'Advises on milestones.'})
  await save({zone:'partner-right',title:'IP partner',person_name:'',organization_name:'Starlight Legal (fictional)',remit:'Supports patent strategy.'})
  await save({zone:'team',title:'Operations lead',person_name:'',status:'Open',remit:'Will own day-to-day operations.'})
}
console.log('Fictional sample ready. Sign in locally as mapmaker@example.com with Fictional-local-demo-2026.')
