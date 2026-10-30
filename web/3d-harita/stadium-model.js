import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Original procedural architectural impression of RAMS Park, not a surveyed twin.
 * Units: metres. X = 105 m pitch length, Y = 68 m pitch width, Z = up.
 * The ~233 x 206 m envelope / 51 m height follow parent-retrieved OSM data.
 * All non-field architectural dimensions and detailing remain artistic estimates. No photos, network requests, renderer, lights or global scene state.
 * Parent owns geographic position/heading, lighting and basemap building masking.
 */

// 5x7 bitmap letters for seat mosaics (only the glyphs needed).
const GLYPHS={G:['.###.','#...#','#....','#.###','#...#','#...#','.###.'],A:['.###.','#...#','#...#','#####','#...#','#...#','#...#'],
 L:['#....','#....','#....','#....','#....','#....','#####'],T:['#####','..#..','..#..','..#..','..#..','..#..','..#..'],
 S:['.####','#....','#....','.###.','....#','....#','####.'],R:['####.','#...#','#...#','####.','#.#..','#..#.','#...#'],
 Y:['#...#','#...#','.#.#.','..#..','..#..','..#..','..#..']};
// RAMS Park defaults; other stadiums pass their OSM-derived envelope + club styling.
const RAMS = {outerHalf: [116.5, 103], bowlInnerHalf: [65, 45], height: 51, footprint: [233, 206],
  seat: 0x7a1428, seatAccent: 0xf6bb29, seatPattern: false, seatText: 'GALATASARAY', balcony: 0xb71230, cladding: 0x3a4148,
  roofStyle: 'rams', roofOpeningHalf: [60, 42], bowlExponent: 0.5, openingExponent: 0.22, roofColor: 0xf1f3f2, roofSteel: 0xf4f4f2, solar: true, led: 0xff1f3d, cornerScreens: true,
  banners: [['#f6bb29', '#bd1633', 'GS'], ['#8f1029', '#8f1029', '25']], bannerText: '#8f1029',
  sign: 'RAMS PARK', badge: ['#bd1633', '#f6bb29', 'GS']};
export function createStadiumModel(options = {}) {
  const o = {...RAMS, ...options};
  let EXP = o.bowlExponent ?? 2 / 3;
  const withExp = (e, fn) => { const prev = EXP; EXP = e; try { return fn(); } finally { EXP = prev; } };
  const [A0, B0] = o.bowlInnerHalf, KA = (o.outerHalf[0] - A0) / 52.5, KB = (o.outerHalf[1] - B0) / 52.5;
  const group = new THREE.Group();
  group.name = 'RAMS-Park-procedural';
  group.userData = { units: 'metres', upAxis: 'Z', pitchLength: 105, pitchWidth: 68,
    approximation: 'Original impression; all non-field dimensions are artistic estimates.' };
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.08, ...extra });
    materials.add(m); return m;
  };
  const concrete = mat(0xaeb2b4), dark = mat(0x263039), silver = mat(0xd3d8db);
  const steel = mat(0x9ca9af), red = mat(o.balcony), yellow = mat(0xf4b92c);
  const seatMaterial = mat(0xffffff, { vertexColors: false, roughness: 0.87, metalness: 0 });
  const turf = mat(0x268143, { metalness: 0 });
  const white = mat(0xf7f9ed, { metalness: 0 });
  const SEGMENTS = 192, TAU = Math.PI * 2;
  function contour(a, b, t, z) {
    // Adapt the envelope to the parent-retrieved OSM ~233 x 206 m footprint.
    // Preserve the regulation pitch/apron; widen only the bowl/exterior contours.
    if (a > 65) a = A0 + (a - 65) * KA; else if (a > 60) a = Math.min(a, A0);
    if (b > 45) b = B0 + (b - 45) * KB; else if (b > 40) b = Math.min(b, B0);
    const c = Math.cos(t), s = Math.sin(t), e = EXP;
    return new THREE.Vector3(a * Math.sign(c) * Math.pow(Math.abs(c), e),
      b * Math.sign(s) * Math.pow(Math.abs(s), e), z);
  }
  function mesh(name, geo, material, parent = group) {
    geometries.add(geo);
    const result = new THREE.Mesh(geo, material); result.name = name;
    result.castShadow = true; result.receiveShadow = true;
    parent.add(result); return result;
  }
  function builder() {
    const positions = [];
    return {
      quad(a, b, c, d) { for (const v of [a,b,c,a,c,d]) positions.push(v.x,v.y,v.z); },
      geometry() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals(); geo.computeBoundingSphere(); return geo;
      },
    };
  }
  // Continuous annular surfaces with an actual geometric void, never a solid disc.
  function ringSurface(build, inner, outer) {
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / SEGMENTS * TAU, u = (i+1) / SEGMENTS * TAU;
      build.quad(contour(...inner.slice(0,2),t,inner[2]), contour(...outer.slice(0,2),t,outer[2]),
        contour(...outer.slice(0,2),u,outer[2]), contour(...inner.slice(0,2),u,inner[2]));
    }
  }
  function wall(build, a, b, z0, z1) {
    for (let i=0; i<SEGMENTS; i++) {
      const t=i/SEGMENTS*TAU, u=(i+1)/SEGMENTS*TAU;
      build.quad(contour(a,b,t,z0),contour(a,b,u,z0),contour(a,b,u,z1),contour(a,b,t,z1));
    }
  }
  function instances(name, geometry, material, transforms, parent = group, colors = null) {
    geometries.add(geometry);
    const obj = new THREE.InstancedMesh(geometry, material, transforms.length);
    obj.name = name;
    transforms.forEach((m,i) => { obj.setMatrixAt(i,m); if (colors) obj.setColorAt(i, colors[i]); });
    obj.instanceMatrix.needsUpdate = true;
    if (obj.instanceColor) obj.instanceColor.needsUpdate = true;
    obj.computeBoundingBox(); obj.computeBoundingSphere(); obj.castShadow=true; obj.receiveShadow=true;
    parent.add(obj); return obj;
  }
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3();
  function boxMatrix(x,y,z,sx,sy,sz,angle=0) {
    return new THREE.Matrix4().compose(position.set(x,y,z), rotation.setFromAxisAngle(new THREE.Vector3(0,0,1),angle), scale.set(sx,sy,sz));
  }
  function beamMatrix(a,b,width) {
    return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()),
      new THREE.Vector3(width,a.distanceTo(b),width));
  }
  const box = new THREE.BoxGeometry(1,1,1); geometries.add(box);
  const foundation=builder();
  ringSurface(foundation,[59,39,0.2],[117.5,97.5,0.2]);
  mesh('entrance-plaza', foundation.geometry(), concrete);
  const apron=builder(); ringSurface(apron,[52.8,34.3,0.25],[65,45,0.25]);
  mesh('pitch-surround',apron.geometry(),mat(0x244e3d));
  const pitch=mesh('pitch',new THREE.PlaneGeometry(105,68),turf); pitch.position.z=0.3;
  const stripeTransforms=[];
  for (let i=0;i<10;i+=2) stripeTransforms.push(boxMatrix(-52.5+(i+0.5)*10.5,0,0.315,10.5,68,0.015));
  instances('mowing-stripes',box,mat(0x31954d),stripeTransforms);

  const markings=[];
  function line(a,b) { markings.push(...a,...b); }
  function fieldRect(x0,y0,x1,y1,z=0.345) {
    line([x0,y0,z],[x1,y0,z]); line([x1,y0,z],[x1,y1,z]);
    line([x1,y1,z],[x0,y1,z]); line([x0,y1,z],[x0,y0,z]);
  }
  function arc(cx,cy,r,start=0,end=TAU) {
    const n=Math.max(8,Math.ceil(Math.abs(end-start)*20));
    for(let i=0;i<n;i++) {
      const a=start+(end-start)*i/n,b=start+(end-start)*(i+1)/n;
      line([cx+r*Math.cos(a),cy+r*Math.sin(a),0.35],[cx+r*Math.cos(b),cy+r*Math.sin(b),0.35]);
    }
  }
  fieldRect(-52.5,-34,52.5,34); line([0,-34,0.35],[0,34,0.35]); arc(0,0,9.15);
  for (const s of [-1,1]) {
    fieldRect(Math.min(s*52.5,s*36),-20.16,Math.max(s*52.5,s*36),20.16);
    fieldRect(Math.min(s*52.5,s*47),-9.16,Math.max(s*52.5,s*47),9.16);
    arc(s*41.5,0,0.17); const theta=Math.acos(5.5/9.15);
    if(s===-1) arc(-41.5,0,9.15,-theta,theta); else arc(41.5,0,9.15,Math.PI-theta,Math.PI+theta);
    for(const sy of [-1,1]) {
      const start=s===1?(sy===1?Math.PI:Math.PI/2):(sy===1?-Math.PI/2:0);
      arc(s*52.5,sy*34,1,start,start+Math.PI/2);
    }
  }
  arc(0,0,0.16);
  function lines(name,vertices,color,parent=group,opacity=1) {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometries.add(geo);
    const material=new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}); materials.add(material);
    const obj=new THREE.LineSegments(geo,material);obj.name=name;parent.add(obj);return obj;
  }
  lines('regulation-field-markings',markings,0xffffff);
  // Physical-width boundary paint remains readable at map-scale (WebGL lines are 1 px).
  const paint=[];
  paint.push(boxMatrix(0,-34,0.34,105,0.12,0.02),boxMatrix(0,34,0.34,105,0.12,0.02));
  paint.push(boxMatrix(-52.5,0,0.34,0.12,68,0.02),boxMatrix(52.5,0,0.34,0.12,68,0.02),boxMatrix(0,0,0.34,0.12,68,0.02));
  instances('white-paint',box,white,paint);
  const posts=[],nets=[];
  const netLine=(a,b)=>nets.push(...a,...b);
  for(const s of [-1,1]) {
    const x=s*52.65, back=s*55.1;
    for(const y of [-3.66,3.66]) {
      posts.push(beamMatrix(new THREE.Vector3(x,y,0.35),new THREE.Vector3(x,y,2.79),0.12));
      posts.push(beamMatrix(new THREE.Vector3(x,y,2.79),new THREE.Vector3(back,y,2.5),0.07));
      for(let z=0.4;z<=2.6;z+=0.3) netLine([x,y,z],[back,y,Math.min(z,2.5)]);
      for(let k=0;k<=8;k++) {const xx=x+(back-x)*k/8;netLine([xx,y,0.35],[xx,y,2.79-0.29*k/8]);}
    }
    posts.push(beamMatrix(new THREE.Vector3(x,-3.66,2.79),new THREE.Vector3(x,3.66,2.79),0.12));
    for(let y=-3.66;y<=3.67;y+=0.3) {
      netLine([back,y,0.35],[back,y,2.5]);netLine([x,y,2.79],[back,y,2.5]);
    }
    for(let z=0.35;z<=2.51;z+=0.3) netLine([back,-3.66,z],[back,3.66,z]);
  }
  instances('goal-frames',box,white,posts); lines('goal-nets',nets,0xe8eee5,group,0.65);

  // Seat mosaic on the lower tier's north long side, readable from the opposite stand.
  const text=(o.seatText||'').split('').filter(ch=>GLYPHS[ch]);
  const cols=text.length*6-1,cellW=1.35,x0=-cols*cellW/2;
  function seatLetter(x,y,r,rows){
    if(!text.length||y<=0||Math.abs(x)>-x0)return false;
    const col=Math.floor((x-x0)/cellW),row=6-Math.floor((r-4)/2.4);
    if(col<0||col>=cols||row<0||row>6)return false;
    const g=GLYPHS[text[Math.floor(col/6)]],c=col%6;
    return c<5&&g[row][c]==='#';
  }
  let seatCount=0;
  const seatTransforms=[],seatColors=[];
  const seatBase=new THREE.BoxGeometry(0.47,0.43,0.12);seatBase.translate(0,0,0.24);
  const seatBack=new THREE.BoxGeometry(0.47,0.10,0.46);seatBack.translate(0,0.2,0.48);
  const seatGeo=mergeGeometries([seatBase,seatBack]);seatBase.dispose();seatBack.dispose();
  const redColor=new THREE.Color(o.seat),yellowColor=new THREE.Color(o.seatAccent);
  function tier(name,a,b,z,rows,run,rise,lower=false) {
    const build=builder();
    for(let r=0;r<rows;r++) {
      const ai=a+r*run,bi=b+r*run,zi=z+r*rise;
      ringSurface(build,[ai,bi,zi],[ai+run,bi+run,zi]);
      wall(build,ai+run,bi+run,zi,zi+rise);
      // Equal-ish arclength sampling, rather than uniform angles at square corners.
      const points=[];let total=0;const lengths=[0];
      for(let i=0;i<=768;i++) {
        points.push(contour(ai+run*.5,bi+run*.5,i/768*TAU,zi));
        if(i){total+=points[i].distanceTo(points[i-1]);lengths.push(total);}
      }
      const count=Math.floor(total/0.57);let segment=1;
      for(let j=0;j<count;j++) {
        const distance=(j+0.5)/count*total;
        while(lengths[segment]<distance)segment++;
        const fraction=(distance-lengths[segment-1])/(lengths[segment]-lengths[segment-1]);
        const p=points[segment-1].clone().lerp(points[segment],fraction);
        const t=(segment-1+fraction)/768*TAU;
        const sector=distance/total*32; // arclength-based: even aisles on squarer bowls
        if(Math.min(sector%1,1-sector%1)<0.055)continue; // 32 radial aisles.
        // Seat local +Y faces out, so its back is outward; local -Y faces pitch.
        const outward=new THREE.Vector3(p.x/(ai*ai),p.y/(bi*bi),0).normalize();
        const angle=Math.atan2(outward.y,outward.x)-Math.PI/2;
        seatTransforms.push(boxMatrix(p.x,p.y,zi+0.03,1,1,1,angle));
        const section=Math.floor(distance/total*16);
        seatColors.push(o.seatPattern?(((section+Math.floor(r/5))%4===0)?yellowColor:redColor):(lower&&seatLetter(p.x,p.y,r,rows)?yellowColor:redColor));seatCount++;
      }
    }
    mesh(name,build.geometry(),concrete);
  }
  tier('lower-tier',65,45,1.4,25,0.77,0.64,true);
  tier('upper-tier',87,67,22,27,0.77,0.66);
  instances('individual-red-yellow-seats',seatGeo,seatMaterial,seatTransforms,group,seatColors);
  const concourse=builder();ringSurface(concourse,[84.25,64.25,18.1],[89,69,18.1]);
  wall(concourse,85.5,65.5,18.1,21.8);mesh('mid-tier-concourse',concourse.geometry(),dark);
  const balcony=builder();wall(balcony,85.3,65.3,18.2,19.05);mesh('continuous-balcony-band',balcony.geometry(),o.led?mat(o.led,{emissive:o.led,emissiveIntensity:0.9,metalness:0}):red);
  if(o.led){const ribbon=builder();wall(ribbon,65.4,45.4,1.45,2.25);mesh('pitchside-led-ribbon',ribbon.geometry(),mat(o.led,{emissive:o.led,emissiveIntensity:0.7,metalness:0}));}
  const rim=builder();wall(rim,109,89,37,43.4);mesh('upper-bowl-back-wall',rim.geometry(),dark);

  // Exterior after the 2024 reference photo: dark banded cladding below, an open
  // white V-strut gallery carrying the lettering, and a curved light concrete band
  // under the dark cantilever roof. Proportions are estimated from the photo.
  const cladding=mat(o.cladding,{roughness:0.7,metalness:0.25});
  const facade=builder();wall(facade,113,93,4.5,24.5);mesh('dark-banded-cladding',facade.geometry(),cladding);
  const gallery=builder();wall(gallery,109.5,89.5,24.5,31.5);ringSurface(gallery,[109.5,89.5,24.5],[113.2,93.2,24.5]);
  mesh('recessed-strut-gallery',gallery.geometry(),dark);
  const band=builder();
  // Curved concrete band: leans outward toward the roof edge, with a soffit.
  for(let i=0;i<SEGMENTS;i++){
    const t=i/SEGMENTS*TAU,u=(i+1)/SEGMENTS*TAU;
    band.quad(contour(114,94,t,31.5),contour(114,94,u,31.5),contour(116.6,96.6,u,40.5),contour(116.6,96.6,t,40.5));
  }
  ringSurface(band,[109.5,89.5,31.5],[114,94,31.5]);
  wall(band,116.6,96.6,40.5,43.6);
  mesh('light-concrete-band',band.geometry(),mat(0xb9bcbc,{roughness:0.9,metalness:0}));
  const struts=[],strips=[],entrances=[],kiosks=[];
  const N=60;
  for(let i=0;i<N;i++){
    const t=(i+0.5)/N*TAU,foot=contour(113.4,93.4,t,24.6);
    // Each V: one foot on the cladding top, two arms to the band soffit.
    for(const d of [-0.42,0.42]){const top=contour(113.4,93.4,t+d/N*TAU,31.4);struts.push(beamMatrix(foot,top,0.55));}
  }
  // Horizontal light strips: broken runs at a few levels, as on the cladding.
  const STRIP_STEPS=180;
  for(const [k,z] of [[0,9.5],[1,13.5],[2,17.5],[3,21.5]].map(([k,z])=>[k,z])){
    for(let i=0;i<STRIP_STEPS;i++){
      if(((i*7+k*11)%13)<5)continue;
      const t=i/STRIP_STEPS*TAU,u=(i+1)/STRIP_STEPS*TAU,a=contour(113.25,93.25,t,z),b=contour(113.25,93.25,u,z);
      const mid=a.clone().lerp(b,0.5),angle=Math.atan2(b.y-a.y,b.x-a.x)-Math.PI/2;
      strips.push(boxMatrix(mid.x,mid.y,z,0.2,a.distanceTo(b)*0.96,0.45,angle));
    }
  }
  for(let i=0;i<48;i++){
    const t=i/48*TAU,q=contour(113.3,93.3,t,2.6),angle=Math.atan2(q.y/93.3**2,q.x/113.3**2);
    entrances.push(boxMatrix(q.x,q.y,2.6,0.5,7,4.2,angle));
    if(i%3===1){const k=contour(116.5,96.5,t+0.012,1.6);kiosks.push(boxMatrix(k.x,k.y,1.6,2.4,3.2,2.8,angle));}
  }
  instances('white-v-struts',box,white,struts);
  instances('cladding-light-strips',box,mat(0xd9dee0,{emissive:0x8a9296,emissiveIntensity:0.25,metalness:0}),strips);
  instances('ground-floor-gates',box,mat(0x1b2329,{roughness:0.35,metalness:0.4}),entrances);
  instances('plaza-kiosks',box,mat(0xffffff),kiosks,group,kiosks.map((_,i)=>i%2?redColor:yellowColor));
  // Two vertical club banners beside the main entrance on each long side.
  const bannerGeo=new THREE.PlaneGeometry(8.5,15);geometries.add(bannerGeo);
  const bannerMats=o.banners.map(([left,right,text])=>{
    const m=mat(0xffffff,{side:THREE.DoubleSide,metalness:0});
    if(typeof document!=='undefined'&&typeof document.createElement==='function'){
      const c=document.createElement('canvas');c.width=128;c.height=256;let g=null;try{g=c.getContext('2d');}catch{}
      if(g){g.fillStyle=left;g.fillRect(0,0,64,256);g.fillStyle=right;g.fillRect(64,0,64,256);
        g.fillStyle='#ffffff';g.beginPath();g.arc(64,118,34,0,TAU);g.fill();g.strokeStyle='#d8a520';g.lineWidth=6;g.stroke();
        g.fillStyle=o.bannerText;g.font='bold 30px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,64,120);
        const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;textures.add(tx);m.map=tx;}
    } else m.color.set(right);
    return m;
  });
  for(const s of [-1,1]){
    [[0.5,0],[11,1]].forEach(([x,k])=>{
      const b=mesh(`club-banner-${k?'25':'crest'}`,bannerGeo,bannerMats[k]);
      b.position.set(-s*x,s*(contour(113,93,Math.PI/2,0).y+0.3),15);b.rotation.x=Math.PI/2;
      if(s>0)b.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI));
    });
  }

  const roofGroup=new THREE.Group();roofGroup.name='roof';group.add(roofGroup);
  if(o.roofStyle==='rams') buildRamsRoof(); else {
  const canopy=builder();
  withExp(o.openingExponent??EXP,()=>{ringSurface(canopy,[81,59,44.1],[97,77,48]);wall(canopy,81,59,43.45,44.1);});
  ringSurface(canopy,[97,77,48],[117.5,97.5,44.5]);
  wall(canopy,117.5,97.5,43.6,44.5);
  const roofMaterial=mat(o.roofColor??0xc8ced2,{side:THREE.DoubleSide,roughness:0.62,metalness:0.18});
  mesh('silver-annular-canopy',canopy.geometry(),roofMaterial,roofGroup);
  const ribs=[],trusses=[],lightPositions=[];
  for(let i=0;i<64;i++) {
    const t=i/64*TAU;
    const a=withExp(o.openingExponent??EXP,()=>contour(81,59,t,44.32)),b=contour(97,77,t,48.24),c=contour(117.5,97.5,t,44.74);
    ribs.push(beamMatrix(a,b,0.24),beamMatrix(b,c,0.24));
    const low=contour(97,77,t,42.2),inside=withExp(o.openingExponent??EXP,()=>contour(81,59,t,43.3)),outside=contour(114,94,t,42.5);
    trusses.push(beamMatrix(inside,low,0.23),beamMatrix(low,outside,0.23),beamMatrix(low,b,0.23));
    if(i%2===0) {
      const p=withExp(o.openingExponent??EXP,()=>contour(81.4,59.4,t,43.3));lightPositions.push(boxMatrix(p.x,p.y,p.z,2.0,0.6,0.28,t));
    }
  }
  const roofSteel=o.roofSteel?mat(o.roofSteel,{metalness:0.15}):steel;
  instances('radial-canopy-standing-seams',box,roofSteel,ribs,roofGroup);
  instances('under-roof-trusses',box,roofSteel,trusses,roofGroup);
  const roofEdge=builder();withExp(o.openingExponent??EXP,()=>wall(roofEdge,81,59,42.2,44.4));mesh('inner-canopy-ring-beam',roofEdge.geometry(),roofSteel,roofGroup);
  if(o.solar&&o.roofStyle!=='rams'){
    // Four photovoltaic fields; light unpanelled strips at the corners and along the opening.
    const solar=builder(),N=SEGMENTS,lift=0.35;
    for(let i=0;i<N;i++){
      const t=i/N*TAU,u=(i+1)/N*TAU,q=contour(97,77,(t+u)/2,0);
      if(Math.abs(q.x)/97>0.78&&Math.abs(q.y)/77>0.72)continue; // light corner strips
      for(const [i0,i1] of [[[86,64,45.5],[97,77,48]],[[97,77,48],[112,92,46.2]]]){
        const A=i0,B=i1,P=(q,tt)=>{const v=contour(q[0],q[1],tt,q[2]+lift);return v;};
        solar.quad(P(A,t),P(B,t),P(B,u),P(A,u));
      }
    }
    mesh('solar-panel-fields',solar.geometry(),mat(0x1d2633,{side:THREE.DoubleSide,roughness:0.25,metalness:0.55}),roofGroup);
  }
  instances('floodlight-banks',box,mat(0xf5f3d7,{emissive:0xffe4ad,emissiveIntensity:0.35}),lightPositions,roofGroup);
  }
  // RAMS Park roof after aerial photos: flat white rounded-rectangle canopy, a
  // near-rectangular opening framed by a white truss box, four photovoltaic
  // fields split at the opening corners, a translucent far-side field and a
  // thick white fascia. Proportions are estimated from photos.
  function buildRamsRoof(){
    const outer=[contour(117.5,97.5,0,0).x,contour(117.5,97.5,Math.PI/2,0).y];
    const n=2/EXP, OX=o.roofOpeningHalf?.[0]??60, OY=o.roofOpeningHalf?.[1]??42;
    const inside=(x,y,shrink=0)=>(Math.abs(x)/(outer[0]-shrink))**n+(Math.abs(y)/(outer[1]-shrink))**n<=1;
    const zAt=(x,y)=>{const d=Math.max(Math.abs(x)/outer[0],Math.abs(y)/outer[1]);return 47.2-1.6*Math.max(0,d-0.5)/0.5;};
    const pos=[],col=[],C=(h)=>new THREE.Color(h),cell=2.4;
    const membrane=C(0xdfe4e6),white=C(0xf2f4f3),light=C(0xd9e2e8),pv=[C(0x1c2633),C(0x1f2a38),C(0x1a2430)];
    for(let x=-outer[0];x<outer[0];x+=cell)for(let y=-outer[1];y<outer[1];y+=cell){
      const cx=x+cell/2,cy=y+cell/2;
      if(Math.abs(cx)<OX+3&&Math.abs(cy)<OY+3)continue;            // opening + frame
      if(!inside(cx,cy,3))continue;                                // fascia ring covers the edge
      const ax=Math.abs(cx),ay=Math.abs(cy);
      let c;
      if(o.roofCladding==='membrane'){
        // White membrane bays between radial ribs (Saracoğlu): alternating light shades.
        const bay=Math.floor((Math.atan2(cy,cx)+Math.PI)/(TAU/56));
        c=bay%2?white:membrane;
      }
      else if(ax<OX+9&&ay<OY+9) c=white;                                // light band around the opening
      else if(!inside(cx,cy,9)) c=white;                           // white rim
      else if(Math.abs(ax-OX-3)<2.6&&ay>OY) c=white;               // strips from the opening corners
      else if(cy>OY&&ax<OX+3) c=light;                             // translucent far field
      else c=pv[(Math.floor((cx+500)/cell)+2*Math.floor((cy+500)/(cell*2)))%3];
      const q=[[x,y],[x+cell,y],[x+cell,y+cell],[x,y+cell]].map(([a,b])=>[a,b,zAt(a,b)]);
      for(const k of [0,1,2,0,2,3]){pos.push(...q[k]);col.push(c.r,c.g,c.b);}
    }
    const roofGeo=new THREE.BufferGeometry();
    roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    roofGeo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    roofGeo.computeVertexNormals();
    mesh('roof-photovoltaic-canopy',roofGeo,mat(0xffffff,{vertexColors:true,side:THREE.DoubleSide,roughness:0.45,metalness:0.25}),roofGroup);
    // Thick white fascia + edge ring hiding the cell grid's outer edge.
    const fascia=builder();
    for(let i=0;i<SEGMENTS;i++){
      const t=i/SEGMENTS*TAU,u=(i+1)/SEGMENTS*TAU;
      const a0=contour(105,85,t,0),a1=contour(105,85,u,0),b0=contour(117.5,97.5,t,0),b1=contour(117.5,97.5,u,0);
      const z=v=>zAt(v.x,v.y)+0.14; // smooth white rim drawn over the cell grid's stepped edge
      fascia.quad(new THREE.Vector3(a0.x,a0.y,z(a0)),new THREE.Vector3(b0.x,b0.y,z(b0)),new THREE.Vector3(b1.x,b1.y,z(b1)),new THREE.Vector3(a1.x,a1.y,z(a1)));
    }
    wall(fascia,117.5,97.5,40.2,45.7);
    ringSurface(fascia,[110,90,40.2],[117.5,97.5,40.2]);
    mesh('white-roof-fascia',fascia.geometry(),mat(o.roofColor??0xf1f3f2,{side:THREE.DoubleSide,roughness:0.5,metalness:0.1}),roofGroup);
    // White box-truss frame around the opening (top chord, bottom chord, diagonals).
    const frame=[],steelW=mat(o.roofSteel??0xf4f4f2,{metalness:0.15});
    const chord=(x0,y0,x1,y1)=>{for(const z of [47.6,43.2])frame.push(beamMatrix(new THREE.Vector3(x0,y0,z),new THREE.Vector3(x1,y1,z),0.9));};
    for(const s of [-1,1]){chord(-OX-3,s*(OY+3),OX+3,s*(OY+3));chord(s*(OX+3),-OY-3,s*(OX+3),OY+3);
      for(let k=0;k<=24;k++){const x=-OX-3+k*(2*OX+6)/24,x2=-OX-3+(k+1)*(2*OX+6)/24;if(k<24)frame.push(beamMatrix(new THREE.Vector3(x,s*(OY+3),43.2),new THREE.Vector3(x2,s*(OY+3),47.6),0.45));frame.push(beamMatrix(new THREE.Vector3(x,s*(OY+3),43.2),new THREE.Vector3(x,s*(OY+3),47.6),0.4));}
      for(let k=0;k<=16;k++){const y=-OY-3+k*(2*OY+6)/16,y2=-OY-3+(k+1)*(2*OY+6)/16;if(k<16)frame.push(beamMatrix(new THREE.Vector3(s*(OX+3),y,43.2),new THREE.Vector3(s*(OX+3),y2,47.6),0.45));frame.push(beamMatrix(new THREE.Vector3(s*(OX+3),y,43.2),new THREE.Vector3(s*(OX+3),y,47.6),0.4));}
    }
    if(o.roofCladding==='membrane'){
      // Raised white ribs on top of the canopy, frame -> fascia, as in the aerial photo.
      for(let i=0;i<56;i++){
        const t=i/56*TAU-Math.PI,c=Math.cos(t),sn=Math.sin(t);
        const k=Math.min((OX+3)/Math.abs(c||1e-6),(OY+3)/Math.abs(sn||1e-6));
        const a=new THREE.Vector3(c*k,sn*k,0),b=contour(110,90,Math.atan2(sn,c),0);
        a.z=zAt(a.x,a.y)+0.6;b.z=zAt(b.x,b.y)+0.6;frame.push(beamMatrix(a,b,0.7));
      }
    }
    // Radial trusses under the canopy, from the frame to the facade.
    const lights=[];
    for(let i=0;i<64;i++){
      const t=i/64*TAU,c=Math.cos(t),sn=Math.sin(t);
      const k=Math.min((OX+3)/Math.abs(c||1e-6),(OY+3)/Math.abs(sn||1e-6));
      const inner=new THREE.Vector3(c*k,sn*k,43.2),outerP=contour(114,94,t,40.5),mid=inner.clone().lerp(outerP,0.5);mid.z=40;
      frame.push(beamMatrix(inner,mid,0.35),beamMatrix(mid,outerP,0.35),beamMatrix(mid,new THREE.Vector3(mid.x,mid.y,zAt(mid.x,mid.y)-0.2),0.3));
      if(i%2===0)lights.push(boxMatrix(inner.x*0.99,inner.y*0.99,42.6,2.0,0.6,0.28,t));
    }
    instances('white-opening-truss-frame',box,steelW,frame,roofGroup);
    instances('floodlight-banks',box,mat(0xf5f3d7,{emissive:0xffe4ad,emissiveIntensity:0.35}),lights,roofGroup);
  }
  if(o.cornerScreens){
    const screens=[];for(const sx of [-1,1])for(const sy of [-1,1])screens.push(boxMatrix(sx*70,sy*48,36,9,0.8,5.2,Math.atan2(sy,sx)+Math.PI/2));
    instances('corner-video-screens',box,mat(0x2a0a12,{emissive:0xff2a55,emissiveIntensity:0.55}),screens,roofGroup);
  }

  // A pair of black scoreboards and red technical benches add pitch-scale landmarks.
  const boards=[],benches=[];
  for(const s of [-1,1]) {
    boards.push(boxMatrix(s*87,0,30.5,0.6,12,5.5));
    benches.push(boxMatrix(s*15,-40,1.5,12,2.2,2.4));
  }
  instances('scoreboards',box,dark,boards);instances('team-dugouts',box,red,benches);

  // Optional DOM-only typography. Geometry and tests remain fully usable in Node.
  if(typeof document!=='undefined' && typeof document.createElement==='function') {
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=256;
    let ctx=null;try {ctx=canvas.getContext('2d');} catch { /* CPU/DOM emulation */ }
    if(ctx) {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='bold 150px Arial, sans-serif';ctx.fillText(o.sign,1024,132);
      for(const x of [560,1488]){ctx.beginPath();ctx.arc(x,132,62,0,TAU);ctx.fillStyle='#ffffff';ctx.fill();ctx.beginPath();ctx.arc(x,132,48,0,TAU);ctx.fillStyle=o.badge[0];ctx.fill();ctx.fillStyle=o.badge[1];ctx.font='bold 44px Arial, sans-serif';ctx.fillText(o.badge[2],x,134);ctx.fillStyle='#ffffff';ctx.font='bold 150px Arial, sans-serif';}
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=4;textures.add(texture);
      const signMaterial=mat(0xffffff,{map:texture,side:THREE.DoubleSide,metalness:0,transparent:true,alphaTest:0.1});
      const signGeo=new THREE.PlaneGeometry(40,5);geometries.add(signGeo);
      for(const s of [-1,1]) {
        const sign=mesh('RAMS-PARK-GALATASARAY-sign',signGeo,signMaterial);
        sign.position.set(0,s*(contour(113.4,93.4,Math.PI/2,0).y+1.1),28);
        // Local +Y is world +Z on both sides: lettering never appears upside down.
        sign.rotation.x=Math.PI/2;
        if(s>0)sign.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI));
      }
    }
  }
  group.updateMatrixWorld(true);
  // Keep root identity for geolocation. Lift pitch to ~1 m and fit the 51 m
  // OSM envelope using child transforms, leaving X/Y field dimensions untouched.
  const rawBounds = new THREE.Box3().setFromObject(group);
  const verticalScale = (o.height - 0.7) / rawBounds.max.z;
  for (const child of group.children) {
    child.scale.z *= verticalScale;
    child.position.z = child.position.z * verticalScale + 0.7;
  }
  pitch.position.z = 1;
  group.updateMatrixWorld(true);
  let drawCalls=0,triangles=0;
  group.traverse(o=>{
    if(o.isMesh||o.isLine)drawCalls++;
    if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}
  });
  const stats={seatCount,drawCalls,triangles,footprint:o.footprint,height:o.height,pitch:[105,68],
    geometryCount:geometries.size,materialCount:materials.size,textureCount:textures.size,
    dimensionsAreArtisticEstimates:true};
  let disposed=false;
  return {group,stats,setRoofVisible(visible){roofGroup.visible=Boolean(visible);},dispose(){
    if(disposed)return;disposed=true;
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    for(const texture of textures)texture.dispose();
    group.traverse(object=>{if(object.isInstancedMesh)object.dispose();});
    group.removeFromParent();group.clear();
  }};
}
