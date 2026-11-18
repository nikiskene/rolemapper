import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { must, sampleFields } from '../scripts/sample.mjs'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
function client() {
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}

test('Supabase Auth and REST isolate real signed-in owners and anonymous callers', async () => {
  assert.ok(url && key && ['127.0.0.1','localhost'].includes(new URL(url).hostname), 'Use a local Supabase instance with email confirmations disabled.')
  async function owner() {
    const db=client()
    const credentials={email:`test-${randomUUID()}@example.com`, password:randomUUID()}
    must(await db.auth.signUp(credentials))
    const {session}=must(await db.auth.signInWithPassword(credentials))
    assert.ok(session)
    return db
  }
  async function workspace(db,name) {
    const company=must(await db.rpc('create_company',{company_name:name}))
    const card=must(await db.rpc('save_card',{workspace:company,card:null,fields:sampleFields({person_name:name,organization_name:name+' Labs',email:'private@example.com'})}))
    const placement=must(await db.from('placements').select('*').eq('id',card).single())
    return {company,card,placement}
  }
  const [a,b]=await Promise.all([owner(),owner()])
  const [wa,wb]=await Promise.all([workspace(a,'Alice'),workspace(b,'Bob')])
  const tables=['companies','maps','people','organizations','placements']
  for (const [db,own,other] of [[a,wa,wb],[b,wb,wa]]) {
    for (const table of tables) {
      const companyColumn=table==='companies'?'id':'company_id'
      assert.equal(must(await db.from(table).select('*').eq(companyColumn,own.company)).length,1)
      assert.deepEqual(must(await db.from(table).select('*').eq(companyColumn,other.company)),[])
    }
    for (const [table,otherId,column] of [
      ['placements',other.card,'title'],['people',other.placement.person_id,'name'],['organizations',other.placement.organization_id,'name']
    ]) {
      assert.deepEqual(must(await db.from(table).update({[column]:'Forbidden edit'}).eq('id',otherId).select('id')),[])
      assert.deepEqual(must(await db.from(table).delete().eq('id',otherId).select('id')),[])
    }
    assert.equal((await db.from('people').insert({company_id:other.company,name:'Forbidden person'})).error?.code,'42501')
    assert.equal((await db.rpc('move_card',{workspace:other.company,card:other.card,target:'team'})).error?.code,'42501')
    assert.equal((await db.rpc('save_card',{workspace:other.company,card:other.card,fields:sampleFields()})).error?.code,'42501')
    assert.equal((await db.from('placements').insert({company_id:own.company,zone:'team',rank:0,title:'Invalid link',status:'Filled',person_id:other.placement.person_id})).error?.code,'23503')
    assert.equal((await db.from('placements').insert({company_id:own.company,zone:'team',rank:0,title:'Invalid link',status:'Filled',organization_id:other.placement.organization_id})).error?.code,'23503')
  }
  const visitor=client()
  for (const table of tables) assert.equal((await visitor.from(table).select('*')).error?.code,'42501')
  assert.ok((await visitor.rpc('create_company',{company_name:'Anonymous'})).error)
  must(await a.rpc('move_card',{workspace:wa.company,card:wa.card,target:'team'}))
  const after=must(await a.from('placements').select('zone').eq('id',wa.card).single())
  assert.equal(after.zone,'team')
})

test('planning data is private and role changes and handoffs leave live placements intact', async () => {
  assert.ok(url && key && ['127.0.0.1','localhost'].includes(new URL(url).hostname))
  async function owner() {
    const db=client()
    const {session}=must(await db.auth.signUp({email:`planning-${randomUUID()}@example.com`,password:randomUUID()}))
    assert.ok(session)
    return db
  }
  const [a,b]=await Promise.all([owner(),owner()])
  const workspace=must(await a.rpc('create_company',{company_name:'Private plan test'}))
  const other=must(await b.rpc('create_company',{company_name:'Separate plan test'}))
  const card=must(await a.rpc('save_card',{workspace,card:null,fields:sampleFields({title:'Live lead'})}))
  const teammate=must(await a.rpc('save_card',{workspace,card:null,fields:sampleFields({title:'Teammate',person_name:'Second person'})}))
  const live=must(await a.from('placements').select('*').eq('company_id',workspace).order('id'))
  const keyFor=id=>'person:'+live.find(row=>row.id===id).person_id
  const add=async title=>must(await a.from('responsibilities').insert({company_id:workspace,title,hours:5,owner_key:keyFor(card),owner_label:'Founder'}).select().single())
  const first=await add('Qualify leads'), second=await add('Approve pricing')
  must(await a.rpc('move_responsibility',{workspace,item:second.id,anchor:first.id,after_anchor:false}))
  assert.deepEqual(must(await a.from('responsibilities').select('id').eq('company_id',workspace).order('position')).map(row=>row.id),[second.id,first.id])
  const ownerKey=keyFor(teammate)
  assert.equal((await a.from('responsibilities').update({status:'Handed off'}).eq('id',first.id)).error?.code,'23514')
  const completed=must(await a.from('responsibilities').update({status:'Handed off',completed_on:'2026-11-18',
    owner_key:ownerKey,owner_label:'Second person',next_key:ownerKey,next_label:'Second person'}).eq('id',first.id).select().single())
  assert.equal(completed.owner_key,ownerKey)
  const baseline=must(await a.rpc('snapshot_scenario',{workspace,plan_name:'Baseline',baseline:true}))
  must(await a.from('scenario_roles').update({cost_low:12000,currency:'EUR'}).eq('scenario_id',baseline).eq('source_placement',card))
  const plan=must(await a.rpc('snapshot_scenario',{workspace,plan_name:'Private growth plan',baseline:false}))
  const role=must(await a.from('scenario_roles').select('*').eq('scenario_id',plan).eq('source_placement',card).single())
  assert.equal(role.cost_low,12000)
  must(await a.from('scenario_roles').update({title:'Future lead',cost_low:900,cost_high:1200,period:'Monthly',currency:'USD'}).eq('id',role.id))
  assert.deepEqual(must(await a.from('placements').select('*').eq('company_id',workspace).order('id')),live)
  assert.equal(must(await a.from('scenario_roles').select('title').eq('scenario_id',baseline).eq('source_placement',card).single()).title,'Live lead')
  for (const [table,id,column] of [['responsibilities',first.id,'title'],['scenarios',plan,'name'],['scenario_roles',role.id,'title']]) {
    assert.deepEqual(must(await b.from(table).select('*').eq('company_id',workspace)),[])
    assert.deepEqual(must(await b.from(table).update({[column]:'Forbidden'}).eq('id',id).select('id')),[])
    assert.equal((await client().from(table).select('*')).error?.code,'42501')
  }
  assert.equal((await b.from('scenario_roles').insert({company_id:other,scenario_id:plan,title:'Cross-company role'})).error?.code,'23503')
  assert.equal((await b.rpc('snapshot_scenario',{workspace,plan_name:'Forbidden',baseline:false})).error?.code,'42501')
  const share=must(await a.rpc('publish_map_snapshot',{workspace,visible_cards:[card,teammate],include_headshots:false}))
  const publicMap=JSON.stringify(must(await client().rpc('read_map_snapshot',{share_token:share})))
  for(const privateText of ['Qualify leads','Private growth plan','Future lead','private@example.com']) assert.ok(!publicMap.includes(privateText))
})
