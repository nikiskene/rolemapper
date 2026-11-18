"""Build pinned planner datasets from downloaded publisher files. See docs/wage-imports.md."""
import argparse
import csv
import io
import json
import math
import re
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "wages"

def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) and result > 0 else None
    except (ValueError, TypeError):
        return None

def canada(path):
    regions = {}
    occupations = {}
    rows = {}
    with path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            assert row["Revision_Date_Date_revision"] == "2025-11-19"
            geo = row["ER_Code_Code_RE"]
            code = row["NOC_CNP"].removeprefix("NOC_")
            regions[geo] = [row["ER_Name"], row["prov"]]
            occupations[code] = row["NOC_Title_eng"]
            observation = [
                row["Reference_Period"],
                "year" if row["Annual_Wage_Flag_Salaire_annuel"] == "1" else "hour",
                *[number(row[field]) for field in (
                    "Median_Wage_Salaire_Median", "Low_Wage_Salaire_Minium",
                    "High_Wage_Salaire_Maximal", "Average_Wage_Salaire_Moyen",
                    "Quartile1_Wage_Salaire_Quartile1", "Quartile3_Wage_Salaire_Quartile3")],
                row["Data_Source_E"], row["Wage_Comment_E"], row["Source2025_NHQ"],
            ]
            group = rows.setdefault(geo, {})
            assert code not in group, (geo, code)
            group[code] = observation
    assert len(regions) == 86 and sum(map(len, rows.values())) == 44376
    assert rows["ER3530"]["21232"][:5] == ["2023-2024", "hour", 48.08, 30, 76.92]
    assert rows["ER5920"]["21232"][:5] == ["2023-2024", "hour", 52.4, 32, 84.13]
    return {"regions": regions, "occupations": occupations, "rows": rows}

def singapore(path, year):
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as file:
            observations = list(csv.DictReader(file))
    else:
        result = json.loads(path.read_text())["result"]
        observations = result["records"]
        assert len(observations) == result["total"]
    expected = {2024: (562, [[5498, 4600, 6695], [5434, 4552, 6620]]),
                2025: (523, [[5968, 4638, 7953], [5834, 4525, 7725]])}
    count, accountant = expected[year]
    assert len(observations) == count
    rows = {}
    for row in observations:
        assert row["year"] == str(year)
        name = row["occ_desc"]
        assert name not in rows, name
        rows[name] = [
            [number(row[f"mthly_{basis}_wage_{percentile}_pctile"]) for percentile in (50, 25, 75)]
            for basis in ("gross", "basic")
        ]
    assert rows["accountant (excluding tax accountant)"] == accountant
    return {"reference": f"June {year}", "rows": rows}

def uk_wages(path, local):
    from openpyxl import load_workbook
    with zipfile.ZipFile(path) as archive:
        table = "15.7a" if local else "14.7a"
        name, = [name for name in archive.namelist() if f"(4) Table {table}   Annual pay - Gross 2025.xlsx" in name]
        workbook = load_workbook(io.BytesIO(archive.read(name)), read_only=True, data_only=True)
        sheet = workbook["Full-Time"]
        rows = {}
        for i, row in enumerate(sheet.values, 1):
            if i == 1:
                assert "Annual pay - Gross (£) - For full-time employee jobs" in row[0]
            if i == 5:
                assert (row[3], row[5], row[9], row[14]) == ("Median", "Mean", 25, 75)
            description = str(row[0]).strip()
            code = str(row[1]).lstrip("'")
            if not re.fullmatch(r"[0-9]{4}", code) or (local and not description.startswith("London,")):
                continue
            assert code not in rows, (i, code)
            rows[code] = [description.split(",", 1)[1].strip() if local else description,
                          *[number(row[column]) for column in (3, 9, 14, 5)],
                          i, "".join(str(row[column] or "-")[:1] if number(row[column]) is None else "."
                                     for column in (3, 9, 14, 5))]
    if local:
        assert rows["2134"] == ["Programmers and software development professionals", 72733.2,
                                None, None, 85382.5, 2949, ".xx."]
        assert rows["2141"][1] is None
    else:
        assert rows["2141"][1] == 48696.3
    assert len(rows) > 300
    return rows

def austria(path):
    ns = {"t": "urn:oasis:names:tc:opendocument:xmlns:table:1.0"}
    with zipfile.ZipFile(path) as archive:
        document = ET.fromstring(archive.read("content.xml"))
    sheet = document.find(".//t:table[@t:name='Tab__5']", ns)
    rows = [[ "".join(cell.itertext()) for cell in row] for row in sheet.findall("t:table-row", ns)]
    assert "Oktober 2022 nach Berufsgruppe" in rows[0][0] and rows[3][0] == "Frauen und Männer"
    assert rows[2][2:5] == ["1. Quartil", "2. Quartil (Median)", "3. Quartil"]
    result = {}
    for row in rows[4:]:
        match = re.fullmatch(r"(\d{2}) (.+)", row[0]) if row else None
        if match:
            result[match[1]] = [match[2], *[number(row[i].replace(",", ".")) for i in (3, 2, 4)]]
    assert len(result) > 30 and result["25"][1]
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", choices=["canada", "singapore", "london", "uk-national", "austria"])
    parser.add_argument("file", type=Path)
    parser.add_argument("--singapore-year", type=int, choices=[2024, 2025], default=2025)
    args = parser.parse_args()
    data = {"canada": canada, "singapore": lambda path: singapore(path, args.singapore_year), "london": lambda path: uk_wages(path, True),
            "uk-national": lambda path: uk_wages(path, False), "austria": austria}[args.source](args.file)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=OUTPUT, delete=False) as output:
        json.dump(data, output, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        output.write("\n")
    Path(output.name).chmod(0o644)
    Path(output.name).replace(OUTPUT / f"{args.source}.json")
    print(args.source, sum(map(len, data["rows"].values())) if args.source == "canada" else len(data["rows"]) if args.source == "singapore" else len(data))
