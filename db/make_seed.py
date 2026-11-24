# Builds db/seed.sql: two invented families, three test users, a few sample requests.
import json, os, copy, io, contextlib
ns={}
src=open('/home/claude/portal/gen.py').read().split("logo=re.sub")[0]   # data only, no HTML output
cwd=os.getcwd(); os.chdir('/home/claude/portal')
with contextlib.redirect_stdout(io.StringIO()): exec(src, ns)
os.chdir(cwd)
H=ns['data']
q=lambda s: "'"+str(s).replace("'","''")+"'"
def fam_data(d): return {k:d[k] for k in ('entities','months','funds','docs','notes','upcoming')}
def accounts(d):
    lab={e['id']:e['label'] for e in d['entities']}
    return [dict(name=a['name'],ent=a['ent'],value=a['value'],bucket=lab[a['ent']],cls=a['cls'],liq=a['liq'],inv=a['inv']) for a in d['accounts']]
# second family: renamed and rescaled copy so the two are easy to tell apart
W=copy.deepcopy(H)
for e,n in zip(W['entities'],['Whitlock Holdings','Aspen Row','Tern Island']): e['name']=n
ren={'Money market savings':'Short-term treasury account','Municipal bond account':'Coastal bond ladder','Lake house':'Ranch property',
 'Halyard Long-Only Fund':'Orchard Bay Long-Only Fund','Northgate Partners Fund IV':'Redfern Partners Fund II','Alder Growth Equity II':'Calder Growth Equity III',
 'Tidewater Capital Partners III':'Ironwood Capital Partners V','Juniper Credit Opportunities':'Larkspur Credit Opportunities','Stonebridge Income Fund':'Pinnacle Income Fund',
 'Lumen Ventures II':'Quill Ventures I','Fieldstone Seed Fund':'Hollow Oak Seed Fund','Kestrel Ventures III':'Marlin Ventures II',
 'Meridian Row Apartments LP':'Sutter Street Apartments LP','Cold Spring Industrial LP':'Dry Creek Industrial LP'}
S=0.63; sc=lambda v:int(round(v*S))
for a in W['accounts']: a['name']=ren.get(a['name'],a['name']); a['value']=sc(a['value'])
for f in W['funds']:
    f['name']=ren.get(f['name'],f['name'])
    for k in ('commit','contrib','dist','value'): f[k]=sc(f[k])
for m in W['months']:
    for r in m['rows']: r['v']=[sc(x) for x in r['v']]
entn={'Harbor Lane':'Whitlock Holdings','Cedar Ridge':'Aspen Row','North Sound':'Tern Island'}
for d in W['docs']:
    d['ent']=entn.get(d['ent'],d['ent'])
    for a,b in list(ren.items())+[('Cedar Ridge','Aspen Row'),('Harbor Lane','Whitlock Holdings')]: d['name']=d['name'].replace(a,b)
W['notes']=['Reserve cash is lower after October property tax payments.','Calder Growth Equity III still has part of its commitment unfunded. No call is scheduled.','Fund values for private equity and venture capital are as of June 30.']
W['upcoming']=[['Nov 20, 2026','Capital call due, Redfern Partners Fund II','$47,000'],['Jan 15, 2027','Fourth-quarter estimated tax payment','To be confirmed']]
fams=[('harbor','Harbor family',H),('whitlock','Whitlock family',W)]
out=['DELETE FROM notes_log;','DELETE FROM requests;','DELETE FROM accounts;','DELETE FROM users;','DELETE FROM families;']
aid=0; ids={}
for fid,name,d in fams:
    out.append(f"INSERT INTO families (id,name,data) VALUES ({q(fid)},{q(name)},{q(json.dumps(fam_data(d),separators=(',',':')))});")
    for pos,a in enumerate(accounts(d)):
        aid+=1; ids[(fid,a['name'])]=aid
        out.append(f"INSERT INTO accounts (id,family_id,pos,name,ent,value,bucket,cls,liq,inv) VALUES ({aid},{q(fid)},{pos},{q(a['name'])},{q(a['ent'])},{a['value']},{q(a['bucket'])},{q(a['cls'])},{q(a['liq'])},{q(a['inv'])});")
for email,role,fid in [('staff.test@example.com','staff',None),('harbor.test@example.com','client','harbor'),('whitlock.test@example.com','client','whitlock')]:
    out.append(f"INSERT INTO users (email,role,family_id) VALUES ({q(email)},{q(role)},{q(fid) if fid else 'NULL'});")
R=[('harbor','529 college savings plans','bucket','Personal','Family trust','These are for the grandchildren.','harbor.test@example.com','2026-11-20T14:12:00Z','wait',None,None,None),
   ('whitlock','Coastal bond ladder','cls','Fixed income','Public equity','','whitlock.test@example.com','2026-11-19T19:47:00Z','wait',None,None,None),
   ('whitlock','Ranch property','inv','Non-investment','Investment','We rent it out now.','whitlock.test@example.com','2026-11-19T19:47:00Z','wait',None,None,None),
   ('whitlock','Short-term treasury account','liq','Illiquid','Liquid','','whitlock.test@example.com','2026-10-12T14:05:00Z','ok','2026-10-14T12:30:00Z','staff.test@example.com','Agreed. Maturities are all under 90 days.'),
   ('harbor','Primary residence','liq','Illiquid','Liquid','','harbor.test@example.com','2026-09-28T22:40:00Z','no','2026-09-30T13:15:00Z','staff.test@example.com','A residence cannot be sold within days, so it stays illiquid.')]
for fid,acct,f,a,b,note,by,at,st,dat,dby,why in R:
    cur=next(x for x in accounts(dict(fams)[fid] if False else [d for i,n,d in fams if i==fid][0]) if x['name']==acct)
    if st=='wait': assert cur[f]==a,(acct,f,cur[f],a)   # a waiting request must start from the current value
    out.append("INSERT INTO requests (family_id,account_id,field,from_value,to_value,note,requested_by,requested_at,status,decided_at,decided_by,reason) VALUES ("+",".join([q(fid),str(ids[(fid,acct)]),q(f),q(a),q(b),q(note),q(by),q(at),q(st)]+[q(x) if x else 'NULL' for x in (dat,dby,why)])+");")
open('db/seed.sql','w').write("\n".join(out)+"\n")
print('accounts',aid,'| seed bytes',os.path.getsize('db/seed.sql'))
