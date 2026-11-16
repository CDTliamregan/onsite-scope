// Onsite Scope: phone waveform, vectorscope, RGB parade and histogram for IMAG, LED walls and camera checks.
// The page is index.html; styles are in tool.css; the palette and header come from ../../shared/.
//
// Brought in from the "Onsite Scope" Claude artifact (version of Nov 16, 2026). Changed on the way in:
// fonts are the site's own (the site does not load Google Fonts), the offline service worker line is gone
// (there is no sw.js), and the picture-box and tap marks use Creative Day blue. The math is untouched.

(() => {
'use strict';
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
const KR = 0.2126, KG = 0.7152, KB = 0.0722;
const AW = 360;                 // analysis width in px
const WCMAX = 180, WR = 240;    // waveform density grid (max cols x rows), rows span -10..110 %
const VN = 140;                 // vectorscope density grid
const HB = 240;                 // histogram bins over -10..110 %
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const fmt = (n, d=1) => (n == null || !isFinite(n)) ? '–' : n.toFixed(d);
const fmtS = (n, d=1) => { if (n == null || !isFinite(n)) return '–'; const a = Math.abs(n).toFixed(d); return (+a === 0 ? '' : n > 0 ? '+' : '−') + a; };

/* ---------------- reference data ---------------- */
const PATTERNS = {
  onsite11: {name:'Onsite Scope pattern, 11 steps', levels:[0,10,20,30,40,50,60,70,80,90,100]},
  five:     {name:'Gray pattern, 5 steps', levels:[0,25,50,75,100]},
  wb:       {name:'White and black fields', levels:[100,0]},
  custom:   {name:'Custom levels', levels:null}
};
const CHARTS = {
  calibrite_video: {name:'Calibrite ColorChecker Video', note:'Large center chips. Ranges from the Calibrite ColorChecker Video guide.',
    patches:[{name:'White chip',lo:90,hi:100},{name:'Light gray chip',lo:40,hi:50},{name:'Dark gray chip',lo:20,hi:30},{name:'Black chip',lo:0,hi:10}]},
  spyder_video: {name:'Datacolor Spyder Checkr Video', note:'Large bars on the gray scale card. Ranges from the Datacolor quick start guide.',
    patches:[{name:'White bar',lo:95,hi:98},{name:'50% gray bar',lo:48,hi:52},{name:'Black bar',lo:5,hi:8}]},
  dsc_cdm: {name:'DSC Labs ChromaDuMonde / CamAlign', note:"DSC's instructions set the white chip to 100% (700 mV) with the knee off; many live shaders hold it nearer 90 to stay under the knee. The steps in between are specific to each chart, so enter the values printed with yours under Custom chart.",
    patches:[{name:'White chip',lo:90,hi:100},{name:'True black chip',lo:0,hi:3}]},
  dsc_oneshot: {name:'DSC Labs OneShot', note:"18% gray at about 40%, per the chart's designer. The 90% white chip then works out to about 93 to 95% through a standard Rec.709 camera curve with the knee off, lower with the knee on.",
    patches:[{name:'90% white chip',lo:88,hi:98},{name:'18% gray chip',lo:38,hi:45},{name:'Black chip',lo:0,hi:3}]},
  cc_classic: {name:'ColorChecker Classic, 24 patch', note:'A photo chart. Targets are the published patch reflectances put through the Rec.709 camera curve (white at 95%), plus or minus 4. Its color patches do not line up with vectorscope targets.',
    patches:[[95,'White (19)'],[77,'Neutral 8 (20)'],[60,'Neutral 6.5 (21)'],[43,'Neutral 5 (22)'],[27,'Neutral 3.5 (23)'],[13,'Black (24)']].map(([v,n])=>({name:n, lo:v-4, hi:v+4}))},
  graycard: {name:'18% gray card and white card', note:'18% gray is 41% through the Rec.709 camera curve and is commonly placed at 40 to 45%. A 90% white card then lands at about 93 to 95% with the knee off.',
    patches:[{name:'White card',lo:88,hi:98},{name:'18% gray card',lo:38,hi:45}]},
  custom: {name:'Custom chart', note:'Enter patches as name, low, high, separated by semicolons. Example: White 90 100; Gray 40 50; Black 0 10', patches:null}
};
const DEFAULT_TARGETS = {skinLo:30, skinHi:75, skinMargin:5, skinHue:123, hueTol:10, hueWarn:20,
  neutralWarn:3, neutralFail:6, levelMargin:5, uniWarn:3, uniFail:6, bandWarn:1.5,
  clipWarn:1, clipFail:5, crushWarn:5, crushFail:15, hotWarn:2, hotFail:15, matchWarn:3, matchFail:6};
// Where skin sits on a waveform when it is exposed well. Light: about 70, range 55 to 75. Deep: 30 to 55. Medium between.
const SKIN_RANGES = {any:[30,75], light:[55,75], medium:[45,65], deep:[30,55]};
const TARGET_FIELDS = [
  ['skinLo','Skin level passes from','%'],['skinHi','Skin level passes to','%'],['skinMargin','Skin level warn margin','pts'],
  ['skinHue','Skin tone line angle','°'],['hueTol','Skin hue passes within ±','°'],['hueWarn','Skin hue warns within ±','°'],
  ['neutralWarn','Gray balance warns at','pts'],['neutralFail','Gray balance fails at','pts'],['levelMargin','Chip level warn margin','pts'],
  ['uniWarn','Wall tilt warns at','%'],['uniFail','Wall tilt fails at','%'],['bandWarn','Banding warns at','pts'],
  ['clipWarn','Clipped area warns at','%'],['clipFail','Clipped area fails at','%'],['crushWarn','Crushed area warns at','%'],['crushFail','Crushed area fails at','%'],
  ['hotWarn','Gamut-edge area warns at','%'],['hotFail','Gamut-edge area fails at','%']
];
const MODE_HINTS = {
  shading: 'Frame the chip chart on IMAG and run step 2. Box a face as well to add skin checks. Shade and match cameras on the hardware scope at the CCU.',
  wall: 'Put a full white or gray field on the wall and box the area to check. Shoot square-on.',
  content: 'Box the screen area. Checks clipped highlights, crushed blacks and colors at the gamut edge.',
  lighting: "Box the presenter's cheek and forehead on IMAG, not hair or background."
};

/* ---------------- state ---------------- */
const STORE_KEY = 'onsiteScope.v3';
function loadSaved(){ try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch(e){ return {}; } }
// Only numbers reach the targets, whatever a saved or imported file holds.
function cleanTargets(t){
  const out = {...DEFAULT_TARGETS};
  if (t && typeof t === 'object') for (const k of Object.keys(DEFAULT_TARGETS)){ const v = t[k]; if ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && isFinite(Number(v))) out[k] = Number(v); }
  return out;
}
function cleanSettings(d){
  const o = {};
  if (!d || typeof d !== 'object') return o;
  if (['shading','wall','content','lighting'].includes(d.mode)) o.mode = d.mode;
  if ([1,4,8,16,32].includes(d.avgN)) o.avgN = d.avgN;
  if (['quad','wave','parade','vector','hist'].includes(d.layout)) o.layout = d.layout;
  if ([1,2].includes(d.vecGain)) o.vecGain = d.vecGain;
  if ([75,100].includes(d.barLevel)) o.barLevel = d.barLevel;
  if (typeof d.skinTone === 'string' && SKIN_RANGES[d.skinTone]) o.skinTone = d.skinTone;
  if (typeof d.patternId === 'string' && PATTERNS[d.patternId]) o.patternId = d.patternId;
  if (typeof d.chartId === 'string' && CHARTS[d.chartId]) o.chartId = d.chartId;
  for (const k of ['customPattern','customChart','showName','sourceLabel','deviceId']) if (typeof d[k] === 'string') o[k] = d[k].slice(0, 400);
  if (typeof d.calApply === 'boolean') o.calApply = d.calApply;
  return o;
}
const saved = loadSaved();
const S = {
  mode:'lighting', avgN:8, layout:'quad', vecGain:1, barLevel:75, skinTone:'any',
  roi:{x:0,y:0,w:1,h:1},
  patternId:'onsite11', customPattern:'0, 50, 100', calApply:true,
  chartId:'calibrite_video', customChart:'White 90 100; Gray 40 50; Black 0 10',
  showName:'', sourceLabel:'', deviceId:'',
  ...cleanSettings(saved),
  targets: cleanTargets(saved.targets),
  // Calibration, color bars and chip taps belong to one picture or one locked live session, so they are never saved.
  cal:[], color:[], taps:[],
  A:null
};
function save(){
  try {
    const {mode,avgN,layout,vecGain,barLevel,skinTone,patternId,customPattern,calApply,chartId,customChart,showName,sourceLabel,deviceId,targets} = S;
    localStorage.setItem(STORE_KEY, JSON.stringify({mode,avgN,layout,vecGain,barLevel,skinTone,patternId,customPattern,calApply,chartId,customChart,showName,sourceLabel,deviceId,targets}));
  } catch(e){}
}

let source = 'sample';          // sample | photo | live
let frozen = false;
let frame = null;               // {w,h,data:Float32Array raw codes 0..255}
// sessionId: one exposure regime (a still picture, or a live run with unchanged lock). Calibration and taps are valid only inside it.
// picId: one frozen picture. Tap markers are drawn only on the picture they were tapped on.
let sessionN = 0, sessionId = '', picId = '', expLocked = false;
let frameFresh = true, lastFrameAt = 0, useRvfc = false, frameTok = 0;
let liveFrames = 0;
function newPic(){ picId = `p${++sessionN}-${Date.now()}`; }
function newSession(){ sessionId = `s${++sessionN}-${Date.now()}`; newPic(); }
let displaySrc = null;          // canvas or video
let stream = null, track = null, wakeLock = null;
let acc = null, lastAnalyze = 0, rafId = 0;
let lut = null;
let M = null;
let tapMode = null;             // {kind:'cal'|'chart', items:[...], i, added:[]}
let drag = null, draftRoi = null;
const diag = {env:{}, camera:{}, lock:{}, perf:{}};
const videoEl = $('#video');
const viewC = $('#view');

/* ---------------- color helpers ---------------- */
const BARS75 = (() => {
  const defs = [['MG',75,0,75],['R',75,0,0],['YL',75,75,0],['G',0,75,0],['CY',0,75,75],['B',0,0,75]];
  return defs.map(([n,r,g,b]) => { const y=KR*r+KG*g+KB*b; const cb=(b-y)/1.8556, cr=(r-y)/1.5748; return {n, cb, cr, a:(Math.atan2(cr,cb)*180/Math.PI+360)%360, rgb:[r,g,b]}; })
    .sort((p,q)=>p.a-q.a);
})();
const HEXR = (() => { // radius of the 75% bars hexagon at each whole degree
  const out = new Float32Array(360);
  for (let d=0; d<360; d++){
    const a = d*Math.PI/180, dx=Math.cos(a), dy=Math.sin(a);
    let best = Infinity;
    for (let k=0;k<6;k++){
      const P=BARS75[k], Q=BARS75[(k+1)%6];
      const ex=Q.cb-P.cb, ey=Q.cr-P.cr;
      const den = dx*ey - dy*ex; if (Math.abs(den)<1e-9) continue;
      const t = (P.cb*ey - P.cr*ex)/den, u = (P.cb*dy - P.cr*dx)/den;
      if (t>0 && u>=-1e-6 && u<=1+1e-6) best = Math.min(best, t);
    }
    out[d] = best;
  }
  return out;
})();
const hexAt = ang => HEXR[((Math.round(ang)%360)+360)%360];
function lvlToRow(L){ return clamp(Math.round((110 - L) * (WR-1) / 120), 0, WR-1); }
function lvlToBin(L){ return clamp(Math.floor((L + 10) / 120 * HB), 0, HB-1); }

/* ---------------- calibration curve ---------------- */
function patternLevels(){
  if (S.patternId === 'custom') return S.customPattern.split(/[,;\s]+/).map(Number).filter(v=>isFinite(v) && v>=-5 && v<=110);
  return PATTERNS[S.patternId].levels;
}
function chartPatches(){
  if (S.chartId !== 'custom') return CHARTS[S.chartId].patches;
  return S.customChart.split(';').map(s=>s.trim()).filter(Boolean).map(s=>{
    const m = s.match(/^(.*?)\s+(-?[\d.]+)\s+(-?[\d.]+)$/); if (!m) return null;
    return {name:m[1].trim()||'Patch', lo:+m[2], hi:+m[3]};
  }).filter(Boolean);
}
function curves(){
  if (!S.calApply || S.cal.filter(p=>!p.clipped).length < 2) return null;
  const out = [];
  for (let ch=0; ch<3; ch++){
    const pts = S.cal.filter(p=>!p.clipped).map(p=>({m:p.raw[ch]/2.55, t:p.target})).sort((a,b)=>a.m-b.m);   // a clipped step would bend the curve
    const mono = [];
    for (const p of pts){ const last = mono[mono.length-1]; if (!last || (p.m > last.m + 0.4 && p.t > last.t)) mono.push(p); }
    if (mono.length < 2) return null;
    out.push(mono);
  }
  return out;
}
let CURVES = null, CMAT = null, CFIT = null;
// True when a tap or hold was made on the still picture now on screen (a photo, or the current frozen frame).
function samePicture(p){ return (source !== 'live' || frozen) && p.pic === picId; }
function calActive(){ return !!CURVES; }
function colorActive(){ return !!CMAT; }
// 'ok' | 'other' (tapped on another picture or exposure) | 'unlocked' (live, exposure free to drift) | 'none'
function calValidity(){
  if (!CURVES && !CMAT) return 'none';
  const pts = [...(CURVES ? S.cal : []), ...(CMAT ? S.color : [])];
  if (pts.every(samePicture)) return 'ok';          // tapped on the very picture being read: nothing can have drifted
  if (pts.some(p => p.session !== sessionId)) return 'other';
  if (source === 'live' && !expLocked) return 'unlocked';
  return 'ok';
}
const BAR_DEFS = [['yellow',1,1,0],['cyan',0,1,1],['green',0,1,0],['magenta',1,0,1],['red',1,0,0],['blue',0,0,1]];
// Neutral-preserving 3x3: each output channel is itself plus a mix of its differences from the other two, least squares over the tapped bars.
function colorMatrix(){
  const bars = S.color.filter(p=>!p.clipped);          // a clipped bar would skew the fit
  if (!S.calApply || bars.length < 3) return null;
  const tone = p => [applyCurve(0,p.raw[0]), applyCurve(1,p.raw[1]), applyCurve(2,p.raw[2])];
  const M3 = [];
  for (let c=0; c<3; c++){
    const x = (c+1)%3, y = (c+2)%3;
    let sxx=0, sxy=0, syy=0, sxe=0, sye=0;
    for (const p of bars){
      const v = tone(p);
      const dx = v[x]-v[c], dy = v[y]-v[c], e = p.target[c]-v[c];
      sxx+=dx*dx; sxy+=dx*dy; syy+=dy*dy; sxe+=dx*e; sye+=dy*e;
    }
    const ridge = 1e-4*(sxx+syy); sxx+=ridge; syy+=ridge;
    const det = sxx*syy - sxy*sxy; if (Math.abs(det) < 1e-6) return null;
    const a = (sxe*syy - sye*sxy)/det, b = (sye*sxx - sxe*sxy)/det;
    if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 1.5 || Math.abs(b) > 1.5) return null;
    const row = [0,0,0]; row[c] = 1-a-b; row[x] = a; row[y] = b; M3.push(row);
  }
  // How well the bars land on their targets after correction, in level points.
  let ss = 0;
  for (const p of bars){ const v = tone(p); for (let c=0;c<3;c++){ const o = M3[c][0]*v[0]+M3[c][1]*v[1]+M3[c][2]*v[2]; ss += (o-p.target[c])**2; } }
  return {m:M3, rms:Math.sqrt(ss/(bars.length*3)), n:bars.length};
}
function applyCurve(ch, code){
  const m = code/2.55;
  if (!CURVES) return m;
  const p = CURVES[ch], n = p.length;
  let i = 0;
  if (m <= p[0].m) i = 0; else if (m >= p[n-1].m) i = n-2; else { while (i < n-2 && m > p[i+1].m) i++; }
  const a = p[i], b = p[i+1];
  return clamp(a.t + (m - a.m) * (b.t - a.t) / (b.m - a.m), -20, 130);
}
function rebuildLut(){
  CURVES = curves();
  CMAT = null; CFIT = colorMatrix(); CMAT = CFIT ? CFIT.m : null;
  lut = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  for (let ch=0; ch<3; ch++) for (let v=0; v<256; v++) lut[ch][v] = applyCurve(ch, v);
}
function corrected(raw){
  let R=applyCurve(0,raw[0]), G=applyCurve(1,raw[1]), B=applyCurve(2,raw[2]);
  if (CMAT){ const m=CMAT, r=R, g=G, b=B; R=m[0][0]*r+m[0][1]*g+m[0][2]*b; G=m[1][0]*r+m[1][1]*g+m[1][2]*b; B=m[2][0]*r+m[2][1]*g+m[2][2]*b; }
  return {R,G,B,Y:KR*R+KG*G+KB*B};
}

/* ---------------- frames ---------------- */
const anaC = document.createElement('canvas');
const anaX = anaC.getContext('2d', {willReadFrequently:true});
function grab(src, sw, sh){
  const w = AW, h = Math.max(2, Math.round(AW * sh / sw));
  if (anaC.width !== w || anaC.height !== h){ anaC.width = w; anaC.height = h; }
  anaX.imageSmoothingEnabled = true; anaX.imageSmoothingQuality = 'high';
  anaX.drawImage(src, 0, 0, w, h);
  const px = anaX.getImageData(0, 0, w, h).data;
  return {w, h, px};
}
function setStill(canvas, kind){
  stopLive();
  source = kind; frozen = false; newSession();
  S.roi = {x:0,y:0,w:1,h:1};
  displaySrc = canvas;
  const g = grab(canvas, canvas.width, canvas.height);
  const data = new Float32Array(g.w*g.h*3);
  for (let i=0, j=0; i<g.px.length; i+=4, j+=3){ data[j]=g.px[i]; data[j+1]=g.px[i+1]; data[j+2]=g.px[i+2]; }
  frame = {w:g.w, h:g.h, data};
  setAspect(canvas.width, canvas.height);
  updateSourceUi();
  refresh();
}
function setAspect(w, h){
  const v = $('#viewer');
  v.style.aspectRatio = `${w} / ${h}`;
}
function imageToCanvas(img){
  const max = 1600, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth*s); c.height = Math.round(img.naturalHeight*s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function loadFile(file){
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { const c = imageToCanvas(img); URL.revokeObjectURL(url); setStill(c, 'photo'); toast('Photo loaded, analyzing the full frame. Drag to box an area.'); };
  img.onerror = () => { URL.revokeObjectURL(url); toast("That file couldn't be read as an image. Try a JPEG or PNG."); };
  img.src = url;
}

/* ---------------- sample frame ---------------- */
function makeSample(){
  const W=1280, H=720, c=document.createElement('canvas'); c.width=W; c.height=H;
  const x=c.getContext('2d');
  x.fillStyle='#08080a'; x.fillRect(0,0,W,H);
  // IMAG screen
  x.fillStyle='rgb(46,52,62)'; x.fillRect(70,50,1140,620);
  // chart card
  x.fillStyle='rgb(112,112,114)'; x.fillRect(110,110,470,500);
  const chips=[[250,246,244],[120,118,117],[67,66,66],[16,15,17]];
  chips.forEach((rgb,i)=>{ x.fillStyle=`rgb(${rgb})`; x.fillRect(140+(i%2)*215,140+Math.floor(i/2)*170,195,150); });
  const hues=[[180,68,64],[184,170,70],[72,150,82],[70,152,160],[78,86,168],[170,78,150]];
  hues.forEach((rgb,i)=>{ x.fillStyle=`rgb(${rgb})`; x.fillRect(140+i*70,500,58,80); });
  // presenter
  const bg=x.createLinearGradient(640,60,640,660); bg.addColorStop(0,'rgb(30,48,92)'); bg.addColorStop(1,'rgb(18,26,52)');
  x.fillStyle=bg; x.fillRect(640,60,560,600);
  x.fillStyle='rgb(30,30,34)'; x.beginPath(); x.ellipse(915,640,210,150,0,Math.PI,0); x.fill();
  x.fillStyle='rgb(52,36,28)'; x.beginPath(); x.ellipse(915,250,118,140,0,0,Math.PI*2); x.fill();
  const face=x.createRadialGradient(895,320,10,915,340,150);
  face.addColorStop(0,'rgb(236,186,128)'); face.addColorStop(.6,'rgb(214,160,104)'); face.addColorStop(1,'rgb(150,104,70)');
  x.fillStyle=face; x.beginPath(); x.ellipse(915,335,105,135,0,0,Math.PI*2); x.fill();
  x.fillStyle='rgb(255,252,246)'; x.beginPath(); x.ellipse(890,262,9,5,-.3,0,Math.PI*2); x.fill();
  // camera noise
  const id=x.getImageData(0,0,W,H), d=id.data; let s=7;
  for (let i=0;i<d.length;i+=4){ s=(s*16807)%2147483647; const n=(s/2147483647-0.5)*5; d[i]=clamp(d[i]+n,0,255); d[i+1]=clamp(d[i+1]+n,0,255); d[i+2]=clamp(d[i+2]+n,0,255); }
  x.putImageData(id,0,0);
  return c;
}
function loadSample(){
  const c = makeSample();
  setStill(c, 'sample');
  S.roi = {x:0.668, y:0.36, w:0.105, h:0.2};
  refresh();
}

/* ---------------- live camera ---------------- */
async function startLive(o = {}){
  diag.env.cameraApi = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!diag.env.cameraApi){ toast(IN_CLAUDE ? 'Live camera is not available inside Claude. Use Take photo here, or open the hosted copy for live mode.' : 'This browser has no camera access. It needs HTTPS and Safari or Chrome.'); renderDiag(); return; }
  stopLive();
  const base = {width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:30}};
  const video = S.deviceId ? {...base, deviceId:{exact:S.deviceId}} : {...base, facingMode:{ideal:'environment'}};
  try {
    stream = await navigator.mediaDevices.getUserMedia({video, audio:false});
  } catch(e){
    // A saved or pinned lens can be refused (lens IDs change between visits). Drop it and retry on the default camera.
    // Pinning is still allowed after a stale saved ID; two refusals at most, so this cannot loop.
    if (S.deviceId && (o.fails||0) < 2){ S.deviceId=''; save(); return startLive({...o, fails:(o.fails||0)+1}); }
    diag.camera.error = `${e.name}: ${e.message}`; renderDiag();
    toast(IN_CLAUDE ? 'Live camera is blocked inside Claude. Use Take photo here, or open the hosted copy for live mode.' : (e.name==='NotAllowedError' ? 'Camera permission was denied. Allow it in Settings > Safari > Camera, then try again.' : "The camera couldn't start: " + e.message));
    return;
  }
  track = stream.getVideoTracks()[0];
  videoEl.srcObject = stream;
  try { await videoEl.play(); } catch(e){}
  await listLenses();
  // Pin the plain wide lens if the browser picked a multi-camera device that switches lenses on its own.
  if (!S.deviceId && !o.pinTried){
    const opts = [...$('#lensSel').options];
    const wide = opts.find(op => /^back camera$/i.test(op.textContent.trim()));
    const cur = track.getSettings().deviceId;
    if (wide && wide.value !== cur){ S.deviceId = wide.value; save(); return startLive({...o, pinTried:true}); }
  }
  source = 'live'; frozen = false; acc = null; expLocked = false; newSession();
  S.roi = {x:0,y:0,w:1,h:1};
  displaySrc = videoEl;
  armFrameWatch();
  readCamera(); setupExposure();
  try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); diag.env.wakeLock = 'granted'; } else diag.env.wakeLock = 'not offered'; } catch(e){ diag.env.wakeLock = 'refused: ' + e.name; }
  updateSourceUi();
  cancelAnimationFrame(rafId); rafId = requestAnimationFrame(liveTick);
  if (/dual|triple/i.test(track.label || '')) toast('This lens can switch on its own mid-reading. Pick Back Camera under Lens.');
}
// Tells liveTick when the camera has delivered a new frame, so each frame is averaged once.
// Uses the browser's per-frame callback; without it (or if it goes quiet) every tick is processed.
function armFrameWatch(){
  const tok = ++frameTok;
  useRvfc = typeof videoEl.requestVideoFrameCallback === 'function';
  frameFresh = true; lastFrameAt = performance.now();
  diag.perf.frameSignal = useRvfc ? 'per camera frame' : 'timer';
  if (!useRvfc) return;
  const cb = () => { if (tok !== frameTok) return; frameFresh = true; lastFrameAt = performance.now(); videoEl.requestVideoFrameCallback(cb); };
  videoEl.requestVideoFrameCallback(cb);
}
function setupExposure(){
  const sl = $('#expSl'), lab = $('#expLab'); let c = null;
  try { c = track && track.getCapabilities ? track.getCapabilities().exposureCompensation : null; } catch(e){}
  const ok = !!c && typeof c.min === 'number' && typeof c.max === 'number' && c.max > c.min;
  sl.hidden = lab.hidden = !ok;
  if (!ok) return;
  sl.min = c.min; sl.max = c.max; sl.step = c.step || 0.1;
  const cur = track.getSettings().exposureCompensation; sl.value = typeof cur === 'number' ? cur : 0;
}
function stopLive(){
  cancelAnimationFrame(rafId);
  if (stream){ stream.getTracks().forEach(t=>t.stop()); }
  stream = null; track = null;
  if (wakeLock){ wakeLock.release().catch(()=>{}); wakeLock = null; }
  expLocked = false; frameTok++;
  $('#expSl').hidden = $('#expLab').hidden = true;
  $('#btnLock').setAttribute('aria-pressed','false');
}
async function listLenses(){
  const sel = $('#lensSel');
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    const cur = track ? track.getSettings().deviceId : '';
    sel.innerHTML = '';
    devs.forEach((d,i)=>{ const o=document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||`Camera ${i+1}`; if (d.deviceId===cur) o.selected=true; sel.appendChild(o); });
    diag.camera.devices = devs.map(d=>d.label||'(no label)');
  } catch(e){ diag.camera.devices = 'unavailable'; }
}
function readCamera(){
  if (!track) return;
  const st = track.getSettings ? track.getSettings() : {};
  let caps = {};
  try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch(e){ caps = {error:String(e)}; }
  diag.camera.label = track.label;
  diag.camera.settings = st;
  const keys = ['exposureMode','exposureCompensation','exposureTime','iso','whiteBalanceMode','colorTemperature','focusMode','focusDistance','zoom','torch','frameRate','width','height'];
  diag.camera.capabilities = Object.fromEntries(keys.map(k=>[k, caps[k] === undefined ? 'not offered' : caps[k]]));
  renderDiag();
}
async function toggleLock(){
  if (!track){ toast('Start the live camera first.'); return; }
  const btn = $('#btnLock'); const locking = btn.getAttribute('aria-pressed') !== 'true';
  let caps = {}; try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch(e){}
  const want = locking ? 'manual' : 'continuous';
  const results = {};
  for (const k of ['exposureMode','whiteBalanceMode','focusMode']){
    const offered = Array.isArray(caps[k]) ? caps[k] : null;
    if (!offered){ results[k] = 'not offered by this browser'; continue; }
    const mode = offered.includes(want) ? want : (locking && offered.includes('none') ? 'none' : null);
    if (!mode){ results[k] = `no ${want} mode (offers ${offered.join(', ')})`; continue; }
    try {
      await track.applyConstraints({advanced:[{[k]:mode}]});
      const now = track.getSettings()[k];   // believe the camera's own report, not the accepted request
      results[k] = now === undefined ? `${mode}: accepted, not reported back` : now === mode ? `${mode}: confirmed` : `asked for ${mode}, camera reports ${now}`;
    } catch(e){ results[k] = `refused: ${e.name}`; }
  }
  diag.lock = {requested: want, results, at: new Date().toLocaleTimeString()};
  const took = r => /confirmed|accepted/.test(r || '');
  const anyOk = Object.values(results).some(took);
  const was = expLocked;
  expLocked = locking && took(results.exposureMode);
  const unconfirmed = expLocked && /accepted/.test(results.exposureMode);
  if (was !== expLocked || anyOk) newSession();   // exposure regime changed: earlier calibration no longer applies
  btn.setAttribute('aria-pressed', String(locking && anyOk));
  readCamera(); refresh();
  toast(expLocked ? (unconfirmed ? "Exposure lock was accepted, but the camera doesn't report it back. Calibrate, then check that a gray step holds its level when you pan." : 'Exposure locked. Calibrate now; it holds until you unlock.')
      : anyOk ? (locking ? 'Locked what this browser allows, but not exposure. See Diagnostics.' : 'Back to auto. Recalibrate before measuring.')
      : "This browser doesn't let web pages lock exposure. Freeze a shot that shows both the gray steps and what you measure.");
}
function liveTick(t){
  rafId = requestAnimationFrame(liveTick);
  if (source !== 'live' || !videoEl.videoWidth) return;
  if (!frozen){
    const t0 = performance.now();
    if (useRvfc){
      if (!frameFresh){
        if (t0 - lastFrameAt < 600) return;          // no new camera frame yet: don't average the same one twice
        useRvfc = false; diag.perf.frameSignal = 'timer (frame callbacks went quiet)';
      }
      frameFresh = false;
    }
    const g = grab(videoEl, videoEl.videoWidth, videoEl.videoHeight);
    const n = g.w*g.h*3;
    if (!acc || acc.length !== n){ acc = new Float32Array(n); for (let i=0,j=0;i<g.px.length;i+=4,j+=3){acc[j]=g.px[i];acc[j+1]=g.px[i+1];acc[j+2]=g.px[i+2];} setAspect(videoEl.videoWidth, videoEl.videoHeight); }
    else { const a = 1/S.avgN; for (let i=0,j=0;i<g.px.length;i+=4,j+=3){acc[j]+=(g.px[i]-acc[j])*a;acc[j+1]+=(g.px[i+1]-acc[j+1])*a;acc[j+2]+=(g.px[i+2]-acc[j+2])*a;} }
    frame = {w:g.w, h:g.h, data:acc}; liveFrames++;
    diag.perf.grabMs = +(performance.now()-t0).toFixed(1);
    renderView();
    if (t - lastAnalyze > 110){ lastAnalyze = t; refresh(true); }
  }
}
function setFrozen(on){
  if (source !== 'live'){ frozen = false; updateSourceUi(); return; }
  frozen = on;
  if (on){
    const c = document.createElement('canvas');
    const s = Math.min(1, 1600/Math.max(videoEl.videoWidth, videoEl.videoHeight));
    c.width = Math.round(videoEl.videoWidth*s); c.height = Math.round(videoEl.videoHeight*s);
    c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
    displaySrc = c; newPic();
    frame = {w:frame.w, h:frame.h, data:new Float32Array(frame.data)};
  } else { displaySrc = videoEl; newPic(); }
  updateSourceUi(); refresh();
}

/* ---------------- analysis ---------------- */
function roiPx(){
  const {w,h} = frame;
  const x0 = clamp(Math.floor(S.roi.x*w),0,w-1), y0 = clamp(Math.floor(S.roi.y*h),0,h-1);
  const x1 = clamp(Math.ceil((S.roi.x+S.roi.w)*w), x0+1, w), y1 = clamp(Math.ceil((S.roi.y+S.roi.h)*h), y0+1, h);
  return {x0,y0,x1,y1};
}
function analyze(){
  if (!frame) return null;
  const t0 = performance.now();
  const {w, data} = frame;
  const {x0,y0,x1,y1} = roiPx();
  const rw = x1-x0, rh = y1-y0;
  const WC = clamp(rw, 24, WCMAX);   // fewer columns for narrow boxes so traces stay solid
  const wave = new Float32Array(WC*WR), parR = new Float32Array(WC*WR), parG = new Float32Array(WC*WR), parB = new Float32Array(WC*WR);
  const vec = new Float32Array(VN*VN);
  const hY = new Float32Array(HB), hR = new Float32Array(HB), hG = new Float32Array(HB), hB = new Float32Array(HB);
  const NS = 12, NBND = 8;
  const sY = new Float64Array(NS), sRG = new Float64Array(NS), sBG = new Float64Array(NS), sN = new Float64Array(NS);
  const bY = new Float64Array(NBND), bN = new Float64Array(NBND);
  const rowY = new Float64Array(rh), colY = new Float64Array(rw);
  let sumR=0, sumG=0, sumB=0, n=0, clip=0, crush=0, over=0, faceHot=0, sigClip=0, sigCrush=0, edges=0;
  const gY = new Float64Array(NS*NBND), gN = new Float64Array(NS*NBND);
  const g = S.vecGain, LR = lut[0], LG = lut[1], LB = lut[2];
  const cm = CMAT, m00=cm?cm[0][0]:1, m01=cm?cm[0][1]:0, m02=cm?cm[0][2]:0, m10=cm?cm[1][0]:0, m11=cm?cm[1][1]:1, m12=cm?cm[1][2]:0, m20=cm?cm[2][0]:0, m21=cm?cm[2][1]:0, m22=cm?cm[2][2]:1;
  const vk = (VN-1)*0.5/60;
  for (let y=y0; y<y1; y++){
    let rowSum = 0, prevY = -1;
    const band = Math.min(NBND-1, ((y-y0)*NBND/rh)|0);
    for (let x=x0; x<x1; x++){
      const i = (y*w+x)*3;
      const r0 = data[i], g0 = data[i+1], b0 = data[i+2];
      let R = LR[(r0+0.5)|0], G = LG[(g0+0.5)|0], B = LB[(b0+0.5)|0];
      if (cm){ const r=R, gg=G, b=B; R=m00*r+m01*gg+m02*b; G=m10*r+m11*gg+m12*b; B=m20*r+m21*gg+m22*b; }
      const Y = KR*R + KG*G + KB*B;
      const col = ((x-x0)*WC/rw)|0;
      wave[lvlToRow(Y)*WC+col]++;
      parR[lvlToRow(R)*WC+col]++; parG[lvlToRow(G)*WC+col]++; parB[lvlToRow(B)*WC+col]++;
      const cb = (B-Y)/1.8556, cr = (R-Y)/1.5748;
      const vx = Math.round((VN-1)/2 + cb*g*vk), vy = Math.round((VN-1)/2 - cr*g*vk);
      if (vx>=0 && vx<VN && vy>=0 && vy<VN) vec[vy*VN+vx]++;
      hY[lvlToBin(Y)]++; hR[lvlToBin(R)]++; hG[lvlToBin(G)]++; hB[lvlToBin(B)]++;
      const chroma = Math.hypot(cb, cr);
      // Gamut edge: above 90% of the most saturation this hue can have (the 100% bars sit at 4/3 of the 75% targets).
      if (chroma > 8){ const ang = Math.atan2(cr, cb)*180/Math.PI; if (chroma > 1.2*hexAt(ang)) over++; }
      if (Math.max(r0,g0,b0) >= 250) clip++;
      if (KR*r0+KG*g0+KB*b0 <= 6) crush++;
      if (Y > 95) faceHot++;
      if (R >= 99 || G >= 99 || B >= 99) sigClip++;
      if (Y <= 1.5) sigCrush++;
      if (prevY >= 0 && Math.abs(Y - prevY) > 6) edges++;
      prevY = Y;
      sumR+=R; sumG+=G; sumB+=B; n++;
      const st = Math.min(NS-1, ((x-x0)*NS/rw)|0);
      sY[st]+=Y; sRG[st]+=R-G; sBG[st]+=B-G; sN[st]++;
      bY[band]+=Y; bN[band]++; gY[band*NS+st]+=Y; gN[band*NS+st]++;
      rowSum += Y; colY[x-x0] += Y;
    }
    rowY[y-y0] = rowSum / rw;
  }
  const meanR=sumR/n, meanG=sumG/n, meanB=sumB/n, meanY=KR*meanR+KG*meanG+KB*meanB;
  const pct = p => { const target = p*n; let c=0; for (let k=0;k<HB;k++){ c+=hY[k]; if (c>=target) return -10 + (k+0.5)*120/HB; } return 110; };
  const cb = (meanB-meanY)/1.8556, cr = (meanR-meanY)/1.5748;
  const chroma = Math.hypot(cb, cr), angle = (Math.atan2(cr, cb)*180/Math.PI+360)%360;
  const fit = (arr, cnt, N) => { // edge-to-edge change from a least-squares line
    const xs=[], ys=[]; for (let k=0;k<N;k++) if (cnt[k]>0){ xs.push(k); ys.push(arr[k]/cnt[k]); }
    if (xs.length < 3) return 0;
    const mx = xs.reduce((a,b)=>a+b)/xs.length, my = ys.reduce((a,b)=>a+b)/ys.length;
    let num=0, den=0; xs.forEach((x,k)=>{ num+=(x-mx)*(ys[k]-my); den+=(x-mx)*(x-mx); });
    return den ? num/den*(N-1) : 0;
  };
  const tiltH = fit(sY, sN, NS), tiltV = fit(bY, bN, NBND), tiltRG = fit(sRG, sN, NS), tiltBG = fit(sBG, sN, NS);
  // Banding: what is left of the row (or column) profile after a 9-wide moving average. Rows catch rolling bands, columns catch vertical moire.
  const ripple = (prof, len) => {
    if (len < 12) return 0;
    let ss = 0;
    for (let k=0;k<len;k++){ let a=0, m=0; for (let j=Math.max(0,k-4); j<=Math.min(len-1,k+4); j++){ a+=prof[j]; m++; } const r = prof[k]-a/m; ss+=r*r; }
    return Math.sqrt(ss/len);
  };
  for (let k=0;k<rw;k++) colY[k] /= rh;
  // Worst section: the 12 x 8 block furthest from the average, as % of the average.
  let worst = 0, worstCol = 0, worstRow = 0;
  if (meanY > 3 && rw >= 24 && rh >= 16) for (let k=0;k<NS*NBND;k++){ if (!gN[k]) continue; const dv = 100*(gY[k]/gN[k]-meanY)/meanY; if (Math.abs(dv) > Math.abs(worst)){ worst = dv; worstCol = k%NS; worstRow = (k/NS)|0; } }
  const bandRows = ripple(rowY, rh), bandCols = ripple(colY, rw);
  diag.perf.analyzeMs = +(performance.now()-t0).toFixed(1);
  return {n, rw, rh, WC, wave, parR, parG, parB, vec, hY, hR, hG, hB,
    meanR, meanG, meanB, meanY, p02:pct(0.02), p50:pct(0.5), p98:pct(0.98),
    clip:100*clip/n, crush:100*crush/n, faceHot:100*faceHot/n, over:100*over/n, sigClip:100*sigClip/n, sigCrush:100*sigCrush/n,
    edgePct:100*edges/n, worst, worstWhere:`${worstRow<3?'top':worstRow<5?'middle':'bottom'} ${worstCol<4?'left':worstCol<8?'center':'right'}`,
    cb, cr, chroma, angle, satRatio: chroma/hexAt(angle),
    tiltH: meanY>3 ? 100*tiltH/meanY : 0, tiltV: meanY>3 ? 100*tiltV/meanY : 0, tiltRG, tiltBG, bandRows, bandCols,
    rg: meanR-meanG, bg: meanB-meanG};
}

/* ---------------- scope drawing ---------------- */
const tmpC = document.createElement('canvas'), tmpX = tmpC.getContext('2d');
function density(ctx, arr, cols, rows, rgb, dx, dy, dw, dh, gainA=1){
  let max = 0; for (let k=0;k<arr.length;k++) if (arr[k]>max) max=arr[k];
  if (!max) return;
  if (tmpC.width!==cols || tmpC.height!==rows){ tmpC.width=cols; tmpC.height=rows; }
  const img = tmpX.createImageData(cols, rows), d = img.data, norm = max*0.28;
  for (let k=0;k<arr.length;k++){ const v=arr[k]; if (!v) continue; const a=Math.min(1, Math.sqrt(v/norm))*gainA; const o=k*4; d[o]=rgb[0]; d[o+1]=rgb[1]; d[o+2]=rgb[2]; d[o+3]=a*255; }
  tmpX.putImageData(img, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(tmpC, dx, dy, dw, dh); ctx.restore();
}
const COL = {bg:'#05080a', grat:'#24303a', gratHi:'#3a4954', label:'#6d7c88', trace:[196,236,255], ref:[255,179,71], r:[255,96,96], g:[96,226,128], b:[112,156,255], band:'rgba(92,200,224,0.07)', bandLine:'rgba(92,200,224,0.35)', skin:'rgba(242,193,78,0.55)'};
function plotArea(W, H, k){ const l = 30*k, r = 8*k, t = 18*k, b = 10*k; return {x:l, y:t, w:W-l-r, h:H-t-b}; }
function lvlY(p, L){ return p.y + (110 - L)/120 * p.h; }
function waveGrat(ctx, p, k, labels=true){
  ctx.lineWidth = 1*k;
  for (let L=0; L<=100; L+=10){
    const y = Math.round(lvlY(p,L))+0.5;
    ctx.strokeStyle = (L===0||L===50||L===100) ? COL.gratHi : COL.grat;
    ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x+p.w, y); ctx.stroke();
    if (labels && L%20===0){ ctx.fillStyle = COL.label; ctx.font = `${10*k}px ui-monospace, "SF Mono", Menlo, monospace`; ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillText(String(L), p.x-5*k, y); }
  }
}
function modeBands(ctx, p, k){
  const T = S.targets;
  const shade = (lo, hi) => { const y1=lvlY(p,hi), y2=lvlY(p,lo); ctx.fillStyle=COL.band; ctx.fillRect(p.x, y1, p.w, y2-y1); ctx.strokeStyle=COL.bandLine; ctx.setLineDash([3*k,3*k]); ctx.beginPath(); ctx.moveTo(p.x,y1);ctx.lineTo(p.x+p.w,y1);ctx.moveTo(p.x,y2);ctx.lineTo(p.x+p.w,y2);ctx.stroke(); ctx.setLineDash([]); };
  if (S.mode==='lighting' || (S.mode==='shading' && !isFull())) shade(T.skinLo, T.skinHi);
  if (S.mode==='content'){
    ctx.strokeStyle='rgba(255,100,100,0.5)'; ctx.setLineDash([2*k,4*k]); ctx.lineWidth=1*k;
    for (const L of [-5,105]){ const y=lvlY(p,L); ctx.beginPath(); ctx.moveTo(p.x,y); ctx.lineTo(p.x+p.w,y); ctx.stroke(); }
    ctx.setLineDash([]); ctx.fillStyle='rgba(255,100,100,0.7)'; ctx.font=`${9*k}px monospace`; ctx.textAlign='left'; ctx.textBaseline='bottom'; ctx.fillText('R103 105', p.x+4*k, lvlY(p,105)-2*k);
  }
  if (S.mode==='wall'){ const y=lvlY(p,90), y2=lvlY(p,95); ctx.fillStyle=COL.band; ctx.fillRect(p.x,y2,p.w,y-y2); }
}
function drawWave(ctx, W, H, M, k, A){
  ctx.fillStyle=COL.bg; ctx.fillRect(0,0,W,H);
  const p = plotArea(W,H,k);
  modeBands(ctx, p, k); waveGrat(ctx, p, k);
  if (A) density(ctx, A.wave, A.WC, WR, COL.ref, p.x, lvlY(p,110), p.w, p.h, 0.75);
  if (M) density(ctx, M.wave, M.WC, WR, COL.trace, p.x, lvlY(p,110), p.w, p.h);
}
function drawParade(ctx, W, H, M, k, A){
  ctx.fillStyle=COL.bg; ctx.fillRect(0,0,W,H);
  const p = plotArea(W,H,k); p.h -= 10*k;
  const gap = 6*k, sw = (p.w - 2*gap)/3;
  const chans = [['parR',COL.r,'R'],['parG',COL.g,'G'],['parB',COL.b,'B']];
  chans.forEach(([key, rgb, name], i) => {
    const q = {x:p.x + i*(sw+gap), y:p.y, w:sw, h:p.h};
    if (i===0) waveGrat(ctx, q, k, true); else waveGrat(ctx, q, k, false);
    if (S.mode==='wall'){ const y=lvlY(q,90), y2=lvlY(q,95); ctx.fillStyle=COL.band; ctx.fillRect(q.x,y2,q.w,y-y2); }
    if (A) density(ctx, A[key], A.WC, WR, COL.ref, q.x, lvlY(q,110), q.w, q.h, 0.7);
    if (M) density(ctx, M[key], M.WC, WR, rgb, q.x, lvlY(q,110), q.w, q.h);
    ctx.fillStyle=`rgb(${rgb})`; ctx.font=`600 ${10*k}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText(name, q.x+q.w/2, q.y+q.h+3*k);
  });
}
function vecGeom(W, H, k){ const R = Math.min(W, H)/2 - 12*k; return {cx:W/2, cy:H/2 + 2*k, R, s:R/60}; }
function vecPt(g, cb, cr){ return [g.cx + cb*g.s, g.cy - cr*g.s]; }
function drawVector(ctx, W, H, M, k, A){
  ctx.fillStyle=COL.bg; ctx.fillRect(0,0,W,H);
  const g = vecGeom(W,H,k);
  ctx.lineWidth=1*k; ctx.strokeStyle=COL.grat;
  ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.cx-g.R, g.cy); ctx.lineTo(g.cx+g.R, g.cy); ctx.moveTo(g.cx, g.cy-g.R); ctx.lineTo(g.cx, g.cy+g.R); ctx.stroke();
  // 75% hexagon
  ctx.strokeStyle=COL.grat; ctx.setLineDash([2*k,3*k]); ctx.beginPath();
  BARS75.forEach((b,i)=>{ const [x,y]=vecPt(g,b.cb,b.cr); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  // skin line
  const sa = S.targets.skinHue*Math.PI/180;
  ctx.strokeStyle=COL.skin; ctx.lineWidth=1.2*k; ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx+Math.cos(sa)*g.R, g.cy-Math.sin(sa)*g.R); ctx.stroke();
  // target boxes
  ctx.lineWidth=1*k; ctx.font=`600 ${9.5*k}px sans-serif`; ctx.textBaseline='middle'; ctx.textAlign='center';
  BARS75.forEach(b=>{
    const [x,y]=vecPt(g,b.cb,b.cr), bs=4.5*g.s;
    ctx.strokeStyle=COL.gratHi; ctx.strokeRect(x-bs, y-bs, bs*2, bs*2);
    const [x2,y2]=vecPt(g,b.cb*4/3,b.cr*4/3); ctx.beginPath(); ctx.moveTo(x2-3*k,y2); ctx.lineTo(x2+3*k,y2); ctx.moveTo(x2,y2-3*k); ctx.lineTo(x2,y2+3*k); ctx.stroke();
    const [lx,ly]=vecPt(g,b.cb*1.32,b.cr*1.32); ctx.fillStyle=COL.label; ctx.fillText(b.n, lx, ly);
  });
  ctx.strokeStyle=COL.gratHi; const c=2*g.s; ctx.strokeRect(g.cx-c, g.cy-c, c*2, c*2);
  ctx.fillStyle=COL.label; ctx.textAlign='right'; ctx.textBaseline='top'; ctx.font=`${10*k}px monospace`; ctx.fillText(`${S.vecGain}×`, W-6*k, H-16*k);
  const span = 2*g.R*(VN/(VN-1));
  if (A) density(ctx, A.vec, VN, VN, COL.ref, g.cx-span/2, g.cy-span/2, span, span, 0.75);
  if (M) density(ctx, M.vec, VN, VN, COL.trace, g.cx-span/2, g.cy-span/2, span, span);
  if (A && A.vecGain !== S.vecGain){ ctx.fillStyle=COL.ref; ctx.textAlign='left'; ctx.fillText(`Ref at ${A.vecGain}×`, 6*k, H-16*k); }
}
function drawHist(ctx, W, H, M, k, A){
  ctx.fillStyle=COL.bg; ctx.fillRect(0,0,W,H);
  const p = {x:10*k, y:18*k, w:W-18*k, h:H-34*k};
  const xOf = L => p.x + (L+10)/120*p.w;
  ctx.lineWidth=1*k;
  for (let L=0; L<=100; L+=10){ ctx.strokeStyle=(L%50===0)?COL.gratHi:COL.grat; const x=Math.round(xOf(L))+0.5; ctx.beginPath(); ctx.moveTo(x,p.y); ctx.lineTo(x,p.y+p.h); ctx.stroke(); }
  ctx.fillStyle=COL.label; ctx.font=`${10*k}px monospace`; ctx.textAlign='center'; ctx.textBaseline='top';
  [0,50,100].forEach(L=>ctx.fillText(String(L), xOf(L), p.y+p.h+3*k));
  const series = h => { let mx=0; for (const v of h) if (v>mx) mx=v; return mx; };
  const draw = (h, color, fill, mx) => {
    const pt = b => [p.x+(b+0.5)/HB*p.w, p.y+p.h - Math.sqrt(h[b]/mx)*p.h];
    ctx.beginPath();
    if (fill){
      ctx.moveTo(p.x, p.y+p.h);
      for (let b=0;b<HB;b++) ctx.lineTo(...pt(b));
      ctx.lineTo(p.x+p.w, p.y+p.h); ctx.fillStyle=fill; ctx.fill(); return;
    }
    for (let b=0;b<HB;b++){ const on = h[b]>0 || (b>0 && h[b-1]>0); on ? ctx.lineTo(...pt(b)) : ctx.moveTo(...pt(b)); }
    ctx.strokeStyle=color; ctx.lineWidth=1.3*k; ctx.stroke();
  };
  if (A){ draw(A.hY, `rgb(${COL.ref})`, null, Math.max(1,series(A.hY))); }
  if (!M) return;
  const mx = Math.max(1, series(M.hY), series(M.hR), series(M.hG), series(M.hB));
  draw(M.hY, null, 'rgba(196,236,255,0.18)', mx);
  ctx.globalCompositeOperation='lighter';
  draw(M.hR, 'rgba(255,96,96,0.85)', null, mx); draw(M.hG, 'rgba(96,226,128,0.85)', null, mx); draw(M.hB, 'rgba(112,156,255,0.9)', null, mx);
  ctx.globalCompositeOperation='source-over';
}
const SCOPES = {wave:['#cWave',drawWave], vector:['#cVec',drawVector], parade:['#cPar',drawParade], hist:['#cHist',drawHist]};
function renderScopes(){
  const dpr = Math.min(3, window.devicePixelRatio||1);
  for (const [name,[sel,fn]] of Object.entries(SCOPES)){
    const c = $(sel); const fig = c.parentElement;
    if (fig.offsetParent === null) continue;
    const W = Math.round(c.clientWidth*dpr), H = Math.round(c.clientHeight*dpr);
    if (!W || !H) continue;
    if (c.width!==W || c.height!==H){ c.width=W; c.height=H; }
    fn(c.getContext('2d'), W, H, M, dpr, S.A);
  }
}

/* ---------------- viewer ---------------- */
let fitRect = {x:0,y:0,w:1,h:1};
function srcSize(){ if (!displaySrc) return [16,9]; return displaySrc === videoEl ? [videoEl.videoWidth||16, videoEl.videoHeight||9] : [displaySrc.width, displaySrc.height]; }
function renderView(){
  const dpr = Math.min(3, window.devicePixelRatio||1);
  const cw = viewC.clientWidth, ch = viewC.clientHeight;
  if (!cw || !ch) return;
  const W = Math.round(cw*dpr), H = Math.round(ch*dpr);
  if (viewC.width!==W || viewC.height!==H){ viewC.width=W; viewC.height=H; }
  const x = viewC.getContext('2d');
  x.setTransform(1,0,0,1,0,0); x.fillStyle='#000'; x.fillRect(0,0,W,H);
  const [sw, sh] = srcSize();
  const s = Math.min(cw/sw, ch/sh), dw = sw*s, dh = sh*s;
  fitRect = {x:(cw-dw)/2, y:(ch-dh)/2, w:dw, h:dh};
  x.setTransform(dpr,0,0,dpr,0,0);
  if (displaySrc) { try { x.drawImage(displaySrc, fitRect.x, fitRect.y, dw, dh); } catch(e){} }
  const r = draftRoi || S.roi;
  const rx = fitRect.x + r.x*dw, ry = fitRect.y + r.y*dh, rw = r.w*dw, rh = r.h*dh;
  if (!(r.w>0.995 && r.h>0.995)){
    x.fillStyle='rgba(0,0,0,0.5)';
    x.fillRect(fitRect.x, fitRect.y, dw, ry-fitRect.y);
    x.fillRect(fitRect.x, ry+rh, dw, fitRect.y+dh-(ry+rh));
    x.fillRect(fitRect.x, ry, rx-fitRect.x, rh);
    x.fillRect(rx+rw, ry, fitRect.x+dw-(rx+rw), rh);
    x.strokeStyle = '#189ad6'; x.lineWidth = 1.5; if (draftRoi) x.setLineDash([5,4]);
    x.strokeRect(rx+0.5, ry+0.5, rw, rh); x.setLineDash([]);
  }
  const mark = (p, color, label, shape) => {
    const px = fitRect.x + p.x*dw, py = fitRect.y + p.y*dh, hs = Math.max(4, (p.r||0)*dw);   // hs: half the sampled square, to scale
    if (p.clipped || p.rough) color = '#ff6464';
    x.strokeStyle='#000'; x.lineWidth=3; x.beginPath(); shape==='d' ? diamond(px,py,hs+2) : x.rect(px-hs,py-hs,hs*2,hs*2); x.stroke();
    x.strokeStyle=color; x.lineWidth=1.6; x.beginPath(); shape==='d' ? diamond(px,py,hs+2) : x.rect(px-hs,py-hs,hs*2,hs*2); x.stroke();
    x.font='600 11px ui-monospace, "SF Mono", Menlo, monospace'; x.textAlign='left'; x.textBaseline='middle';
    x.lineWidth=3; x.strokeStyle='rgba(0,0,0,0.85)'; x.strokeText(label, px+hs+5, py); x.fillStyle=color; x.fillText(label, px+hs+5, py);
  };
  function diamond(px,py,r){ x.moveTo(px,py-r); x.lineTo(px+r,py); x.lineTo(px,py+r); x.lineTo(px-r,py); x.closePath(); }
  S.cal.forEach(p => { if (p.pic===picId) mark(p, '#189ad6', `${p.target}%`, 's'); });
  S.color.forEach(p => { if (p.pic===picId) mark(p, '#189ad6', p.name.slice(0,2).toUpperCase(), 's'); });
  S.taps.forEach((p,i) => { if (p.pic===picId && p.chartId===S.chartId) mark(p, '#ffb347', String(i+1), 'd'); });
  $('#roiInfo').textContent = isFull() ? 'Region: full frame' : `Region: ${Math.round(S.roi.w*100)}% × ${Math.round(S.roi.h*100)}%`;
}
function isFull(){ return S.roi.w>0.97 && S.roi.h>0.97; }
function toNorm(e){
  const b = viewC.getBoundingClientRect();
  return {x:(e.clientX-b.left-fitRect.x)/fitRect.w, y:(e.clientY-b.top-fitRect.y)/fitRect.h, cx:e.clientX, cy:e.clientY};
}
viewC.addEventListener('pointerdown', e => {
  if (!frame) return;
  const p = toNorm(e);
  if (p.x<0||p.x>1||p.y<0||p.y>1) return;
  viewC.setPointerCapture(e.pointerId);
  drag = {p0:p, moved:false};
});
viewC.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = toNorm(e);
  if (!drag.moved && Math.hypot(p.cx-drag.p0.cx, p.cy-drag.p0.cy) < 8) return;
  if (tapMode) return;
  drag.moved = true;
  const x0 = clamp(Math.min(drag.p0.x,p.x),0,1), y0 = clamp(Math.min(drag.p0.y,p.y),0,1);
  const x1 = clamp(Math.max(drag.p0.x,p.x),0,1), y1 = clamp(Math.max(drag.p0.y,p.y),0,1);
  draftRoi = {x:x0, y:y0, w:x1-x0, h:y1-y0};
  if (source!=='live' || frozen) renderView();
});
const endDrag = e => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved && draftRoi){
    if (draftRoi.w > 0.015 && draftRoi.h > 0.015) S.roi = draftRoi;
    draftRoi = null; save(); refresh();
  } else if (!d.moved && tapMode){
    sampleAt(d.p0);
  }
};
viewC.addEventListener('pointerup', endDrag);
viewC.addEventListener('pointercancel', () => { drag = null; draftRoi = null; renderView(); });

/* ---------------- tapping patches ---------------- */
const TAPKEY = {cal:'cal', chart:'taps', color:'color'};
const TAPMIN = {cal:2, chart:1, color:3};
function sampleAt(p){
  if (tapMode.i >= tapMode.items.length){ toast('All patches are tapped. Press Done, or Undo to redo the last one.'); return; }
  const {w,h,data} = frame;
  const cx = Math.round(p.x*w), cy = Math.round(p.y*h), r = Math.max(2, Math.round(w*0.011));
  let R=0,G=0,B=0,n=0, sy=0, syy=0;
  for (let y=Math.max(0,cy-r); y<=Math.min(h-1,cy+r); y++) for (let x=Math.max(0,cx-r); x<=Math.min(w-1,cx+r); x++){
    const i=(y*w+x)*3; R+=data[i]; G+=data[i+1]; B+=data[i+2]; n++;
    const yv = KR*data[i]+KG*data[i+1]+KB*data[i+2]; sy+=yv; syy+=yv*yv;
  }
  const raw = [R/n, G/n, B/n], spread = Math.sqrt(Math.max(0, syy/n - (sy/n)*(sy/n)));
  const item = tapMode.items[tapMode.i], kind = tapMode.kind;
  // An edge or texture inside the sampled square means it is not one patch. Refuse once; a second tap is taken as deliberate.
  const rough = spread > 6;
  if (rough && !tapMode.warned){ tapMode.warned = true; toast("That spot isn't one flat patch: an edge or texture is inside the sample square. Tap the middle of the patch or move closer. Tap again to use it anyway."); return; }
  tapMode.warned = false;
  const clipped = Math.max(...raw) >= 250;
  if (clipped) toast(kind === 'chart' ? 'That chip is clipped in the phone, so its level can\'t be read. Lower the exposure and use Undo to redo it.' : 'That patch is clipped in the phone, so it is left out of the calibration. Lower the exposure and use Undo to redo it.');
  else if (kind === 'cal' && item.target > 5 && Math.min(...raw) <= 2) toast('That step reads as black to the phone. Check you tapped the right spot.');
  const rec = {x:p.x, y:p.y, r:r/w, raw, clipped, rough, pic:picId, session:sessionId, name:item.name};
  if (kind === 'chart') Object.assign(rec, {lo:item.lo, hi:item.hi, chartId:S.chartId}); else rec.target = item.target;
  S[TAPKEY[kind]].push(rec);
  if (kind !== 'chart') rebuildLut();
  tapMode.added.push(true); tapMode.i++;
  updateTapbar(); refresh();      // stays open after the last patch so Undo can still reach it
}
function startTaps(kind){
  if (tapMode) finishTaps();
  if (!frame){ toast('Load a picture or start the camera first.'); return; }
  let items;
  if (kind === 'cal'){
    const lv = patternLevels();
    if (lv.length < 2){ toast('Enter at least two pattern levels.'); return; }
    items = lv.map(v=>({name:`${v}% step`, target:v}));
  } else if (kind === 'color'){
    const L = S.barLevel;
    items = BAR_DEFS.map(([n,r,g,b])=>({name:`${n} bar`, target:[r*L, g*L, b*L]}));
  } else {
    const ps = chartPatches();
    if (!ps.length){ toast('Enter the chart patches first.'); return; }
    items = ps.map(p=>({...p}));
  }
  if (source === 'live' && !frozen) setFrozen(true);
  // The previous set is kept aside and only replaced once enough new taps exist.
  tapMode = {kind, items, i:0, added:[], backup:S[TAPKEY[kind]]};
  S[TAPKEY[kind]] = [];
  $('#tapbar').hidden = false;
  updateTapbar();
  rebuildLut(); refresh();
  $('#viewer').scrollIntoView({block:'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
}
function updateTapbar(){
  const kind = tapMode.kind, total = tapMode.items.length, done = tapMode.i >= total;
  $('#tapUndo').disabled = tapMode.i === 0;
  $('#tapSkip').disabled = done;
  if (done){
    $('#tapWhat').textContent = 'All tapped';
    $('#tapSub').textContent = 'Press Done to use them, or Undo to redo the last one.';
    return;
  }
  const it = tapMode.items[tapMode.i];
  $('#tapWhat').textContent = kind==='cal' ? `Tap the ${it.target}% step` : `Tap the ${it.name.toLowerCase()}`;
  $('#tapSub').textContent = `${tapMode.i+1} of ${total}` + (kind==='cal' ? ` · pattern level ${it.target}%` : kind==='color' ? ` · ${S.barLevel}% bars` : ` · target ${it.lo} to ${it.hi}%`) + '. Tap the middle of the patch.';
}
function finishTaps(){
  const {kind, backup} = tapMode, key = TAPKEY[kind];
  tapMode = null; $('#tapbar').hidden = true;
  const usable = kind === 'chart' ? S[key].length : S[key].filter(p=>!p.clipped).length;
  if (usable < TAPMIN[kind]){
    const had = backup.length >= TAPMIN[kind];
    S[key] = backup;
    toast(kind==='chart' ? (had ? 'No chips tapped. Kept the previous chips.' : 'No chips tapped.')
        : kind==='cal' ? 'Need at least 2 unclipped steps.' + (had ? ' Kept the previous calibration.' : '')
        : 'Need at least 3 unclipped bars.' + (had ? ' Kept the previous color calibration.' : ''));
    rebuildLut();
  } else {
    if (kind === 'cal') S.color = S.color.filter(p => p.session === sessionId);   // bars from an older picture can't pair with new steps
    rebuildLut();
    toast(kind==='cal' ? (calActive() ? 'Levels calibrated. Now tap the color bars.' : "Those steps didn't read in order, so no curve was built. Redo the taps.")
        : kind==='color' ? (colorActive() ? 'Color calibrated.' : "Those bars didn't give a usable correction. Check for clipped or mis-tapped bars.")
        : 'Chart chips recorded.');
  }
  refresh();
}
$('#tapSkip').onclick = () => { if (!tapMode || tapMode.i >= tapMode.items.length) return; tapMode.warned = false; tapMode.i++; tapMode.added.push(false); updateTapbar(); };
$('#tapUndo').onclick = () => {
  if (!tapMode || !tapMode.i) return;
  const last = tapMode.added.pop(); tapMode.i--; tapMode.warned = false;
  if (last){ S[TAPKEY[tapMode.kind]].pop(); if (tapMode.kind !== 'chart') rebuildLut(); }
  updateTapbar(); refresh();
};
$('#tapDone').onclick = () => { if (tapMode) finishTaps(); };

/* ---------------- rules ---------------- */
const F = (s, t, v, tg, fix, why) => ({s, t, v, tg, fix, why});
const TOP = (...a) => ({...F(...a), top:true});   // trust warnings: listed above the readings they put in doubt
// Control names as they appear on a camera remote panel: WHITE (gain), BLACK (pedestal) and GAMMA, each with R, G and B.
const CTRL = {gain:'white (gain)', pedestal:'black (pedestal)', gamma:'gamma'};
function castFix(r, b, ctrl){
  const T = S.targets, parts = [], name = CTRL[ctrl] || ctrl;
  const amt = v => ctrl === 'gamma' ? 'slightly' : `until it moves about ${fmt(Math.abs(v))} points on the waveform`;   // gamma is not trimmed in level points
  if (Math.abs(r) >= T.neutralWarn) parts.push(`${r>0?'Lower':'Raise'} R ${name} ${amt(r)}`);
  if (Math.abs(b) >= T.neutralWarn) parts.push(`${b>0?'lower':'raise'} B ${name} ${amt(b)}`);
  return parts.length ? parts.join(', ') + '.' : 'No change needed.';
}
function castName(r, b){
  const T = S.targets.neutralWarn/2;
  const R = r>T ? 1 : r<-T ? -1 : 0, B = b>T ? 1 : b<-T ? -1 : 0;
  const map = {'1,1':'magenta','1,0':'red','1,-1':'warm (red/yellow)','0,1':'blue','0,-1':'yellow','-1,1':'cool (blue/cyan)','-1,0':'cyan','-1,-1':'green','0,0':'neutral'};
  return map[`${R},${B}`];
}
function aComparable(){ const A = S.A; return !!A && (samePicture(A) || (A.session === sessionId && !(source === 'live' && !expLocked))); }
function grade(v, lo, hi, margin){ if (v>=lo && v<=hi) return 'pass'; if (v>=lo-margin && v<=hi+margin) return 'warn'; return 'fail'; }
function sev(mag, warn, fail){ return mag >= fail ? 'fail' : mag >= warn ? 'warn' : 'pass'; }
function skinRules(M, out){
  const T = S.targets, L = M.p50;
  const s = grade(L, T.skinLo, T.skinHi, T.skinMargin);
  out.push(F(s, 'Skin level', `${fmt(L)}%`, `${T.skinLo} to ${T.skinHi}%`,
    L < T.skinLo ? 'Open the iris or bring up key light on the presenter. If only IMAG looks dark, check the wall brightness, not the camera.' + (S.skinTone === 'light' || S.skinTone === 'medium' ? ' If this presenter has a deeper complexion, change Complexion first: well-exposed deep skin sits at 30 to 55%.' : '')
      : L > T.skinHi ? 'Close the iris or trim key light. Check the knee is not flattening faces.' + (S.skinTone === 'deep' || S.skinTone === 'medium' ? ' If this presenter has a lighter complexion, change Complexion first: light skin sits at 55 to 75%.' : '') : 'No change needed.',
    'Faces are what the audience judges IMAG by. Common waveform placements for well-exposed skin: light 55 to 75% (about 70), medium 45 to 65%, deep 30 to 55%. Pick the complexion to tighten the check.'));
  if (M.chroma < 1.5){ out.push(F('warn','Skin hue','No color', `on the ${T.skinHue}° line`, 'The box reads as gray. Box only skin, or check that chroma is not turned down.', 'Hue can only be judged when the region has some color.')); }
  else {
    let d = M.angle - T.skinHue; d = ((d+540)%360)-180;
    const hs = Math.abs(d) <= T.hueTol ? 'pass' : Math.abs(d) <= T.hueWarn ? 'warn' : 'fail';
    out.push(F(hs, 'Skin hue', `${fmt(M.angle,0)}° (${fmtS(d,0)}°)`, `${T.skinHue}° ± ${T.hueTol}°`,
      hs==='pass' ? 'No change needed.' : d > 0 ? 'Skin is leaning yellow-green. Add a little magenta: on a CCU raise R and B gain together slightly. If it is the light, check the wash color temperature and any green spike in LED fixtures.' : 'Skin is leaning red-magenta. Lower R gain slightly, or check for magenta in LED washes and gel.',
      'Skin of every complexion lands close to the skin tone line, at 123° on a Rec.709 vectorscope: the light and dark skin patches of a ColorChecker work out to 123° and 122°. The ±10° window is a working tolerance, not a standard.'));
    const sr = M.satRatio*100;
    const ss = sr > 65 ? 'warn' : sr < 15 ? 'warn' : 'pass';
    out.push(F(ss, 'Skin saturation', `${fmt(sr,0)}% of 75% target`, '15 to 65%', sr > 65 ? 'Skin is oversaturated. Lower saturation on the camera or processor.' : sr < 15 ? 'Skin looks washed out. Check saturation and white balance.' : 'No change needed.', 'Distance from the center of the vectorscope, as a share of the 75% bar target at the same hue. ColorChecker skin patches sit at 25 to 33%. A working range, not a standard.'));
  }
  out.push(F(sev(M.faceHot, 3, 10), 'Hot spots on skin', `${fmt(M.faceHot)}% over 95`, 'under 3%', 'Trim the key, add diffusion, or lower the knee point so forehead and nose do not clip.', 'Clipped skin loses texture on IMAG and reads as shine.'));
}
function evaluate(M){
  const out = [], T = S.targets;
  if (!M) return out;
  if (source === 'sample') out.push(F('note','Sample frame','Example only','', 'Load a photo or start the live camera to analyze your show.', 'The sample is a synthetic picture with a slightly yellow face, so the skin hue check warns on purpose.'));
  const cv = calValidity();
  if (cv === 'none') out.push(F('note','Phone not calibrated','Raw phone levels','Step 1 done','Put a gray step pattern on the wall from the processor, then run step 1.', "Until then every number includes the phone camera's own exposure, tone curve and color boost, which can shift readings by 10 points or more."));
  else {
    if (cv === 'other') out.push(TOP('warn','Calibration is from another picture','May not apply','same picture, or locked live','Recalibrate on this picture: get the gray steps and what you are measuring into the same shot. In live mode, lock exposure, then calibrate; it holds until you unlock.', 'Phone exposure and white balance change from picture to picture, so a curve built on one picture shifts the numbers on another.'));
    if (cv === 'unlocked') out.push(TOP('warn','Exposure not locked','Levels can drift','locked before step 1',"Tap Lock exposure + WB, then redo step 1. If this browser can't lock exposure, keep the gray steps in the same shot as what you measure.", 'With auto exposure the phone re-meters whenever the picture changes, which moves every level after calibration.'));
    if (!colorActive()) out.push(F('note','Color not calibrated','Levels only','color bars tapped','Tap the color bars in step 1.', "Gray steps fix levels and white balance. Hue and saturation still include the phone's own color boost until the bars are tapped."));
  }
  if (cv !== 'none' && colorActive() && CFIT.rms > 5) out.push(F('note','Color fit is rough', `±${fmt(CFIT.rms)} pts on the bars`, 'under ±5', 'Lower the phone exposure and redo the color bars, and use the 75% bars. Skin and other moderate colors are affected much less than saturated ones.', 'The correction could not bring every bar onto its target, usually because the phone clips saturated LED color. Saturated colors can read off by about this much.'));
  if (M.clip > 0.5) out.push(TOP(M.clip > 5 ? 'fail' : 'warn', 'Phone is clipping', `${fmt(M.clip)}% of the box`, 'under 0.5%', 'Lower the phone exposure (use the Exposure slider if it is shown), fill the frame with the wall so the phone meters on it, or step back.', 'Where the phone clips, levels read lower than they are and colors shift, so checks on bright areas are not reliable. Bright walls in dark rooms cause this.'));
  if (source === 'photo') out.push(F('note','Photo mode is approximate','','','Use live mode for numbers you will act on.', "Phone photos are tone-mapped unevenly across the frame, which one correction curve can't undo. Live video frames are processed far more evenly."));
  if (S.mode === 'shading'){
    out.push(F('note','Camera check, not shading','Read through IMAG','', 'Use this to spot a camera that is off. Shade and match cameras on the hardware scope at the CCU.', 'The phone sees the camera after the switcher, processor and wall. Calibration cancels the wall and the phone only where the gray steps sit, so readings are rougher than a scope on the camera output.'));
    const taps = S.taps.filter(t=>t.chartId===S.chartId && t.session===sessionId);
    if (!taps.length) out.push(F('note','No chart chips tapped','','', 'Frame the chip chart on IMAG, then run step 2 and tap each chip when asked.', 'Camera checks compare each chip to the chart’s published value.'));
    let whiteCast=null, blackCast=null;
    taps.forEach(t => {
      const c = corrected(t.raw), mid = (t.lo+t.hi)/2;
      if (Math.max(...t.raw) >= 250){ out.push(F('fail', `${t.name} clipped in phone`, 'Above range', '', 'Lower the phone exposure or step back, then tap again.', 'A clipped patch reads lower than it is, so the level check would be wrong.')); return; }
      const s = grade(c.Y, t.lo, t.hi, T.levelMargin), dark = mid <= 15;
      out.push(F(s, `${t.name} level`, `${fmt(c.Y)}%`, `${t.lo} to ${t.hi}%`,
        s==='pass' ? 'No change needed.' : dark ? (c.Y > t.hi ? 'Lower master black (pedestal) until this chip sits in range.' : 'Raise master black; shadows are crushed.') : (c.Y > t.hi ? 'Close the iris (or lower master gain) until this chip sits in range.' : 'Open the iris until this chip sits in range.'),
        dark ? 'Black level sets how much shadow detail survives on IMAG.' : 'Chip levels set exposure for the whole picture. White chip near 90% leaves room before the knee.'));
      const r = c.R-c.G, b = c.B-c.G, mag = Math.max(Math.abs(r), Math.abs(b));
      const ctrl = mid >= 70 ? 'gain' : dark ? 'pedestal' : 'gamma';
      if (mid >= 70) whiteCast = [r,b]; if (dark) blackCast = [r,b];
      out.push(F(sev(mag, T.neutralWarn, T.neutralFail), `${t.name} balance`, `R−G ${fmtS(r)} · B−G ${fmtS(b)}`, `within ±${T.neutralWarn}`,
        mag < T.neutralWarn ? 'No change needed.' : `Reads ${castName(r,b)}. ${castFix(r,b,ctrl)}` + (ctrl==='gain' ? ' Or redo the auto white balance on the chart.' : ctrl==='pedestal' ? ' Or redo the auto black balance.' : ''),
        'Gray chips should show no color: R, G and B level on the parade. Shaders normally trim R and B and leave G alone, so balance is shown against G. On a hardware scope cameras are matched to within a point or two; ±3 here allows for the phone.'));
    });
    if (whiteCast && blackCast){
      const split = (whiteCast[0]*blackCast[0] < 0 && Math.max(Math.abs(whiteCast[0]),Math.abs(blackCast[0])) >= T.neutralWarn) || (whiteCast[1]*blackCast[1] < 0 && Math.max(Math.abs(whiteCast[1]),Math.abs(blackCast[1])) >= T.neutralWarn);
      out.push(F(split?'warn':'pass','Grayscale tracking', split?'Shifts color from black to white':'Tracks', 'same balance end to end', split ? 'Run black balance, then white balance. If it still splits, trim R and B gamma.' : 'No change needed.', 'If blacks and whites lean opposite ways, mid-tones and skin shift as exposure changes.'));
    }
    if (!isFull()) skinRules(M, out);
  }
  if (S.mode === 'wall'){
    // A flat field has almost no hard edges, however uneven it is. Pictures and patterns have many.
    if (M.edgePct > 1.5) out.push(F('note','Evenness checks skipped','Picture has detail','', 'Box an area showing a full white or gray field. Evenness and banding can only be judged on a flat field.', 'Hard edges in the box mean it is showing a picture or pattern (or very heavy moire), and the content itself would read as tilt and banding.'));
    else {
      const ws = sev(Math.abs(M.worst), T.uniWarn*2, T.uniFail*2);
      out.push(F(ws, 'Worst section', ws === 'pass' ? `${fmtS(M.worst)}%` : `${fmtS(M.worst)}% at ${M.worstWhere}`, `within ±${T.uniWarn*2}%`,
        ws === 'pass' ? 'No change needed.' : `The ${M.worstWhere} of the box reads ${fmt(Math.abs(M.worst))}% ${M.worst<0?'dimmer':'brighter'} than the average. Check that cabinet or module, its receiving card and data run, and its calibration.`,
        'Compares 96 sections of the boxed area with its average. Catches a dim or dead section that an edge-to-edge tilt would understate.'));
      out.push(F(sev(Math.abs(M.tiltH), T.uniWarn, T.uniFail), 'Left to right evenness', `${fmtS(M.tiltH)}%`, `within ±${T.uniWarn}%`,
        Math.abs(M.tiltH) < T.uniWarn ? 'No change needed.' : `${M.tiltH>0?'Right':'Left'} side reads brighter. Turn the phone upside down and shoot again: if the brighter side swaps, it is the phone's lens, not the wall. Reshoot square-on and centered. If it still holds, check processor calibration and brightness on the ${M.tiltH>0?'left':'right'} side, and whether panels come from different batches.`,
        'LED panels are commonly specified at 97% brightness uniformity or better. Brightness and color also change with viewing angle, so an off-axis phone can create a tilt that is not in the wall. Phone lenses also darken toward the edges of the picture, and calibration does not remove that.'));
      out.push(F(sev(Math.abs(M.tiltV), T.uniWarn, T.uniFail), 'Top to bottom evenness', `${fmtS(M.tiltV)}%`, `within ±${T.uniWarn}%`,
        Math.abs(M.tiltV) < T.uniWarn ? 'No change needed.' : `${M.tiltV>0?'Bottom':'Top'} reads brighter. Turn the phone upside down and shoot again: if the brighter end swaps, it is the phone's lens, not the wall. Match the phone height to the wall center, then check processor calibration by row.`,
        'Vertical viewing angle on LED is usually narrower than horizontal.'));
      const ct = Math.max(Math.abs(M.tiltRG), Math.abs(M.tiltBG));
      out.push(F(sev(ct, T.neutralWarn, T.neutralFail), 'Color shift across the wall', `R−G ${fmtS(M.tiltRG)} · B−G ${fmtS(M.tiltBG)}`, `within ±${T.neutralWarn}`,
        ct < T.neutralWarn ? 'No change needed.' : 'Color changes from one side to the other. Check processor color calibration per cabinet or column, and mixed panel batches.', 'Measured edge to edge on the boxed area.'));
      const bandMax = Math.max(M.bandRows, M.bandCols), rows = M.bandRows >= M.bandCols, bad = bandMax >= T.bandWarn;
      out.push(F(bad ? 'warn' : 'pass', 'Banding or moire', `${fmt(bandMax,2)} pts` + (bad ? (rows ? ' · horizontal' : ' · vertical') : ''), `under ${T.bandWarn}`,
        !bad ? 'No change needed.' : rows ? 'Horizontal bands usually mean the shutter is beating against LED refresh. Raise averaging first. If the show camera sees them too, check processor refresh rate and genlock.' : 'Vertical or fine patterning is usually moire between LED pitch and the phone sensor. Change distance or zoom slightly and shoot square-on.',
        'Checked along rows and columns of the boxed area.'));
    }
    if (calActive()){
      const mag = Math.max(Math.abs(M.rg), Math.abs(M.bg));
      out.push(F(sev(mag, T.neutralWarn, T.neutralFail), 'Color vs calibration point', `R−G ${fmtS(M.rg)} · B−G ${fmtS(M.bg)}`, `within ±${T.neutralWarn}`,
        mag < T.neutralWarn ? 'No change needed.' : `This area reads ${castName(M.rg,M.bg)} compared with where step 1 was tapped. Check processor color settings for this section.`,
        'Step 1 neutralizes the wall where it was tapped, so this shows sections that differ from that spot.'));
    }
    out.push(F('note','Pattern level', `${fmt(M.meanY)}% average`, '', 'For evenness checks a full white field near 90 to 95% or a 50% gray works best.', 'A phone cannot measure nits; this is relative to the calibration.'));
  }
  if (S.mode === 'content'){
    // Calibrated, these judge the content's own levels. Uncalibrated, only the phone's view is available, so they never go past a warning.
    const cal = calActive(), hi = cal ? M.sigClip : M.clip, lo = cal ? M.sigCrush : M.crush, cap = v => (!cal && v === 'fail') ? 'warn' : v;
    out.push(F(cap(sev(hi, T.clipWarn, T.clipFail)), cal ? 'Clipped highlights' : 'Clipped highlights (phone view)', `${fmt(hi)}% of area`, `under ${T.clipWarn}%`, 'Ask for a version with highlights pulled down, or lower the wall brightness if only bright scenes clip.',
      cal ? 'Counts pixels whose calibrated level is at 99% or above in any channel.' : "Uncalibrated, this counts where the phone clips, which can be the phone's exposure and not the content. Calibrate to judge the content itself."));
    out.push(F(cap(sev(lo, T.crushWarn, T.crushFail)), cal ? 'Crushed blacks' : 'Crushed blacks (phone view)', `${fmt(lo)}% of area`, `under ${T.crushWarn}%`, 'Lift the shadows in the content or check the processor input range (full vs legal). Full-range signal read as legal crushes blacks and clips whites; legal read as full lifts blacks and dulls whites.',
      cal ? 'Counts pixels whose calibrated level is at 1.5% or below.' : "Uncalibrated, this counts where the phone reads black, which can be the phone's exposure and not the content."));
    out.push(F(sev(M.over, T.hotWarn, T.hotFail), 'Colors at the gamut edge', `${fmt(M.over)}% of area`, `under ${T.hotWarn}%`, 'Large areas of fully saturated color bloom on LED and clip in camera. Pull saturation a little on the hottest colors, especially reds and blues.', 'Counts pixels above 90% of the most saturation their hue can have. Small areas of saturated brand color are normal.' + (colorActive() ? '' : " Without color calibration the phone's own color boost inflates this number.")));
    out.push(F('note','Average picture level', `${fmt(M.meanY)}%`, '', 'Bright full-screen content raises wall power and flare on camera.', 'Average luma of the boxed area.'));
    out.push(F('note','Legal range not measured', '', '', 'Check broadcast legal levels on the hardware scope in video village.', 'Out-of-range signal is invisible once it is displayed, so no camera image can verify it.'));
  }
  if (S.mode === 'lighting'){
    if (isFull()) out.push(F('note','Box a face', '', '', "Drag a box over the presenter's cheek and forehead on IMAG.", 'Skin checks need a region that is only skin.'));
    else skinRules(M, out);
  }
  if (S.A){
    const A = S.A, dY = M.p50 - A.p50, dr = M.rg - A.rg, db = M.bg - A.bg;
    if (!aComparable()) out.push(TOP('warn','Reference may not be comparable', A.session !== sessionId ? 'Saved on another picture' : 'Exposure not locked', 'same picture, or locked live', 'Save the reference and box the second thing inside one picture, or use live mode with exposure locked.', 'Pictures taken separately are exposed separately, so the difference includes the phone, not just the two sources.'));
    out.push(F(sev(Math.abs(dY), T.matchWarn, T.matchFail), 'Level vs reference', `${fmtS(dY)} pts`, `within ±${T.matchWarn}`,
      Math.abs(dY) < T.matchWarn ? 'No change needed.' : `This source is ${fmt(Math.abs(dY))} pts ${dY>0?'brighter':'darker'} than the reference. ${dY>0?'Close':'Open'} the iris slightly, or trim brightness on this source.`, 'Compares the middle of the luma range in each box.'));
    const cm = Math.max(Math.abs(dr), Math.abs(db));
    out.push(F(sev(cm, T.matchWarn, T.matchFail), 'Color vs reference', `R−G ${fmtS(dr)} · B−G ${fmtS(db)}`, `within ±${T.matchWarn}`,
      cm < T.matchWarn ? 'No change needed.' : `Reads ${castName(dr,db)} next to the reference. ${castFix(dr, db, 'gain')}`, 'Matching against a saved trace is how cameras and tiles are matched on a hardware scope, using its freeze function.'));
  }
  const order = {fail:0, warn:1, note:2, pass:3};
  return out.sort((a,b)=>(b.top?1:0)-(a.top?1:0) || order[a.s]-order[b.s]);
}

/* ---------------- rendering UI ---------------- */
let FLAGS = [];
function renderReads(){
  const el = $('#reads');
  if (!M){ el.innerHTML = ''; return; }
  let d = M.angle - S.targets.skinHue; d = ((d+540)%360)-180;
  const tiles = [
    ['Luma 2 / 50 / 98', `${fmt(M.p02,0)} / ${fmt(M.p50,0)} / ${fmt(M.p98,0)}`, '% of range'],
    ['Average', `${fmt(M.meanY)}%`, `R ${fmt(M.meanR,0)} G ${fmt(M.meanG,0)} B ${fmt(M.meanB,0)}`],
    ['Balance vs G', `${fmtS(M.rg)} / ${fmtS(M.bg)}`, 'R−G / B−G pts'],
    ['Hue', M.chroma>1.5 ? `${fmt(M.angle,0)}°` : '–', M.chroma>1.5 ? `${fmtS(d,0)}° from skin line` : 'no color'],
    ['Saturation', `${fmt(M.satRatio*100,0)}%`, 'of 75% target'],
    ['Clipped / crushed', `${fmt(M.clip)} / ${fmt(M.crush)}%`, 'of region (phone)'],
    ['Tilt L→R / T→B', `${fmtS(M.tiltH)} / ${fmtS(M.tiltV)}%`, 'edge to edge'],
    ['Gamut edge', `${fmt(M.over)}%`, 'above 90% saturation']
  ];
  el.innerHTML = tiles.map(([k,v,s])=>`<div class="read"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
}
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function renderFlags(){
  const el = $('#flags');
  const openTitles = new Set($$('.flag[open]', el).map(d=>d.dataset.t));
  const c = {fail:0,warn:0,pass:0,note:0}; FLAGS.forEach(f=>c[f.s]++);
  $('#counts').textContent = `${c.fail} fail · ${c.warn} warn · ${c.pass} pass` + (c.note ? ` · ${c.note} note${c.note>1?'s':''}` : '');
  el.innerHTML = FLAGS.map(f => `<details class="flag" data-t="${esc(f.t)}"${openTitles.has(f.t)?' open':''}><summary><span class="pill ${f.s}">${f.s==='note'?'note':f.s}</span><span class="t">${esc(f.t)}</span><span class="v">${esc(f.v)}</span></summary><div class="more">${f.tg?`<div><b>Target</b>${esc(f.tg)}</div>`:''}<div><b>Fix</b>${esc(f.fix)}</div><div><b>Why</b>${esc(f.why)}</div></div></details>`).join('');
}
function renderStatus(){
  const cs = $('#calStatus');
  const cv = calValidity(), tail = cv==='other' ? ' · from another picture' : cv==='unlocked' ? ' · exposure not locked' : '';
  const calClip = S.cal.filter(p=>p.clipped), calGood = S.cal.filter(p=>!p.clipped);
  if (calActive()){
    cs.textContent = `Levels calibrated · ${calGood.length} steps` + (calClip.length ? ` · ${calClip.length} clipped, left out: reads up to about ${Math.max(...calGood.map(p=>p.target))}%` : '') + tail;
    cs.className = 'status ' + (cv==='ok' && !calClip.length ? 'ok' : 'warn');
  }
  else if (S.cal.length >= 2 && !S.calApply){ cs.textContent = `${S.cal.length} steps tapped, not applied`; cs.className='status warn'; }
  else { cs.textContent = (S.cal.length && !tapMode) ? "Steps didn't read in order" : 'Levels not calibrated'; cs.className='status'; }
  const co = $('#colorStatus');
  if (colorActive()){
    const left = S.color.length - CFIT.n;
    co.textContent = `Color calibrated · ${CFIT.n} bars · fit ±${fmt(CFIT.rms)} pts` + (left ? ` · ${left} clipped, left out` : '') + tail;
    co.className = 'status ' + (cv==='ok' && CFIT.rms <= 5 ? 'ok' : 'warn');
  }
  else if (S.color.length >= 3 && !S.calApply){ co.textContent = `${S.color.length} bars tapped, not applied`; co.className='status warn'; }
  else { co.textContent = 'Color not calibrated'; co.className='status'; }
  $('#calApply').checked = !!S.calApply;
  $('#barSel').value = String(S.barLevel);
  $('#metaCal').innerHTML = `Phone: <b>${cv==='none' ? 'uncalibrated' : cv!=='ok' ? 'calibration stale' : colorActive() && calActive() ? 'calibrated' : calActive() ? 'levels only' : 'color only'}</b>`;
  const taps = S.taps.filter(t=>t.chartId===S.chartId && t.session===sessionId);
  const st = $('#chartStatus'); st.textContent = taps.length ? `${taps.length} of ${chartPatches().length} chips tapped` : 'No chips tapped'; st.className = 'status' + (taps.length ? ' ok' : '');
  $('#chartNote').textContent = CHARTS[S.chartId].note;
  $('#customChart').hidden = S.chartId !== 'custom';
  $('#customPattern').hidden = S.patternId !== 'custom';
  $$('.mode').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.mode===S.mode)));
  $$('#layoutSeg button').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.layout===S.layout)));
  $$('#gainSeg button').forEach(b=>b.setAttribute('aria-pressed', String(+b.dataset.gain===S.vecGain)));
  const sc = $('#scopes'); sc.classList.toggle('single', S.layout!=='quad');
  $$('.scope', sc).forEach(f=>f.classList.toggle('show', f.dataset.scope===S.layout));
  if (!tapMode) $('#hint').textContent = MODE_HINTS[S.mode];
  $('#skinBar').hidden = !(S.mode === 'lighting' || S.mode === 'shading');
  $('#skinSel').value = S.skinTone;
}
function updateSourceUi(){
  const b = $('#badge');
  b.className = 'badge';
  if (source==='live'){ b.textContent = frozen ? 'Frozen' : `Live · avg ${S.avgN}`; b.classList.add(frozen?'frozen':'live'); }
  else b.textContent = source==='sample' ? 'Sample frame' : 'Photo';
  $('#liveBar').hidden = source !== 'live';
  $('#btnLive').setAttribute('aria-pressed', String(source==='live'));
  $('#btnFreeze').disabled = source !== 'live';
  $('#btnFreeze').setAttribute('aria-pressed', String(frozen));
  $('#btnFreeze').textContent = frozen ? 'Unfreeze' : 'Freeze';
  $('#avgSel').value = String(S.avgN);
}
function refresh(fromLive){
  if (!lut) rebuildLut();
  M = analyze();
  FLAGS = evaluate(M);
  if (!fromLive || frozen || source!=='live') renderView();
  renderScopes(); renderReads(); renderFlags(); renderStatus();
  $('#metaPerf').textContent = diag.perf.analyzeMs != null ? `${diag.perf.analyzeMs} ms` : '';
}
function renderDiag(){
  diag.env.runningIn = IN_CLAUDE ? 'Claude artifact' : (navigator.standalone || matchMedia('(display-mode: standalone)').matches) ? 'Home screen app' : 'Browser tab';
  diag.env.secureContext = window.isSecureContext;
  diag.env.cameraApi = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  diag.env.userAgent = navigator.userAgent;
  diag.env.pixelRatio = window.devicePixelRatio;
  try { diag.env.supportedConstraints = Object.keys(navigator.mediaDevices.getSupportedConstraints()).filter(k=>/exposure|whiteBalance|focus|zoom|torch|iso|colorTemp/i.test(k)).join(', ') || 'none of interest'; } catch(e){ diag.env.supportedConstraints = 'unavailable'; }
  diag.perf.analysisSize = frame ? `${frame.w}×${frame.h}` : '–';
  $('#diag').textContent = JSON.stringify(diag, null, 2);
}

/* ---------------- report ---------------- */
function wrapText(x, text, maxW){
  const words = String(text).split(/\s+/), lines = []; let line = '';
  for (const w of words){ const t = line ? line+' '+w : w; if (x.measureText(t).width > maxW && line){ lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
async function exportReport(){
  if (!M){ toast('Nothing to report yet.'); return; }
  try { await document.fonts.ready; } catch(e){}
  const W = 1240, H = 1754, m = 60, c = document.createElement('canvas'); c.width=W; c.height=H;
  const x = c.getContext('2d');
  const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', cond = sans, mono = 'ui-monospace, "SF Mono", Menlo, monospace';
  x.fillStyle='#fff'; x.fillRect(0,0,W,H);
  x.fillStyle='#0b1116'; x.font=`700 40px ${cond}`; x.textBaseline='top'; x.fillText('ONSITE SCOPE ANALYSIS', m, m);
  x.font=`500 22px ${sans}`; x.fillStyle='#1d2730';
  const modeName = {shading:'Camera check (via IMAG)', wall:'LED wall', content:'Content QC', lighting:'Stage lighting'}[S.mode];
  x.fillText([S.showName||'Untitled show', S.sourceLabel||'Unlabeled source', modeName].join('  ·  '), m, m+52);
  x.font=`400 16px ${mono}`; x.fillStyle='#55626d';
  const chart = CHARTS[S.chartId].name;
  x.fillText(`${new Date().toLocaleString()}  ·  ${{none:'phone NOT calibrated', ok:'phone calibrated' + (colorActive() ? '' : ' (levels only)'), other:'calibration from another picture', unlocked:'calibrated, exposure not locked'}[calValidity()]}  ·  chart: ${chart}`, m, m+86);
  x.fillStyle='#d5dbe0'; x.fillRect(m, m+118, W-2*m, 2);
  // picture
  const top = m+140, pw = 620, [sw,sh] = srcSize(), ph = Math.round(pw*sh/sw);
  const phc = Math.min(ph, 400), pwc = Math.round(phc*sw/sh);
  x.fillStyle='#000'; x.fillRect(m, top, pwc, phc);
  if (displaySrc) try { x.drawImage(displaySrc, m, top, pwc, phc); } catch(e){}
  if (!isFull()){ x.strokeStyle='#189ad6'; x.lineWidth=3; x.strokeRect(m+S.roi.x*pwc, top+S.roi.y*phc, S.roi.w*pwc, S.roi.h*phc); }
  // readings
  const rx = m + pwc + 30, rw = W - m - rx;
  x.font=`700 18px ${cond}`; x.fillStyle='#55626d'; x.fillText('READINGS', rx, top);
  const rows = [['Luma 2/50/98', `${fmt(M.p02,0)} / ${fmt(M.p50,0)} / ${fmt(M.p98,0)} %`],['Average', `${fmt(M.meanY)} %`],['R−G / B−G', `${fmtS(M.rg)} / ${fmtS(M.bg)}`],['Hue', M.chroma>1.5?`${fmt(M.angle,0)}°`:'–'],['Saturation', `${fmt(M.satRatio*100,0)} % of 75%`],['Clip / crush', `${fmt(M.clip)} / ${fmt(M.crush)} %`],['Tilt L→R / T→B', `${fmtS(M.tiltH)} / ${fmtS(M.tiltV)} %`],['Gamut edge', `${fmt(M.over)} %`]];
  rows.forEach(([k,v],i)=>{ const y = top+32+i*44; x.font=`400 15px ${sans}`; x.fillStyle='#55626d'; x.fillText(k, rx, y); x.font=`500 19px ${mono}`; x.fillStyle='#0b1116'; x.fillText(v, rx, y+18); });
  if (S.A){ x.font=`400 14px ${sans}`; x.fillStyle='#b26b00'; x.fillText(`Reference: ${S.A.label}`, rx, top+32+rows.length*44); }
  // scopes
  const sTop = top + Math.max(phc, 32+rows.length*44+20) + 30, gap = 16, sW = (W-2*m-gap)/2, sH = Math.round(sW*0.5);
  const list = [['Waveform · luma',drawWave],['Vectorscope',drawVector],['RGB parade',drawParade],['Histogram',drawHist]];
  list.forEach(([name,fn],i)=>{
    const oc = document.createElement('canvas'); oc.width=Math.round(sW*2); oc.height=Math.round(sH*2);
    fn(oc.getContext('2d'), oc.width, oc.height, M, 2, S.A);
    const sx = m + (i%2)*(sW+gap), sy = sTop + Math.floor(i/2)*(sH+gap+22);
    x.font=`600 15px ${cond}`; x.fillStyle='#55626d'; x.fillText(name.toUpperCase(), sx, sy);
    x.drawImage(oc, sx, sy+20, sW, sH);
  });
  // flags
  let y = sTop + 2*(sH+gap+22) + 10;
  x.font=`700 18px ${cond}`; x.fillStyle='#55626d'; x.fillText('CHECKS', m, y); y += 28;
  const colr = {fail:'#c62828', warn:'#a66a00', pass:'#1f8a50', note:'#3c50a8'};
  const footerY = H - m - 40;
  let shown = 0;
  const passes = FLAGS.filter(f=>f.s==='pass');
  for (const f of FLAGS.filter(f=>f.s!=='pass')){
    x.font=`400 15px ${sans}`;
    const fixLines = f.s==='pass' ? [] : wrapText(x, f.fix, W-2*m-120);
    const need = 26 + fixLines.length*20 + 8;
    if (y + need > footerY){ x.font=`400 15px ${sans}`; x.fillStyle='#55626d'; x.fillText(`+ more checks in the app`, m, y); break; }
    x.font=`700 15px ${cond}`; x.fillStyle=colr[f.s]; x.fillText(f.s.toUpperCase(), m, y+2);
    x.font=`600 17px ${sans}`; x.fillStyle='#0b1116'; x.fillText(f.t, m+70, y);
    x.font=`400 15px ${mono}`; x.fillStyle='#384550'; x.textAlign='right'; x.fillText(f.v + (f.tg?`   target ${f.tg}`:''), W-m, y+2); x.textAlign='left';
    y += 24;
    x.font=`400 15px ${sans}`; x.fillStyle='#384550'; fixLines.forEach(l=>{ x.fillText(l, m+70, y); y+=20; });
    y += 8; shown++;
  }
  if (passes.length && y + 40 < footerY){
    x.font=`700 15px ${cond}`; x.fillStyle=colr.pass; x.fillText('PASS', m, y+2);
    x.font=`400 15px ${sans}`; x.fillStyle='#384550';
    const lines = wrapText(x, passes.map(f=>`${f.t} ${f.v}`).join('  ·  '), W-2*m-70);
    for (const l of lines){ if (y + 20 > footerY) break; x.fillText(l, m+70, y+2); y += 20; }
  }
  x.fillStyle='#d5dbe0'; x.fillRect(m, footerY, W-2*m, 1);
  x.font=`400 13px ${sans}`; x.fillStyle='#55626d';
  wrapText(x, 'Phone-based estimate from a camera image of a display. Not a substitute for a hardware waveform monitor or vectorscope. Legal signal range, absolute white point and brightness are not measured.', W-2*m).forEach((l,i)=>x.fillText(l, m, footerY+10+i*18));
  const blob = await new Promise(r=>c.toBlob(r, 'image/png'));
  const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
  const nm = `onsite-scope-${(S.sourceLabel||S.mode).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'report'}-${stamp}.png`;
  deliver(nm, blob);
}

/* ---------------- test pattern ---------------- */
function makePattern(){
  const W=1920, H=1080, c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  x.fillStyle='#000'; x.fillRect(0,0,W,H);
  const lab = (t, cx, y) => { x.fillStyle='rgb(150,150,150)'; x.font='600 28px ui-monospace, "SF Mono", Menlo, monospace'; x.textAlign='center'; x.textBaseline='top'; x.fillText(t, cx, y); };
  x.fillStyle='rgb(128,128,128)'; x.font='600 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; x.textAlign='left'; x.textBaseline='top';
  x.fillText('ONSITE SCOPE TEST PATTERN · FULL RANGE RGB · TAP STEPS LEFT TO RIGHT', 60, 28);
  const m=60, sw=(W-2*m)/11;
  for (let i=0;i<=10;i++){ const v=Math.round(i*25.5); x.fillStyle=`rgb(${v},${v},${v})`; x.fillRect(m+i*sw, 80, Math.ceil(sw), 330); lab(`${i*10}%`, m+i*sw+sw/2, 422); }
  x.strokeStyle='rgb(64,64,64)'; x.lineWidth=2; x.strokeRect(m+1, 81, sw-2, 328);
  const bars=[[191,191,191,'W75'],[191,191,0,'YL'],[0,191,191,'CY'],[0,191,0,'G'],[191,0,191,'MG'],[191,0,0,'R'],[0,0,191,'B']];
  const bw=(W-2*m)/7;
  bars.forEach(([r,g,b,n],i)=>{ x.fillStyle=`rgb(${r},${g},${b})`; x.fillRect(m+i*bw, 480, Math.ceil(bw), 250); lab(n, m+i*bw+bw/2, 742); });
  const blocks=[[255,'100% WHITE'],[128,'50% GRAY'],[0,'0% BLACK']], kw=(W-2*m-40)/3;
  blocks.forEach(([v,n],i)=>{ const bx=m+i*(kw+20); x.fillStyle=`rgb(${v},${v},${v})`; x.fillRect(bx, 800, kw, 210); if (!v){ x.strokeStyle='rgb(64,64,64)'; x.lineWidth=2; x.strokeRect(bx+1,801,kw-2,208);} lab(n, bx+kw/2, 1022); });
  return c;
}
async function downloadPattern(){
  try { await document.fonts.ready; } catch(e){}
  const c = makePattern();
  const blob = await new Promise(r=>c.toBlob(r,'image/png'));
  deliver('onsite-scope-test-pattern-1080p.png', blob);
}

/* ---------------- file delivery ---------------- */
const dlReady = IN_CLAUDE ? window.claude.use('downloads').catch(()=>null) : Promise.resolve(null);
async function deliver(filename, blob){
  const dl = await dlReady;
  if (dl){
    try { await dl.save({filename, data:blob}); toast(`Saved ${filename}`); }
    catch(e){ if (e && e.code==='declined') return; toast(e && e.code==='rate_limited' ? 'Another save is already open.' : "This view can't save files. Open the hosted copy to export."); }
    return;
  }
  if (IN_CLAUDE){ toast("This view can't save files. Open the hosted copy to export."); return; }
  // A share sheet only opens from a direct tap, so the finished file waits here for one.
  closeSheet();
  sheetFile = new File([blob], filename, {type: blob.type});
  sheetUrl = URL.createObjectURL(blob);
  const isImg = /^image\//.test(blob.type), img = $('#sheetImg');
  img.hidden = !isImg; if (isImg) img.src = sheetUrl; else img.removeAttribute('src');
  $('#sheetName').textContent = filename;
  const canShare = !!(navigator.canShare && navigator.canShare({files:[sheetFile]}));
  const homeScreen = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  $('#sheetShare').hidden = !canShare;
  $('#sheetDl').hidden = homeScreen && canShare;      // a home-screen app has no download manager; a download link can navigate away from it
  $('#sheetHint').textContent = canShare ? 'Share opens Print, Save to Files and AirDrop.' : isImg && homeScreen ? 'Press and hold the picture to save it.' : 'Ready to save.';
  const a = $('#sheetDl'); a.href = sheetUrl; a.download = filename;
  $('#sheet').hidden = false;
}
let sheetFile = null, sheetUrl = '';
function closeSheet(){ $('#sheet').hidden = true; if (sheetUrl){ const u = sheetUrl; sheetUrl = ''; setTimeout(()=>URL.revokeObjectURL(u), 30000); } sheetFile = null; }
$('#sheetShare').onclick = () => { if (!sheetFile) return; navigator.share({files:[sheetFile], title:sheetFile.name}).then(closeSheet).catch(e => { if (e.name !== 'AbortError') toast("Sharing didn't open. Use Download instead."); }); };
$('#sheetDl').onclick = () => setTimeout(closeSheet, 400);
$('#sheetClose').onclick = closeSheet;

/* ---------------- toast ---------------- */
let toastT = 0;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(()=>{ t.hidden = true; }, 4200); }

/* ---------------- controls ---------------- */
$('#btnLive').onclick = () => startLive();
$('#filePhoto').onchange = e => { loadFile(e.target.files[0]); e.target.value=''; };
$('#fileOpen').onchange = e => { loadFile(e.target.files[0]); e.target.value=''; };
$('#btnSample').onclick = () => loadSample();
$('#btnFreeze').onclick = () => setFrozen(!frozen);
$('#btnFull').onclick = () => { S.roi = {x:0,y:0,w:1,h:1}; save(); refresh(); };
$('#avgSel').onchange = e => { S.avgN = +e.target.value; save(); updateSourceUi(); };
$('#lensSel').onchange = e => { S.deviceId = e.target.value; save(); startLive({pinTried:true}); };
$('#expSl').onchange = async e => {
  if (!track) return;
  try { await track.applyConstraints({advanced:[{exposureCompensation:+e.target.value}]}); newSession(); acc = null; refresh(); toast('Exposure changed. Recalibrate before measuring.'); }
  catch(err){ toast("The camera didn't accept that exposure."); }
};
$('#btnLock').onclick = () => toggleLock();
$$('.mode').forEach(b => b.onclick = () => { S.mode = b.dataset.mode; save(); refresh(); });
$$('#layoutSeg button').forEach(b => b.onclick = () => { S.layout = b.dataset.layout; save(); renderStatus(); requestAnimationFrame(renderScopes); });
$$('#gainSeg button').forEach(b => b.onclick = () => { S.vecGain = +b.dataset.gain; save(); refresh(); });
const patSel = $('#patternSel'); Object.entries(PATTERNS).forEach(([k,v])=>{ const o=document.createElement('option'); o.value=k; o.textContent=v.name; patSel.appendChild(o); }); patSel.value = S.patternId;
patSel.onchange = () => { S.patternId = patSel.value; save(); renderStatus(); };
$('#customPattern').value = S.customPattern; $('#customPattern').onchange = e => { S.customPattern = e.target.value; save(); };
const chSel = $('#chartSel'); Object.entries(CHARTS).forEach(([k,v])=>{ const o=document.createElement('option'); o.value=k; o.textContent=v.name; chSel.appendChild(o); }); chSel.value = S.chartId;
chSel.onchange = () => { S.chartId = chSel.value; save(); refresh(); };
$('#customChart').value = S.customChart; $('#customChart').onchange = e => { S.customChart = e.target.value; save(); refresh(); };
$('#skinSel').onchange = e => { S.skinTone = e.target.value; [S.targets.skinLo, S.targets.skinHi] = SKIN_RANGES[S.skinTone]; save(); buildTargets(); refresh(); };
$('#btnCal').onclick = () => startTaps('cal');
$('#btnColor').onclick = () => startTaps('color');
$('#barSel').onchange = e => { S.barLevel = +e.target.value; S.color = []; save(); rebuildLut(); refresh(); };
$('#btnChart').onclick = () => startTaps('chart');
$('#btnPattern').onclick = () => downloadPattern();
$('#calApply').onchange = e => { S.calApply = e.target.checked; save(); rebuildLut(); refresh(); };
$('#btnCalClear').onclick = () => { if (tapMode) finishTaps(); S.cal = []; S.color = []; rebuildLut(); refresh(); toast('Calibration cleared.'); };
$('#btnChartClear').onclick = () => { if (tapMode) finishTaps(); S.taps = []; refresh(); };
$('#showName').value = S.showName; $('#showName').oninput = e => { S.showName = e.target.value; save(); };
$('#sourceLabel').value = S.sourceLabel; $('#sourceLabel').oninput = e => { S.sourceLabel = e.target.value; save(); };
$('#btnReport').onclick = () => exportReport();

function buildTargets(){
  $('#tgrid').innerHTML = TARGET_FIELDS.map(([k,l,u])=>`<label for="t_${k}">${l}<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" step="0.5" id="t_${k}" value="${S.targets[k]}"><span class="u">${u}</span></span></label>`).join('');
  TARGET_FIELDS.forEach(([k])=>{ $('#t_'+k).onchange = e => { const v = parseFloat(e.target.value); if (isFinite(v)){ S.targets[k] = v; save(); refresh(); } else e.target.value = S.targets[k]; }; });
}
$('#btnResetT').onclick = () => { S.targets = {...DEFAULT_TARGETS}; S.skinTone = 'any'; save(); buildTargets(); refresh(); toast('Targets reset to defaults.'); };
$('#btnExportS').onclick = () => {
  const data = {app:'onsite-scope', version:1, targets:S.targets, chartId:S.chartId, customChart:S.customChart, patternId:S.patternId, customPattern:S.customPattern};
  deliver('onsite-scope-settings.json', new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
};
$('#fileImport').onchange = e => {
  const f = e.target.files[0]; e.target.value=''; if (!f) return;
  f.text().then(t => {
    const d = JSON.parse(t);
    if (!d || d.app !== 'onsite-scope') throw new Error('not an Onsite Scope settings file');
    S.targets = cleanTargets(d.targets);
    Object.assign(S, cleanSettings({chartId:d.chartId, customChart:d.customChart, patternId:d.patternId, customPattern:d.customPattern}));
    chSel.value = S.chartId; patSel.value = S.patternId; $('#customChart').value = S.customChart; $('#customPattern').value = S.customPattern;
    save(); buildTargets(); refresh(); toast('Settings imported.');
  }).catch(err => toast(`Couldn't import: ${err.message}.`));
};
$('#btnCopyDiag').onclick = () => {
  renderDiag(); const txt = $('#diag').textContent;
  const p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject();
  p.then(()=>toast('Diagnostics copied.')).catch(()=>{ const r=document.createRange(); r.selectNodeContents($('#diag')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Use Copy from the menu.'); });
};
$('#diagPanel').addEventListener('toggle', renderDiag);
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && source === 'live' && !wakeLock && 'wakeLock' in navigator){ try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
});
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(()=>{ renderView(); renderScopes(); }, 80); });
if ('ResizeObserver' in window) new ResizeObserver(()=>{ renderView(); renderScopes(); }).observe($('#scopes'));

buildTargets();
rebuildLut();
loadSample();
window.__onsiteScope = {frames:()=>liveFrames, fit:()=>CFIT, tapState:()=>tapMode && {i:tapMode.i, n:tapMode.items.length}, S, analyzeNow:()=>{ refresh(); return M; }, evaluate:()=>FLAGS, setStill, makePattern, startTaps, tapAt:(x,y)=>{ if (tapMode) sampleAt({x,y}); }, state:()=>({sessionId, picId, validity:calValidity(), color:colorActive(), levels:calActive()})};
})();
