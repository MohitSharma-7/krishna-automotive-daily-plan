import openpyxl
from openpyxl.styles import Font, PatternFill, Border, Side

wb = openpyxl.Workbook()

# Styling helpers
header_fill = PatternFill("solid", fgColor="0F6B4B")
sub_fill = PatternFill("solid", fgColor="ECFDF5")
total_fill = PatternFill("solid", fgColor="F1F5F9")
header_font = Font(bold=True, color="FFFFFF", size=11)
bold_font = Font(bold=True, size=10)
reg_font = Font(size=10)
curr_fmt = '₹#,##0'
pct_fmt = '0.0%'
thin = Side(border_style="thin", color="CBD5E1")
border = Border(left=thin, right=thin, top=thin, bottom=thin)

# TAB 1: Assumptions & Unit Economics (₹500/month Mass-Market Model)
ws1 = wb.active
ws1.title = "1_Assumptions_&_Pricing"
ws1.append(["Parameter", "Value", "Notes / Basis"])
for cell in ws1[1]:
    cell.fill = header_fill
    cell.font = header_font

assumptions = [
    ("Monthly Subscription Price (Per Factory)", 500, "Mass-market self-serve SaaS tier"),
    ("One-Time Setup / Onboarding Fee", 0, "Zero upfront friction for MSME owners"),
    ("Avg Daily Pieces Produced per Client", 12500, "Midpoint of 10,000 - 15,000 pcs/day"),
    ("Working Days per Month", 26, "Standard 6-day factory week"),
    ("Monthly Pieces per Factory", "=B4*B5", "3,25,000 pieces/month"),
    ("Software Cost per Piece to Client (₹)", "=B2/B6", "Less than 0.2 paise per piece"),
    ("Variable COGS per Client / Month", 25, "Shared multi-tenant DB & WhatsApp alerts"),
    ("Fixed Cloud Infrastructure / Month", 600, "Render Starter ($7/mo) + Turso Free Tier"),
    ("Fixed OpEx: Digital & WhatsApp Outreach / Mo", 400, "Domain + automated WhatsApp campaigns"),
    ("Fixed OpEx: Local Travel & QR Tags / Mo", 1000, "Minimal local travel & printable QR tags"),
    ("Fixed OpEx: Contingency Buffer / Month", 400, "Miscellaneous tools & buffer"),
    ("Total Monthly Fixed Costs", "=B9+B10+B11+B12", "Fixed Infra + Fixed OpEx (₹2,400/mo)"),
    ("Contribution Margin per Client", "=B2-B8", "Price minus Variable COGS (₹475/client)"),
    ("Exact Break-Even Client Count", "=B13/B14", "5.05 -> 6 paying factories needed to break even"),
    ("Break-Even Monthly Revenue (MRR)", "=ROUNDUP(B15,0)*B2", "Reached in Month 4 at 7 active clients"),
]

for idx, (param, val, note) in enumerate(assumptions, start=2):
    ws1.append([param, val, note])
    c_val = ws1.cell(row=idx, column=2)
    if idx in (2, 3, 8, 9, 10, 11, 12, 13, 14, 16):
        c_val.number_format = curr_fmt
    elif idx == 7:
        c_val.number_format = '₹0.0000'
    elif idx == 15:
        c_val.number_format = '0.00'
    else:
        c_val.number_format = '#,##0'
    if idx in (13, 14, 15, 16):
        ws1.cell(row=idx, column=1).font = bold_font
        c_val.font = bold_font
        c_val.fill = sub_fill

# TAB 2: 1-Year P&L Projection (1 -> 23 Clients)
ws2 = wb.create_sheet("2_1Yr_PnL_Projection")
headers = [
    "Month", "Active Clients", "Revenue (₹)", "COGS (₹)", "Gross Profit (₹)",
    "Gross Margin %", "OpEx (₹)", "Net Profit / EBITDA (₹)", "Net Margin %", "Cumulative Profit (₹)"
]
ws2.append(headers)
for cell in ws2[1]:
    cell.fill = header_fill
    cell.font = header_font

client_schedule = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]
for i, cl in enumerate(client_schedule, start=2):
    m_label = f"M{i-1}"
    cum_formula = f"=H{i}" if i == 2 else f"=J{i-1}+H{i}"
    row = [
        m_label,
        cl,
        f"=B{i}*'1_Assumptions_&_Pricing'!$B$2",
        f"='1_Assumptions_&_Pricing'!$B$9+(B{i}*'1_Assumptions_&_Pricing'!$B$8)",
        f"=C{i}-D{i}",
        f"=E{i}/C{i}",
        "=SUM('1_Assumptions_&_Pricing'!$B$10:$B$12)",
        f"=E{i}-G{i}",
        f"=H{i}/C{i}",
        cum_formula
    ]
    ws2.append(row)
    for col in (3, 4, 5, 7, 8, 10):
        ws2.cell(row=i, column=col).number_format = curr_fmt
    for col in (6, 9):
        ws2.cell(row=i, column=col).number_format = pct_fmt

# Year-1 Total Row
ws2.append([
    "Year-1 Total", "=MAX(B2:B13)", "=SUM(C2:C13)", "=SUM(D2:D13)", "=SUM(E2:E13)",
    "=E14/C14", "=SUM(G2:G13)", "=SUM(H2:H13)", "=H14/C14", "=J13"
])
for col in range(1, 11):
    cell = ws2.cell(row=14, column=col)
    cell.font = bold_font
    cell.fill = total_fill
    if col in (3, 4, 5, 7, 8, 10):
        cell.number_format = curr_fmt
    elif col in (6, 9):
        cell.number_format = pct_fmt

# TAB 3: Scenario & Sensitivity Analysis
ws3 = wb.create_sheet("3_BreakEven_&_Scenarios")
ws3.append([
    "Scenario", "Ending Clients (M12)", "Year-1 Revenue (₹)",
    "Year-1 Total Costs (₹)", "Year-1 Net Profit (₹)", "Net Margin %"
])
for cell in ws3[1]:
    cell.fill = header_fill
    cell.font = header_font

# Total client-months: Conservative = 42, Base = 144, Upside = 210
scenarios = [
    ("Conservative (1 to 6 Clients)", 6, "=42*'1_Assumptions_&_Pricing'!$B$2", "=12*'1_Assumptions_&_Pricing'!$B$13+42*'1_Assumptions_&_Pricing'!$B$8"),
    ("Base Case (1 to 23 Clients)", 23, "='2_1Yr_PnL_Projection'!C14", "='2_1Yr_PnL_Projection'!D14+'2_1Yr_PnL_Projection'!G14"),
    ("Upside (1 to 34 Clients)", 34, "=210*'1_Assumptions_&_Pricing'!$B$2", "=12*'1_Assumptions_&_Pricing'!$B$13+210*'1_Assumptions_&_Pricing'!$B$8"),
]
for idx, (name, end_cl, rev_f, cost_f) in enumerate(scenarios, start=2):
    ws3.append([name, end_cl, rev_f, cost_f, f"=C{idx}-D{idx}", f"=E{idx}/C{idx}"])
    for col in (3, 4, 5):
        ws3.cell(row=idx, column=col).number_format = curr_fmt
    ws3.cell(row=idx, column=6).number_format = pct_fmt

# Auto-fit columns & apply clean borders
for sheet in wb.worksheets:
    for row in sheet.iter_rows():
        for cell in row:
            cell.border = border
            if cell.row > 1 and not cell.font.bold:
                cell.font = reg_font
    for col in sheet.columns:
        max_len = max(len(str(c.value or "")) for c in col)
        sheet.column_dimensions[col[0].column_letter].width = max(max_len + 4, 16)

wb.save("Daily_Plan_OS_Financial_Model_500.xlsx")
print("Saved Daily_Plan_OS_Financial_Model_500.xlsx")