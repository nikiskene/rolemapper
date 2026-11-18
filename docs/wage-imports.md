# Planner wage sources

The hiring planner reads release snapshots from `public/wages/` on the Rolemapper site. It uses the source currency and reports the actual geography of the observation. Each snapshot can be regenerated independently from its publisher file. The U.S. BLS May 2025 snapshot remains in `src/metroWages.json` and covers 21 metros and nine occupations.

| Snapshot | Publisher release | Records and geography |
| --- | --- | --- |
| Canada | Job Bank wages, 19 November 2025, NOC 2021 | 44,376 observations for 516 occupations across 86 geography codes, including 76 economic regions, nine provinces, and the national total. |
| Singapore | MOM Resident Occupational Wages, June 2025 | 523 occupational rows, with gross and basic monthly medians and P25/P75 figures for the city-state. |
| London | ONS ASHE Table 15.7a, 2025 revised, SOC 2020 | 412 London workplace region observations, annual gross pay for full-time employees, all sexes. |
| UK national | ONS ASHE Table 14.7a, 2025 revised, SOC 2020 | 412 national observations on the same basis, used as fallback. |
| Austria | Statistics Austria Structure of Earnings Survey, October 2022, Table 5 | 36 national ÖISCO-08 occupational groups with gross hourly wages where published. |

Counts include observations with unavailable statistics. Lookup requires a published mean for the existing U.S. snapshot or a published median for the other sources. Role mappings are maintained in `src/internationalWages.ts`. Named examples include software developer, product and web designer, accountant, financial analyst, marketing specialist and manager, sales manager, operations coordinator, customer support, events and public relations where a corresponding wage is published. For product management, users select a proxy if its duties fit.

## Repeatable refresh

1. Download the exact publisher distribution. Save a local copy with the edition and a SHA-256 checksum, especially for the Singapore endpoint, which serves the current release at the same URL.
2. Run the matching command below. Use Python 3 and `openpyxl` for the ONS ZIP files. Fixture and schema errors occur before replacement of the checked-in snapshot. Output is deterministic for the same input.
3. Review the fixture values, record counts, suppression rules, source metadata and reuse terms when adding a new edition. Update the pinned checks and labels deliberately. Build Rolemapper and test the affected markets before releasing the refreshed snapshots.

| Command | Input |
| --- | --- |
| `python3 scripts/import-wages.py canada ca.csv` | [Canadian 2025 CSV](https://open.canada.ca/data/dataset/adad580f-76b0-4502-bd05-20c125de9116/resource/9da94d63-b178-4a64-aeb3-b6a3bd721ad2/download/2a71-das-wage2025opendata-esdc-all-19nov2025-vf.csv) |
| `python3 scripts/import-wages.py singapore sg.json --singapore-year 2025` | [Singapore datastore response](https://data.gov.sg/api/action/datastore_search?resource_id=d_9917e751f7498502f70052a940a3f312&limit=1000). A publisher CSV is also supported. A complete archived 2024 input can be imported using `--singapore-year 2024`. |
| `python3 scripts/import-wages.py london uk.zip` | [London 2025 revised archive](https://www.ons.gov.uk/file?uri=%2Femploymentandlabourmarket%2Fpeopleinwork%2Fearningsandworkinghours%2Fdatasets%2Fregionbyoccupation4digitsoc2010ashetable15%2F2025revised%2Fashetable152025revised.zip) |
| `python3 scripts/import-wages.py uk-national uk-national.zip` | [UK 2025 revised archive](https://www.ons.gov.uk/file?uri=%2Femploymentandlabourmarket%2Fpeopleinwork%2Fearningsandworkinghours%2Fdatasets%2Foccupation4digitsoc2010ashetable14%2F2025revised%2Fashetable142025revised.zip) |
| `python3 scripts/import-wages.py austria at.ods` | [Statistics Austria occupational earnings workbook](https://www.statistik.at/fileadmin/pages/335/VSE2022_tab2_bruttostundenverdienste_nach_merkmalen_der_besch.ods) |

## Release fixtures

- Canada NOC 21232, 2023–24. Toronto economic region CAD 30.00 / 48.08 / 76.92 per hour and Vancouver's Lower Mainland–Southwest economic region CAD 32.00 / 52.40 / 84.13 per hour, published low / median / high.
- Singapore accountant excluding tax accountant. The linked datastore served June 2025 on 18 November 2026. Its gross P25 / P50 / P75 was SGD 4,638 / 5,968 / 7,953 monthly, and the basic median was SGD 5,834. The historical June 2024 publisher listing showed 4,600 / 5,498 / 6,695 gross and a 5,434 basic median. That historical row is a validation fixture for a complete 2024 archive. It is not included in the June 2025 snapshot.
- London SOC 2134. `Work Region Occupation SOC20 (4) Table 15.7a   Annual pay - Gross 2025.xlsx`, `Full-Time!D2949`, GBP 72,733.20. The percentile cells J2949 and O2949 contain `x`. London SOC 2141 median is suppressed. The national workbook `Occupation SOC20 (4) Table 14.7a   Annual pay - Gross 2025.xlsx`, `Full-Time!D92`, contains GBP 48,696.30.
- San Francisco metro software developer, May 2025. USD 193,430 annual mean and USD 163,500–219,670 P25–P75.

The planner links to publisher attribution and reuse terms. Vienna can use an explicitly labeled Austrian national occupational group. Dubai recruiter ranges and Berlin and Munich exports remain outside the bundled benchmarks pending verification of paid-app reuse or bulk extraction.
