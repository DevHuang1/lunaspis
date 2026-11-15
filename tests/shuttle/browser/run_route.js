// Isolated browser regression; no database, multiplayer server or storage writes.
// NODE_PATH must expose the existing Playwright install. Optional TEST_BROWSER_PATH,
// THREE_JS_PATH and OUT_DIR select the browser, offline Three.js copy and screenshots.
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const OUT = process.env.OUT_DIR || require('node:os').tmpdir();
const express = require(path.join(root, 'node_modules/express'));
const { chromium } = require('playwright');
const { ShuttleMission } = require(path.join(root, 'public/js/game/shuttle_mission.js'));
const {createPilot, fly} = require('../pilot');
const mission = new ShuttleMission(), shots = [];
const advance = mission.advanceSim.bind(mission);
let lastPhase, nextTime = 90;
const ascentShots = [90, 250, 450];
mission.advanceSim = seconds => {
  const result = advance(seconds);
  const captureAscent = ascentShots.length && mission.st.t >= ascentShots[0];
  if (captureAscent) ascentShots.shift();
  if ((mission.phase !== lastPhase || mission.st.t >= nextTime || captureAscent) && mission.phase !== 'debrief') {
    shots.push(JSON.parse(JSON.stringify(mission.snapshot())));
    lastPhase = mission.phase; nextTime = mission.st.t + 600;
  }
  return result;
};
fly(mission, createPilot());
assert.ok(mission.result && mission.result.success);

const app = express();
app.get('/flight-check', (req, res) => res.send(`<!doctype html><style>body{margin:0;overflow:hidden}</style><body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
${['js/loaders/GLTFLoader.js', 'js/loaders/SkeletonUtils.js', 'js/core/glb_manager.js', 'js/game/shuttle_simulation.js', 'js/game/shuttle_mission.js', 'js/world/earth_globe.js', 'js/world/shuttle_route.js', 'js/world/shuttle_view.js'].map(s => `<script src="/${s}"></script>`).join('')}
<script>const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement); window.view=new ShuttleView(renderer);view.autoRecentre=false;view.camOrbit.yaw=1.35;view.camOrbit.pitch=0.12;view.zoom=0.75;</script>`));
app.use(express.static(path.join(root, 'public')));
(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.TEST_BROWSER_PATH,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page = await browser.newPage({viewport:{width:1280,height:720}});
    const errors=[]; page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR',e.message); });
    page.on('console', m => { if(m.type()==='error' && !m.text().includes('404')) errors.push(m.text()); });
    if(process.env.THREE_JS_PATH) await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', r=>r.fulfill({path:process.env.THREE_JS_PATH,contentType:'application/javascript'}));
    await page.goto(`http://127.0.0.1:${server.address().port}/flight-check`, {waitUntil:'load'});
    await page.waitForFunction(() => window.view && view.routes && view.assetStatus.orbiter === 'ok' && view.assetStatus.et === 'ok', null, {timeout:30000}).catch(async e=>{console.log(await page.evaluate(()=>({three:!!window.THREE,status:window.view?.assetStatus})));throw e});
    for (const sn of shots) {
      const result = await page.evaluate(sn => {
        view.camPos=null;
        view.update(sn, {}, 1/60);view.render();
        const trajectoryLines = [];
        let sceneLineCount = 0;
        for (const scene of [view.near, view.far]) {
          scene.traverse(object => {
            if (object.isLine && object.visible) {
              sceneLineCount++;
              if (object.renderOrder === 30) trajectoryLines.push(object.geometry.drawRange.count);
            }
          });
        }
        return { phase: sn.phase, time: sn.simTime, trajectoryLines, sceneLineCount, aim: view.aimBody };
      }, sn);
      assert.deepEqual(result.trajectoryLines, []);
      assert.ok(result.sceneLineCount > 0, 'launch-complex wires remain in the scene');
      assert.ok(result.aim.length === 3 && result.aim.every(Number.isFinite), 'steering aim remains available');
      await page.screenshot({path:path.join(OUT, `flight-${sn.phase}-${Math.round(sn.simTime)}.png`)});
      console.log(JSON.stringify(result));
    }
    const manual = shots.find(s=>s.phase==='payload');
    await page.evaluate(sn => {
      sn.vehicle.r=ShuttleSim.vec.add(sn.vehicle.r,[1200,-600,300]);
      sn.vehicle.prevR=sn.vehicle.r;
      view.camPos=null;view.update(sn,{},1/60);view.render();
    },manual);
    await page.screenshot({path:path.join(OUT,'flight-manual-reroute.png')});
    const regression = await page.evaluate(sn => {
      const S=ShuttleSim, V=THREE.Vector3, route=view.routes.deploy, th=S.gmst({theta0:sn.theta0},sn.simTime);
      const r=S.vec.add(sn.vehicle.r,[1200,-600,300]);
      route.update(sn,r,th);
      const vehicle=new V(...S.eciToEcef(r,th));
      if(route.point(route.anchor).distanceTo(vehicle)>0.01) throw Error('reroute misses rendered shuttle');
      if(route.point(0).distanceTo(route.points[0])>1e-6 || route.point(1).distanceTo(route.points.at(-1))>1e-6) throw Error('reroute moves launch/landing');
      for(const t of [route.anchor-route.left,route.anchor,route.anchor+route.right]) {
        const eps=Math.min(route.left,route.right)*1e-5;
        if(t<=eps||t>=1-eps)continue;
        const a=route.point(t).sub(route.point(t-eps)).normalize(), b=route.point(t+eps).sub(route.point(t)).normalize();
        if(a.dot(b)<0.9999)throw Error('tangent discontinuity');
      }
      const before=route.sample(S.eciToEcef(view.camPos,th)).map(p=>p.toArray());
      sn.vehicle.q=S.quat.qFromNoseUp([1,0,0],[0,0,1]); route.update(sn,r,th);
      const after=route.sample(S.eciToEcef(view.camPos,th)).map(p=>p.toArray());
      if(JSON.stringify(before)!==JSON.stringify(after))throw Error('route is glued to nose attitude');
      let maxMs=0, previousAnchor=null, maxAnchorStep=0;
      for(let i=0;i<120;i++) {
        const t=performance.now();
        const state=S.keplerPropagate(sn.vehicle.r,sn.vehicle.v,i*5);
        const current={...sn,simTime:sn.simTime+i*5,vehicle:{...sn.vehicle,r:state.r,v:state.v}};
        const angle=S.gmst({theta0:sn.theta0},current.simTime);
        route.update(current,state.r,angle);
        if(previousAnchor!==null)maxAnchorStep=Math.max(maxAnchorStep,Math.abs(route.anchor-previousAnchor));
        previousAnchor=route.anchor;
        if(route.point(route.anchor).distanceTo(new V(...S.eciToEcef(state.r,angle)))>0.02)throw Error('anchor drift');
        const pts=route.sample(S.eciToEcef(S.vec.add(state.r,[100,100,100]),angle));
        if(!pts.every(p=>Number.isFinite(p.x+p.y+p.z)))throw Error('invalid route');
        maxMs=Math.max(maxMs,performance.now()-t);
      }
      view._updateRouteAim(sn, sn.vehicle.r, sn.vehicle.q, th);
      if (!view.aimBody.every(Number.isFinite)) throw Error('invalid steering aim');
      if (view.ribbonNear) throw Error('trajectory line allocated');
      view._updateRouteAim({ ...sn, phase: 'debrief' }, sn.vehicle.r, sn.vehicle.q, th);
      if(maxAnchorStep>0.01)throw Error('route jumps between distant branches');
      return {singleSpline:true,anchored:true,continuousTangents:true,fixedEndpoints:true,independentOfNose:true,orbitMinutes:10,maxUpdateMs:maxMs,maxAnchorStep};
    },manual);
    console.log(JSON.stringify(regression));
    assert.deepEqual(errors, []);
    await page.evaluate(() => view.dispose());
    console.log('PASS no Shuttle trajectory lines, scene wires and steering retained, smooth rerouting, ten-minute stability, disposal, no browser/shader errors');
  } finally { if(browser)await browser.close(); server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
