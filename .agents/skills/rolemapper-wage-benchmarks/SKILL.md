---
name: rolemapper-wage-benchmarks
description: Use when adding or refreshing Rolemapper wage sources, matching roles and cities, evaluating geographic fallbacks, or estimating a distributed team's hiring budget.
---

# Benchmark a Rolemapper hire

Start with the role's responsibilities, work location, employment type and allocation. Reuse the app's existing occupation mappings, wage importers and budget calculations when present. For a distributed team, price each hire in their own labor market.

1. Match the work to the publisher's occupation and record the match as exact, broader, or user-selected proxy. For “product manager,” distinguish roadmap ownership from project delivery and marketing. If the duties leave the match ambiguous, offer the plausible choices before quoting a figure.
2. Prefer a published median for the same occupation, worker population and pay basis. Search the city or metro, then the enclosing region, then the country. Display the geography that produced the number. Evaluate occupation specificity, reference year, suppression and sample quality before using a narrower geography. If no meaningful match exists, accept an editable planning assumption.
3. Keep separate fields for requested city, source geography and level, occupation code/system/version or original title, reference period, release vintage, population, currency, unit, basic/gross basis, statistic, bounds, quality flags, URL, licence and attribution. Retain the source's methodology, including any fallback or model already used by the publisher. Represent suppressed values as missing and censored values with their inequality. Keep a founder's override separate from the published record.
4. Check the terms of the exact distribution for commercial display. Treat external display, data exports and automated bulk acquisition as distinct permissions. Preserve attribution in public outputs. Mark uncertain permissions unverified and keep affected data out of public defaults until resolved.
5. Label the result as published wage, recruiter range, modeled estimate or user estimate. Show the native figure before conversions. Keep mean, median, percentiles and non-statistical ranges distinct. Use a published annual figure when available. Otherwise disclose hours per week, paid weeks or pay periods, allocation and any FX rate/date. Apply each conversion and allocation once. Add employer contributions, benefits, bonuses or one-time costs only with explicit assumptions and only where excluded from the chosen pay basis. Show estimated employer cost separately. Keep mixed-currency subtotals when FX is unavailable.

## Select a source

Use these as import starting points from the November 2026 review. Recheck current releases, schemas, definitions and licence terms when updating. Rank Canada, Singapore, then London for initial imports.

| Market | Import and interpretation |
| --- | --- |
| US metros | Use the app's existing BLS OEWS data. Join on metro ID, SOC, period and statistic. Preserve hourly versus annual and median versus mean. [BLS files](https://www.bls.gov/oes/tables.htm) |
| Toronto, Vancouver and other Canadian markets | Import NOC 2021 and original wage comments. Toronto economic region and Lower Mainland–Southwest are regional figures. Low/high usually correspond to P10/P90; check row exceptions. Distinguish release year from reference period. Open Government Licence – Canada. [2025 CSV](https://open.canada.ca/data/dataset/adad580f-76b0-4502-bd05-20c125de9116/resource/9da94d63-b178-4a64-aeb3-b6a3bd721ad2/download/2a71-das-wage2025opendata-esdc-all-19nov2025-vf.csv) · [Licence](https://open.canada.ca/en/open-government-licence-canada/) |
| Singapore | Import both basic and gross SGD/month at P25/P50/P75. The June 2024 open CSV has occupation labels without codes and covers full-time residents of private establishments with at least 25 employees. Use national/city-state geography. Employer CPF and bonuses are excluded. Singapore Open Data Licence applies to this distribution. [Dataset and API](https://data.gov.sg/datasets/d_9917e751f7498502f70052a940a3f312/view) · [Licence](https://developers.data.gov.sg/open-data-licence) |
| London | Use ONS ASHE Table 15, four-digit SOC 2020, London workplace region. Choose gross pay for full-time employees of all sexes. Read each sheet's unit, percentile headers, revision and suppression flags. Prefer revised figures when available. Credit ONS under the UK Open Government Licence. [Editions and files](https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/regionbyoccupation4digitsoc2010ashetable15) |
| Berlin and Munich | Use BA Entgeltatlas KldB aggregates, covered full-time employees and EUR gross/month. Select Munich city, distinct from the surrounding district. Retain top-coded bounds and source credit. Numerical republication has attribution terms; commercial bulk extraction via the Atlas interface was unverified. [Occupation table](https://web.arbeitsagentur.de/entgeltatlas/tabelle?alter=1&branche=1&dkz=15260&geschlecht=1) · [Method](https://www.arbeitsagentur.de/hilfe-entgeltatlas) |
| Vienna | Use the Austrian 2022 Structure of Earnings Survey as a national ÖISCO-08 group benchmark when duties match. Credit Statistics Austria and identify adaptations. The reviewed Vienna income tables do not establish city-by-detailed-occupation wages. [National tables](https://www.statistik.at/statistiken/bevoelkerung-und-soziales/einkommen-und-soziale-lage/verdienststruktur) · [Vienna tables](https://www.wien.gv.at/statistik/einkommen) |
| Dubai | TLNT Q4 2026 publishes recruiter-estimated monthly AED ranges by role and level. Preserve bonus and allowance qualifiers. Attribute and link the index. Online reuse is stated; explicit paid-app bulk redistribution was unverified. [CSV](https://tlnt.ae/data/dubai-salary-index-2026-en.csv) · [Terms and methodology](https://tlnt.ae/en/press/) |
| Hong Kong | Use C&SD table 220-23024 for broad occupational groups in the SAR. Retain survey population and HKD/hour percentiles. Credit C&SD under its statistical-information terms. [Table](https://www.censtatd.gov.hk/en/web_table.html?id=220-23024) |

## Evaluate a geographic estimate

Keep cost of living as a purchasing-power measure. Use an observed regional or national wage as the default fallback. Evaluate any experimental local wage model against published local medians in the same period, units and geography before recommending it. Exclude suppressed records, identify missing pairs, and hold target occupation/local wages out of model fitting. Compare national-only, national × city/national price level, and national × metro/national all-occupation wage level. Report median and mean absolute percentage errors, signed outliers, sample size and performance by occupation and metro.

The 2023 pilot used seven occupations across San Francisco, Reno and Dallas–Fort Worth (21 equal-weight pairs). Median absolute errors were 6.0% national-only, 6.6% price-adjusted and 4.4% wage-adjusted. The price model underpredicted San Francisco marketing specialists by 25.8% and overpredicted Reno sales managers by 25.1%. Even the wage-adjusted model missed by up to 26.2%. Expand testing to the app's 21 US metros before treating a modeled wage as a planning default. Use an actual national price denominator; Canada's inter-city index uses the combined city average. [BEA metro price parities](https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area) · [BLS May 2023 national wages](https://www.bls.gov/oes/2023/may/oes_nat.htm)

## Verify the import

Check these historical fixtures against their specific vintage. Keep them separate from live defaults.

- Canadian NOC 21232, 2023–24: Toronto region low/median/high CAD 30.00/48.08/76.92 per hour; Lower Mainland–Southwest CAD 32.00/52.40/84.13.
- Singapore accountant excluding tax accountant, June 2024: SGD gross monthly P25/P50/P75 of 4,600/5,498/6,695; basic median 5,434.
- Dubai small-company finance manager, Q4 2026: AED 15,000–22,000 monthly recruiter range; median unavailable.

When changing an importer, verify the sample figures, geographic labels, match quality, rights status and application display through the planner's normal entry point. A repeated import of the same vintage should produce the same observations.
