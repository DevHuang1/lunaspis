"""Build educational ISS-like Earth-orbit departure seeds using GMAT DE405.

The planet endpoints are read from GMAT. A two-body Lambert transfer and an
idealized circular Earth-orbit escape supply initial guesses, not flight plans.
The orbital plane is chosen for each transfer; this is not live ISS telemetry.
Run from GMAT's bin directory with GMAT_CONSOLE_PATH set if needed.
"""
from pathlib import Path
from datetime import datetime, timedelta, timezone
import json, math, os, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]
EXE = Path(os.environ.get('GMAT_CONSOLE_PATH', r'E:\gmat-R2026a-local\bin\GmatConsole.exe'))
EPOCH = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)
DESTINATIONS = {'mercury': 106, 'venus': 146, 'mars': 259, 'jupiter': 997, 'saturn': 2210, 'uranus': 5880, 'neptune': 10950}
# Offline finite-difference refinements against the same GMAT force model.
REFINEMENTS = {'saturn':[37663.751263, -3.352933, 34.057930], 'uranus':[25183.299917, -.973231, 25.633396], 'neptune':[23073.156890, 6.998945, 103.890475]}
MU_SUN = 132712440018.0
MU_EARTH = 398600.4418
ORBIT_KM = 6778.0

def dot(a,b): return sum(x*y for x,y in zip(a,b))
def norm(a): return math.sqrt(dot(a,a))
def sub(a,b): return [x-y for x,y in zip(a,b)]
def add(a,b): return [x+y for x,y in zip(a,b)]
def mul(a,c): return [x*c for x in a]
def cross(a,b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def unit(a): return mul(a,1/norm(a))
def cfun(z):
    if abs(z)<1e-8: return .5-z/24+z*z/720
    if z>0: return (1-math.cos(math.sqrt(z)))/z
    return (math.cosh(math.sqrt(-z))-1)/(-z)
def sfun(z):
    if abs(z)<1e-8: return 1/6-z/120+z*z/5040
    if z>0:
        q=math.sqrt(z); return (q-math.sin(q))/(q*q*q)
    q=math.sqrt(-z); return (math.sinh(q)-q)/(q*q*q)

def lambert(r1,r2,seconds):
    r1m,r2m=norm(r1),norm(r2)
    co=max(-1.,min(1.,dot(r1,r2)/(r1m*r2m)))
    si=math.sqrt(max(0.,1-co*co))
    if cross(r1,r2)[2]<0: si=-si
    A=si*math.sqrt(r1m*r2m/(1-co))
    def calc(z):
        C,S=cfun(z),sfun(z)
        if C<=0: return None
        y=r1m+r2m+A*(z*S-1)/math.sqrt(C)
        if y<=0: return None
        return ((y/C)**1.5*S+A*math.sqrt(y))/math.sqrt(MU_SUN)-seconds, y
    previous=None
    bracket=None
    for j in range(2001):
        z=-39+78*j/2000
        result=calc(z)
        if result is None: continue
        if previous and previous[1]*result[0]<=0:
            bracket=(previous[0],z); break
        previous=(z,result[0])
    if bracket is None: raise RuntimeError('Lambert solution not bracketed')
    lo,hi=bracket
    for _ in range(100):
        mid=(lo+hi)/2
        if calc(mid)[0]>0: hi=mid
        else: lo=mid
    y=calc((lo+hi)/2)[1]
    f=1-y/r1m; g=A*math.sqrt(y/MU_SUN)
    return mul(sub(r2,mul(r1,f)),1/g)

def epoch(d): return d.strftime('%d %b %Y %H:%M:%S.000')
def states(planet,days,folder):
    report=(folder/'planet-report.txt').as_posix()
    fields=['X','Y','Z','VX','VY','VZ']
    script=('Create CoordinateSystem SunFrame;\nSunFrame.Origin = Sun;\nSunFrame.Axes = MJ2000Eq;\n'
            f'Create CoordinateSystem TargetFrame;\nTargetFrame.Origin = {planet.title()};\nTargetFrame.Axes = MJ2000Eq;\n')
    for name,date in [('Start',EPOCH),('Finish',EPOCH+timedelta(days=days))]:
        script+=(f"Create Spacecraft {name};\n{name}.DateFormat = UTCGregorian;\n{name}.Epoch = '{epoch(date)}';\n"
                 f'{name}.CoordinateSystem = SunFrame;\n{name}.X = 150000000;\n{name}.Y = 0;\n{name}.Z = 0;\n'
                 f'{name}.VX = 0;\n{name}.VY = 30;\n{name}.VZ = 0;\n')
    script+=f"Create ReportFile Report1;\nReport1.Filename = '{report}';\nReport1.WriteHeaders = false;\nBeginMissionSequence;\n"
    for name,frame in [('Start','EarthMJ2000Eq'),('Finish','TargetFrame')]:
        pairs=' '.join(f'{name}.SunFrame.{f} {name}.{frame}.{f}' for f in fields)
        script+=f'Report Report1 {pairs};\n'
    source=folder/'states.script'; source.write_text(script)
    p=subprocess.run([str(EXE),'-r',str(source)],cwd=EXE.parent,capture_output=True,text=True,timeout=40)
    if p.returncode or 'Mission run completed.' not in p.stdout: raise RuntimeError(p.stdout[-3000:]+p.stderr[-1000:])
    rows=[[float(v) for v in line.split()] for line in (folder/'planet-report.txt').read_text().splitlines() if line.strip()]
    if len(rows)!=2 or any(len(row)!=12 for row in rows): raise RuntimeError('Invalid GMAT planet report')
    return [[row[i]-row[i+1] for i in range(0,12,2)] for row in rows]

def main():
    if not EXE.exists(): raise SystemExit('GMAT executable not found: '+str(EXE))
    data={'source':'GMAT R2026a DE405 planetary states; idealized two-body Lambert escape seeds',
          'epoch':'2000-01-01T12:00:00.000Z','note':'Fictional ISS-like circular orbit aligned to each transfer; not historical or live ISS telemetry.', 'planets':{}}
    scratch=ROOT/'server'/'.gmat-runtime'
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='lunaspis-seeds-',dir=scratch) as temp:
        folder=Path(temp)
        for planet,days in DESTINATIONS.items():
            earth,target=states(planet,days,folder)
            transfer=lambert(earth[:3],target[:3],days*86400)
            excess=sub(transfer,earth[3:])
            vinf=norm(excess)
            if vinf<0.01: raise RuntimeError('Invalid departure excess speed')
            u=unit(excess)
            normal=[0.,-.397777, .917482]
            perpendicular=unit(cross(normal,u))
            eccentricity=1+ORBIT_KM*vinf*vinf/MU_EARTH
            anomaly=math.acos(-1/eccentricity)
            radial=add(mul(u,math.cos(anomaly)),mul(perpendicular,-math.sin(anomaly)))
            tangent=add(mul(u,math.sin(anomaly)),mul(perpendicular,math.cos(anomaly)))
            r=add(earth[:3],mul(radial,ORBIT_KM))
            v=add(earth[3:],mul(tangent,math.sqrt(MU_EARTH/ORBIT_KM)))
            dv=(math.sqrt(vinf*vinf+2*MU_EARTH/ORBIT_KM)-math.sqrt(MU_EARTH/ORBIT_KM))*1000
            data['planets'][planet]={'epochMs':int(EPOCH.timestamp()*1000), 'state':r+v, 'horizonDays':days,
                'suggestedBurnMps':REFINEMENTS.get(planet,[dv,0,0]), 'dryMassKg':12000, 'fuelKg':100000, 'ispSec':3000,
                'earthPositionKm':earth[:3], 'targetArrivalPositionKm':target[:3]}
            print(planet,'flight days',days,'suggested departure m/s',round(dv),flush=True)
    (ROOT/'public'/'data'/'gmat-planet-seeds.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')

if __name__=='__main__': main()
