# Assembles public/index.html and public/app.js from the prototype's markup plus the API-driven script.
import re
t=open('/home/claude/portal/template.html').read()
logo=re.sub(r'<\?xml[^>]*\?>\s*','',open('/home/claude/site/brand/logo_rev.svg').read()).replace(' width="747" height="290"','',1)
js=t[t.index('<script>')+8:t.index('</script>')]
reports=js[js.index('function totals(m) {'):js.index('// classifications:')]
html=t[:t.index('<script>')]+'<script src="app.js"></script>\n</body>\n</html>\n'
def rep(a,b):
    global html
    assert html.count(a)==1,(html.count(a),a[:70]); html=html.replace(a,b)
rep('%%LOGO%%',logo)
rep('<title>Alethes Client Portal Prototype</title>','<title>Alethes Client Portal</title>')
rep('<span><b>Prototype</b> &nbsp;All names and figures are invented. No client data is shown.</span>','<span><b>Test build</b> &nbsp;Sample families only. No client data is loaded.</span>')
rep('<span class="switch">View as ','<span class="switch" id="switch" hidden>View as ')
rep('<p class="who">Signed in as<span>sample.client@example.com</span></p>','<p class="who">Signed in as<span id="email"></span><a class="out" href="https://alethes-portal.cloudflareaccess.com/cdn-cgi/access/logout">Sign out</a></p>')
rep('''      <label for="month">Month-end
        <select id="month"></select>
      </label>''','''      <div class="pickers">
        <label for="family" id="famwrap" hidden>Family
          <select id="family"></select>
        </label>
        <label for="month">Month-end
          <select id="month"></select>
        </label>
      </div>''')
rep('<main class="wrap">','<main class="wrap">\n  <p id="loaderr" class="loaderr" role="alert" hidden></p>')
rep('    <div class="filters" id="clsfilters"','    <p class="foot" id="clsro" hidden>Staff view is read-only. Clients request changes from their own sign-in.</p>\n    <div class="filters" id="clsfilters"')
rep('<h3>Your requests</h3>','<h3 id="pendingtitle">Your requests</h3>')
i=html.index('<div class="card"><h3>Email alert</h3>'); j=html.index('<div class="card"><h3>Client notes</h3>')
html=html[:i]+'<div class="card"><h3>Email alert</h3><p>Email alerts are not connected in this test build. They are added once sending is set up for your domain.</p></div>\n      '+html[j:]
rep("In the live build each approved change is written to the Master Ledger and a matching row is added to a change log in that family's ledger.","Approved changes update the portal's own data in this test build. Writing them to the Master Ledger comes in the next phase.")
rep("Approved changes are written to the family's ledger and flow into their reports; declined ones change nothing.","Approved changes update the family's classifications and reports in the portal; declined ones change nothing.")
rep("  @media (max-width: 880px) {","""  [hidden] { display: none !important; }
  .pickers { display: flex; gap: 14px; flex-wrap: wrap; }
  .who .out { display: inline-block; margin-top: 4px; color: var(--sand); font-size: 12.5px; text-underline-offset: 3px; }
  #cls th, #cls td, #history th, #history td { padding: 7px 6px; font-size: 13px; }
  #cls select { padding: 4px 3px; font-size: 13px; max-width: 128px; }
  #cls input[type=text] { width: 96px; font-size: 13px; padding: 4px 6px; }
  #history td, #history tbody th { white-space: normal; vertical-align: top; overflow-wrap: anywhere; min-width: 0; }
  #history td.w { min-width: 120px; }
  #history td .pill { white-space: nowrap; }
  .loaderr { background: #F6E7E4; border: 1px solid var(--terra); color: var(--terra); border-radius: 3px; padding: 12px 14px; margin-bottom: 20px; }
  @media (max-width: 880px) {""")
assert '%%' not in html and 'example.com' not in html
app=open('ui/app.js').read(); assert app.count('/*REPORTS*/')==1
open('public/app.js','w').write(app.replace('/*REPORTS*/',reports))
open('public/index.html','w').write(html)
print('index', len(html), 'app', len(app)+len(reports))
