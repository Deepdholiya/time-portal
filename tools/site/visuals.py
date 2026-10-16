# Product mock-ups reused across the inner pages. All names and numbers are sample data.
from shared import icon

def panel(inner):
    return f'<div class="panel show"><div class="pw">{inner}</div></div>'

V_TIME = panel('''<div class="pw-head"><b>Log time</b><span class="muted">Tue 14 Oct</span><span class="grow"></span><span class="chip"><svg class="ico-s"><use href="#i-clock"/></svg>Starts after last entry</span></div>
<div class="lst">
  <div class="lr"><i style="--c:#f97316"></i><span><b>Website redesign</b><small>Homepage hero QA</small></span><span class="muted">09:30–11:00</span><b class="num">1:30</b></div>
  <div class="lr"><i style="--c:#6366f1"></i><span><b>Brand sprint</b><small>Moodboard round 2</small></span><span class="muted">11:00–12:30</span><b class="num">1:30</b></div>
  <div class="lr"><i style="--c:#10b981"></i><span><b>Internal tools</b><small>Sprint planning</small></span><span class="muted">13:15–14:00</span><b class="num">0:45</b></div>
  <div class="lr new"><i style="--c:#f97316"></i><span><b>Website redesign</b><small>Client call notes</small></span><span class="muted">14:00–15:15</span><b class="num brand-t">1:15</b></div>
</div>
<div class="pw-foot"><div><b>Day total 5:00</b><span class="xs muted">Submits itself at 23:59</span></div><span class="btn btn-brand btn-xs">Log time</span></div>''')

V_SHEET = panel('''<div class="pw-head"><b>Team timesheets</b><span class="grow"></span><span class="chip">Group: Project</span><span class="chip chip-brand">Export</span></div>
<div class="sheet">
  <span></span><span class="h">Mon</span><span class="h">Tue</span><span class="h">Wed</span><span class="h">Thu</span><span class="h">Fri</span><span class="h r">Total</span>
  <span class="p"><i style="background:#f97316"></i>Website</span><span>12:30</span><span>14:00</span><span>13:30</span><span>11:00</span><span>9:30</span><b class="r">60:30</b>
  <span class="p"><i style="background:#6366f1"></i>Brand</span><span>8:00</span><span>6:30</span><span>9:00</span><span class="lv">Leave</span><span>7:00</span><b class="r">30:30</b>
  <span class="p"><i style="background:#10b981"></i>Internal</span><span>3:00</span><span>4:30</span><span>2:00</span><span>3:30</span><span class="hol">Holiday</span><b class="r">13:00</b>
</div>
<div class="pw-foot"><div><b>104h logged by 6 people</b><span class="xs muted">Excel, PDF or CSV with totals</span></div><span class="tool-row sm"><span class="tool">XLS</span><span class="tool">PDF</span><span class="tool">CSV</span></span></div>''')

V_ROAD = panel('''<div class="pw-head"><b>Roadmap</b><span class="muted">Q4</span><span class="grow"></span><span class="chip">Oct</span><span class="chip">Nov</span><span class="chip">Dec</span></div>
<div class="rm">
  <div class="rm-row"><span>Website redesign</span><span class="rm-bar" style="--l:2%;--w:58%"></span></div>
  <div class="rm-row"><span>Brand sprint</span><span class="rm-bar b2" style="--l:20%;--w:34%"></span><i class="rm-ms" style="--l:54%"></i></div>
  <div class="rm-row"><span>Mobile app · v2</span><span class="rm-bar b3 drag" style="--l:44%;--w:46%"></span></div>
  <div class="rm-row"><span>Retainer · Q4</span><span class="rm-bar b4c" style="--l:0%;--w:96%"></span></div>
  <span class="rm-today" style="--l:38%"><em>Today</em></span>
</div>
<div class="pw-foot"><div><b>Mobile app moved one week later</b><span class="xs muted">Its two dependent tasks moved with it</span></div><span class="btn btn-outline btn-xs">Undo</span></div>''')

V_BARS = panel('''<div class="pw-head"><b>Website redesign</b><span class="muted hide-xs">Hours · <span class="dash-key"></span> budget</span><span class="grow"></span><span class="chip"><svg class="ico-s"><use href="#i-cal"/></svg>This quarter</span></div>
<div class="bars4">
  <div class="b4"><span class="b4-f" style="--h:59%"></span><i class="b4-budget" style="--bv:.59"></i><b>Discovery</b><span>40h of 40h</span></div>
  <div class="b4"><span class="b4-f" style="--h:81%"></span><i class="b4-budget" style="--bv:.88"></i><b>Design</b><span>55h of 60h</span></div>
  <div class="b4"><span class="b4-f" style="--h:100%"></span><i class="b4-budget" style="--bv:.88"></i><b>Homepage</b><span>68h of 60h</span></div>
  <div class="b4 hot"><span class="b4-f" style="--h:31%"></span><i class="b4-budget" style="--bv:.24"></i><b>QA</b><span><em class="brand-t">+31%</em></span></div>
</div>
<div class="pw-foot"><div><b>QA is 31% over budget</b><span class="xs muted">Click a bar to see its entries</span></div><span class="btn btn-brand btn-xs">See entries</span></div>''')

V_APPROVE = panel('''<div class="pw-head"><b>Approvals</b><span class="muted">3 waiting</span></div>
<div class="ap">
  <div class="ap-row"><span class="av" style="--c:#f97316">AR</span><div><b>Ana R. · Leave</b><span class="xs muted">Thu 23 Oct · 1 day</span></div><span class="pill pill-ok">Approved</span></div>
  <div class="ap-row"><span class="av" style="--c:#6366f1">KS</span><div><b>Karan S. · Reimbursement</b><span class="xs muted">Client lunch · ₹2,400 · receipt</span></div><span class="ap-btns"><span class="btn btn-outline btn-xs">Decline</span><span class="btn btn-brand btn-xs">Approve</span></span></div>
  <div class="ap-row"><span class="av" style="--c:#10b981">MP</span><div><b>Meera P. · Leave</b><span class="xs muted">3–5 Nov · 3 days</span></div><span class="ap-btns"><span class="btn btn-outline btn-xs">Decline</span><span class="btn btn-brand btn-xs">Approve</span></span></div>
</div>
<div class="pw-foot"><div><b>Shows on the timesheet calendar</b><span class="xs muted">Approved leave blocks those days for logging</span></div></div>''')

V_AI = '''<div class="panel show"><div class="ai-chat">
<div class="ai-top"><span class="spark-b"><svg class="ico-s"><use href="#i-spark"/></svg></span><b>Ask AI</b><span class="grow"></span><span class="xs muted"><i class="live"></i> Northwind Studio</span></div>
<div class="ai-body">
  <div class="bubble">Who has room for more work next week?</div>
  <span class="xs muted">Checked workload and approved leave for week 43</span>
  <p>Meera has the most room: 18 free hours. Ana is fully booked and has a day of leave on Thursday.</p>
  <div class="ai-table">
    <div class="at-h"><span>Person</span><span class="r">Planned</span><span class="r">Leave</span><span class="r">Free</span></div>
    <div class="at-r"><span>Ana R.</span><span class="r">32h</span><span class="r">8h</span><span class="r">0h</span></div>
    <div class="at-r"><span>Karan S.</span><span class="r">38h</span><span class="r">—</span><span class="r">2h</span></div>
    <div class="at-r hi"><span>Meera P.</span><span class="r">22h</span><span class="r">—</span><span class="r">18h</span></div>
  </div>
</div></div></div>'''

def tog(on):
    return f'<i class="tg{" on" if on else ""}"></i>'

V_PERM = panel('''<div class="pw-head"><b>Roles and permissions</b><span class="grow"></span><span class="chip">+ Custom role</span></div>
<div class="perm">
  <span></span><span class="h">Admin</span><span class="h">Manager</span><span class="h">Employee</span>
  <span>Log own time</span>''' + tog(1) + tog(1) + tog(1) + '''
  <span>See team timesheets</span>''' + tog(1) + tog(1) + tog(0) + '''
  <span>Rates and budgets</span>''' + tog(1) + '<i class="tg flip"></i>' + tog(0) + '''
  <span>Approve leave</span>''' + tog(1) + tog(1) + tog(0) + '''
  <span>Export reports</span>''' + tog(1) + tog(1) + tog(0) + '''
</div>
<div class="pw-foot"><div><b>Override for one person</b><span class="xs muted">Give Meera budget access without changing her role</span></div></div>''')

V_LOAD = panel('''<div class="pw-head"><b>Workload · Design team</b><span class="grow"></span><span class="chip">Week 42</span></div>
<div class="wr-table" style="border-top:0;margin-top:0">
  <div class="wr-cols"><span>Person</span><span></span><span class="r">Load</span><span class="r">Free</span></div>
  <div class="wr-row"><span>Ana R.</span><span class="dots" data-n="20" data-on="20"></span><span class="r">100%</span><span class="r">0h</span></div>
  <div class="wr-row"><span>Karan S.</span><span class="dots" data-n="20" data-on="19"></span><span class="r">96%</span><span class="r">2h</span></div>
  <div class="wr-row"><span>Vikram T.</span><span class="dots" data-n="20" data-on="15"></span><span class="r">75%</span><span class="r">10h</span></div>
  <div class="wr-row hi"><span>Meera P.</span><span class="dots brand" data-n="20" data-on="11"></span><span class="r brand-t">54%</span><span class="r">18h</span></div>
</div>
<div class="pw-foot"><div><b>Utilisation 81%</b><span class="xs muted">176h planned of 216h capacity</span></div><span class="btn btn-dark btn-xs">Open workload</span></div>''')

V_SECURE = panel('''<div class="pw-head"><b>Sign in</b><span class="grow"></span><span class="pill pill-ok">2FA on</span></div>
<div class="sec-ui">
  <div class="su-field"><span class="xs muted">Email</span><span>ana@northwind.studio</span></div>
  <div class="su-code"><span>4</span><span>8</span><span>2</span><span>1</span><span>7</span><span class="cur"></span></div>
  <span class="xs muted">Enter the 6-digit code from your authenticator app</span>
</div>
<div class="pw-foot"><div><b>Audit log</b><span class="xs muted">5 wrong passwords · locked for 15 minutes</span></div><span class="btn btn-outline btn-xs">View log</span></div>''')
