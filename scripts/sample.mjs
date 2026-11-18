export function sampleFields(fields = {}) {
  return { zone:'founder', title:'Founder', status:'Filled', remit:'Sets the direction for the company.',
    person_id:'', person_name:'Avery Moon', organization_id:'', organization_name:'', email:'',
    linkedin:'', bio:'', affiliation:'', ...fields }
}

export function must(result) {
  if (result.error) throw result.error
  return result.data
}
