export const zones = [
  ['advisor-left','Advisors','Mentors & consultants'],
  ['investors','Investors & board','Capital & governance'],
  ['advisor-right','Advisors','Mentors & consultants'],
  ['cofounder-left','Co-founders','Shared leadership'],
  ['founder','Founding lead','At the center'],
  ['cofounder-right','Co-founders','Shared leadership'],
  ['partner-left','Partners','Suppliers, vendors & specialists'],
  ['team','Team','Executives, managers & team members'],
  ['partner-right','Partners','Legal, IP & service providers'],
] as const
export type Zone = typeof zones[number][0]
export type Status = 'Filled' | 'Open' | 'Later'
export type Company = {id:string;name:string}
export type Person = {id:string;name:string;bio:string;linkedin:string;email:string;affiliation:string}
export type Organization = {id:string;name:string}
export type Card = {id:string;zone:Zone;rank:number;title:string;remit:string;status:Status;person_id:string|null;organization_id:string|null}
export type MapData = {people:Person[];organizations:Organization[];cards:Card[]}
export const zoneLabel = (zone:Zone) => {
  const title = zones.find(([id]) => id === zone)?.[1]
  return zone.endsWith('-left') ? title + ' · left' : zone.endsWith('-right') ? title + ' · right' : title
}
export const errorText = (error:unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Something went wrong. Please try again.'
export function linkedinUrl(value:string) {
  if (!/^https:\/\/([a-z0-9-]+\.)?linkedin\.com\/\S+$/i.test(value)) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /^(?:[a-z0-9-]+\.)?linkedin\.com$/i.test(url.hostname) ? url.href : ''
  } catch { return '' }
}
