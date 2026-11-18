import { Resolver } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import { load } from 'cheerio'
import robotsParser from 'robots-parser'

export const config = {
  path: '/api/site-context',
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}

const agentName = 'RolemapperReader'
const maxBytes = 750_000
const redirectCodes = new Set([301, 302, 303, 307, 308])
const topic = /about|company|institute|services?|solutions?|products?|platform|programs?|award|partner|chapter|community|research|how-it-works|angebot|leistungen|über uns|ueber-uns/i
const ignored = /login|signup|sign-in|wishlist|checkout|cart|privacy|legal|imprint|impressum|datenschutz|cookie|terms|contact|wp-admin/i
const clean = (value, limit) => value.replace(/\s+/g, ' ').trim().slice(0, limit)

function publicUrl(input, base) {
  const normalized = base || /^https?:\/\//i.test(input) ? input : 'https://' + input
  const url = new URL(normalized, base)
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search ||
      isIP(url.hostname) || !url.hostname.includes('.') || !/^[a-z\d.-]+$/i.test(url.hostname) ||
      /\.(localhost|local|internal|home|test|invalid|onion)\.?$/i.test(url.hostname)) {
    throw new Error('Enter a public HTTPS page URL without query parameters.')
  }
  url.hash = ''
  return url
}

async function fetchPage(url, signal, redirects = 0, stayOnOrigin = false, beforeRedirect) {
  signal.throwIfAborted()
  const resolver = new Resolver({ timeout: 1300, tries: 1 })
  const addresses = await resolver.resolve4(url.hostname)
  if (addresses.length === 0 || addresses.some(address => ipaddr.parse(address).range() !== 'unicast')) {
    throw new Error('The site could not be reached on a public address.')
  }
  const result = await new Promise((resolve, reject) => {
    const outbound = httpsRequest(url, {
      agent: false, family: 4, signal,
      lookup: (_hostname, _options, callback) => callback(null, addresses[0], 4),
      headers: { 'User-Agent': agentName + '/1.0 (+https://rolemapper.netlify.app)', Accept: 'text/html,text/plain;q=0.9' },
    }, response => {
      const {statusCode:status, headers} = response
      if (redirectCodes.has(status) || status !== 200) {
        response.destroy()
        resolve({status, headers, body: ''})
        return
      }
      if (!/^text\/(html|plain)(?:\s*;|$)/i.test(headers['content-type'] || '')) {
        response.destroy()
        reject(new Error('The address must point to a public web page.'))
        return
      }
      const chunks = []
      let bytes = 0
      response.on('data', chunk => {
        bytes += chunk.length
        if (bytes > maxBytes) {
          response.destroy(new Error('This page is too large to read.'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({status, headers, body:Buffer.concat(chunks).toString('utf8')}))
      response.on('error', reject)
    })
    outbound.on('error', reject)
    outbound.end()
  })
  if (redirectCodes.has(result.status)) {
    if (redirects >= 3 || !result.headers.location) throw new Error('The site redirects too many times.')
    const next = publicUrl(result.headers.location, url)
    if (stayOnOrigin && next.origin !== url.origin) throw new Error('The page redirects outside the site.')
    await beforeRedirect?.(next)
    return fetchPage(next, signal, redirects + 1, stayOnOrigin, beforeRedirect)
  }
  return {...result, url}
}

async function crawlRules(url, signal) {
  const rules = new URL('/robots.txt', url)
  const response = await fetchPage(rules, signal, 0, true)
  if (response.status >= 400 && response.status < 500 && ![401,403,429].includes(response.status)) return null
  if (response.status !== 200) throw new Error('The site’s crawler policy could not be checked.')
  return robotsParser(rules.href, response.body)
}

function parsePage(page) {
  const $ = load(page.body)
  const meta = name => $(`meta[name="${name}"],meta[property="${name}"]`).first().attr('content') || ''
  const title = clean(meta('og:title') || $('title').first().text(), 150)
  const name = clean(meta('og:site_name'), 100)
  const description = clean(meta('description') || meta('og:description'), 360)
  const keywords = clean(meta('keywords'), 180)
  const structured = $('script[type="application/ld+json"]').slice(0,12).toArray().flatMap(element=>{
    try {
      const data = JSON.parse($(element).text())
      return Array.isArray(data) ? data : Array.isArray(data?.['@graph']) ? data['@graph'] : [data]
    } catch { return [] }
  }).filter(entry=>entry && /Organization|LocalBusiness|Product|Service|SoftwareApplication/i.test(String(entry['@type'])))
  const structuredName = structured.find(entry=>typeof entry.name==='string')?.name
  const structuredDescription = structured.find(entry=>typeof entry.description==='string')?.description
  const structuredText = structured.slice(0,12).flatMap(entry=>[entry.name,entry.description,entry.serviceType,entry.category,entry.audience?.audienceType,entry.areaServed?.name])
    .filter(value=>typeof value==='string').map(value=>clean(value,200))
  const links = new Map()
  $('a[href]').slice(0,400).each((_index, anchor) => {
    const href = $(anchor).attr('href')
    const label = clean($(anchor).text(),100)
    if (!href || href.startsWith('#') || ignored.test(label+' '+href) || !topic.test(label+' '+href)) return
    try {
      const link = publicUrl(href, page.url)
      if (link.origin !== page.url.origin || link.pathname === page.url.pathname || link.pathname === '/') return
      const rank = /about|company|how-it-works|institute/i.test(label+' '+href) ? 2 : 1
      links.set(link.href, Math.max(rank,links.get(link.href) || 0))
    } catch { /* Only public HTTPS pages are eligible. */ }
  })
  $('script,style,template,noscript,svg,iframe,nav,footer,[hidden],[aria-hidden="true"]').remove()
  const content = $('main').length ? $('main').first() : $('body')
  const headings = [...new Set(content.find('h1,h2,h3').slice(0,35).map((_index,el)=>clean($(el).text(),140)).get().filter(Boolean))]
  const paragraphs = content.find('p').slice(0,45).map((_index,el)=>clean($(el).text(),260)).get()
    .filter(value => value.length >= 40 && !/cookie policy|all rights reserved|enable javascript/i.test(value))
  return {
    title,name:name||clean(title.split(/\s+[—–|·-]\s+/)[0]||structuredName||'',100),description:description||clean(structuredDescription||'',360),
    keywords,headings,paragraphs,structuredText,links,url:page.url.href,
  }
}

async function readWebsite(rawUrl, signal) {
  const requested = publicUrl(rawUrl)
  const rulesByOrigin = new Map()
  async function checkPolicy(url) {
    if (!rulesByOrigin.has(url.origin)) rulesByOrigin.set(url.origin,crawlRules(url,signal))
    const rules = await rulesByOrigin.get(url.origin)
    if (rules?.isDisallowed(url.href,agentName)) throw new Error('This website asks automated readers to skip this page.')
  }
  await checkPolicy(requested)
  const first = await fetchPage(requested, signal, 0, false, checkPolicy)
  if (first.status !== 200 || !/^text\/html/i.test(first.headers['content-type'])) throw new Error('The public page could not be read.')
  const entry = parsePage(first)
  const candidates = [...entry.links].sort((a,b)=>b[1]-a[1]).slice(0,5)
  const extraPages = await Promise.allSettled(candidates.map(async ([href]) => {
    const url = publicUrl(href)
    await checkPolicy(url)
    const page = await fetchPage(url, signal, 0, true, checkPolicy)
    if (page.status !== 200 || !/^text\/html/i.test(page.headers['content-type'])) return null
    return parsePage(page)
  }))
  const pages = [entry,...extraPages.flatMap(result=>result.status==='fulfilled' && result.value ? [result.value] : [])]
  const snippets = [...new Set(pages.flatMap(page=>[page.title,page.description,page.keywords,...page.structuredText,...page.headings,...page.paragraphs]).filter(Boolean))]
  const topics = [
    ['Offer', /\b(service|product|program|award|platform|repair|software|system|angebot|betriebssystem)\w*/i],
    ['Audience', /\b(customer|client|company|companies|enterprise|business|household|homeowner|community|nominee|km[uU]|unternehmen)\w*/i],
    ['How it operates', /\b(partner|provider|vet|dispatch|deliver|nominate|judg|deploy|pilot|integrat|on-prem|sponsor)\w*/i],
  ]
  const used = new Set([entry.description])
  const insights = topics.flatMap(([label,matcher])=>{
    for (const page of pages) {
      const quote = [...page.paragraphs,...page.structuredText,...page.headings,page.keywords]
        .find(value=>value.length>=36 && !used.has(value) && matcher.test(value))
      if (quote) {
        used.add(quote)
        return [{label,quote,url:page.url}]
      }
    }
    return []
  })
  return {
    insights,
    name:entry.name || clean(entry.title.split(/\s+[—–|·-]\s+/)[0],100),
    description:entry.description || entry.paragraphs[0] || '',
    text:snippets.join('\n').slice(0,10_000),
    sources:pages.map(({url,title,headings,paragraphs,description})=>({
      url,title:title||new URL(url).pathname,headings:headings.slice(0,6),excerpt:description||paragraphs[0]||'',
    })),
  }
}

export default async function handler(request) {
  const json = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}})
  if (request.method!=='POST') return json({error:'Use POST.'},405)
  if (request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) return json({error:'Use the Rolemapper planner.'},403)
  const reader = request.body?.getReader()
  if (!reader) return json({error:'Enter a public website URL.'},400)
  let payload = ''
  const decoder = new TextDecoder()
  let bytes = 0
  for (;;) {
    const {done,value} = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 2048) { await reader.cancel(); return json({error:'The URL is too long.'},413) }
    payload += decoder.decode(value,{stream:true})
  }
  let input
  try { input = JSON.parse(payload+decoder.decode())?.url } catch { return json({error:'Enter a public website URL.'},400) }
  if (typeof input!=='string' || !input.trim() || input.length>500) return json({error:'Enter a public website URL.'},400)
  try { publicUrl(input.trim()) } catch { return json({error:'Enter a public HTTPS page URL without query parameters.'},400) }
  try {
    return json(await readWebsite(input.trim(), AbortSignal.timeout(6900)))
  } catch {
    return json({error:'We couldn’t read this site. Try its final public URL or add a short description below.'},422)
  }
}
