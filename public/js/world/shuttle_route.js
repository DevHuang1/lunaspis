/* One planned ECEF spline, from the launch pad to the runway stop. Rerouting deforms
 * this same curve locally; it never adds a nose segment, history trail or orbit ring. */
(function () {
  'use strict';
  const T = window.THREE, S = window.ShuttleSim;
  let loading;
  class ShuttleRoute {
    static load() {
      if (!loading) loading = fetch('data/shuttle_route.json?v=1').then(r => {
        if (!r.ok) throw new Error(`Flight route HTTP ${r.status}`);
        return r.json();
      });
      return loading;
    }
    constructor(data) {
      if (data.frame !== 'ecef' || !Array.isArray(data.points) || data.points.length < 4 ||
          !data.points.every(p => p.length === 5 && p.every(Number.isFinite))) throw new Error('Invalid flight route');
      this.data = data;
      this.points = data.points.map(p => new T.Vector3(...p.slice(2)));
      this.curve = new T.CatmullRomCurve3(this.points, false, 'centripetal');
      this.anchor = 0; this.offset = new T.Vector3(); this.turn = new T.Vector3();
      this.left = this.right = 0;
    }
    update(sn, rV, th) {
      const vehicle = new T.Vector3(...S.eciToEcef(rV, th));
      const phase = this.data.phases.indexOf(sn.phase), n = this.points.length - 1;
      let best = Infinity, segment = 0;
      const ab = new T.Vector3(), ap = new T.Vector3();
      // Phase bounds distinguish successive orbits and the launch/landing crossing at KSC.
      for (let i = 0; i < n; i++) {
        if (phase >= 2 && this.data.points[i][1] !== phase && this.data.points[i + 1][1] !== phase) continue;
        ab.subVectors(this.points[i + 1], this.points[i]); ap.subVectors(vehicle, this.points[i]);
        const u = T.MathUtils.clamp(ap.dot(ab) / Math.max(1e-12, ab.lengthSq()), 0, 1);
        const distance = ap.addScaledVector(ab, -u).lengthSq();
        if (distance < best) { best = distance; segment = i; }
      }
      // Continuous projection onto the spline, not a nearest-vertex switch each frame.
      let lo = segment / n, hi = (segment + 1) / n;
      for (let i = 0; i < 30; i++) {
        const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
        if (this.curve.getPoint(a).distanceToSquared(vehicle) < this.curve.getPoint(b).distanceToSquared(vehicle)) hi = b;
        else lo = a;
      }
      this.anchor = (lo + hi) / 2;
      this.offset.copy(vehicle).sub(this.curve.getPoint(this.anchor));
      const eps = Math.min(1e-5, 0.1 / n);
      const a = Math.max(0, this.anchor - eps), b = Math.min(1, this.anchor + eps);
      const derivative = this.curve.getPoint(b).sub(this.curve.getPoint(a)).multiplyScalar(1 / (b - a));
      const velocity = new T.Vector3(...S.eciToEcef(S.airVel(rV, sn.vehicle.v), th));
      const speed = velocity.length();
      this.turn.set(0, 0, 0);
      // Nose attitude is deliberately not a route input: pitching to brake or bank must not
      // glue a second direction line to the shuttle. Only actual travel bends the route.
      if (sn.vehicle.regime !== 'ascent' && speed > 1) this.turn.copy(velocity).normalize().multiplyScalar(derivative.length()).sub(derivative);
      const width = Math.min(0.08, Math.max(600, speed * 30, this.offset.length() * 4) / Math.max(1, derivative.length()));
      this.left = Math.min(width, this.anchor); this.right = Math.min(width, 1 - this.anchor);
    }
    point(t) {
      const p = this.curve.getPoint(t), delta = t - this.anchor, width = delta < 0 ? this.left : this.right;
      if (width > 0 && Math.abs(delta) < width) {
        // Compact C2 bump: position and tangent corrections fade to zero without a join.
        const x = delta / width, weight = (1 - x * x) ** 3;
        p.addScaledVector(this.offset, weight).addScaledVector(this.turn, delta * weight);
      }
      return p;
    }
    sample(cameraECEF) {
      const cam = new T.Vector3(...cameraECEF), n = this.points.length - 1, out = [];
      // Include the anchor as a vertex. Subdivide the same spline more finely near the
      // camera; distant parts stay economical, and close-up views never expose long chords.
      const knots = Array.from({ length: n + 1 }, (_, i) => i / n);
      knots.push(this.anchor);
      for (let i = 1; i < 12; i++) {
        knots.push(this.anchor - this.left * i / 12, this.anchor + this.right * i / 12);
      }
      knots.sort((a, b) => a - b);
      const subdivide = (a, pa, b, pb, depth) => {
        const mid = (a + b) / 2, pm = this.point(mid);
        const chord = pa.clone().add(pb).multiplyScalar(0.5);
        const distance = Math.max(1, pm.distanceTo(cam));
        if (depth < 12 && (pm.distanceTo(chord) > Math.max(0.02, distance * 0.0002) || pa.distanceTo(pb) > Math.max(10, distance * 0.2))) {
          subdivide(a, pa, mid, pm, depth + 1); subdivide(mid, pm, b, pb, depth + 1);
        } else out.push(pb);
      };
      out.push(this.point(0));
      for (let i = 1; i < knots.length; i++) if (knots[i] > knots[i - 1]) {
        subdivide(knots[i - 1], out[out.length - 1], knots[i], this.point(knots[i]), 0);
      }
      return out;
    }
  }
  window.ShuttleRoute = ShuttleRoute;
})();
