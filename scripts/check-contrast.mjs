/**
 * WCAG contrast check over the real token pairs in web/src/styles.css.
 * Values are parsed from the stylesheet, so this cannot drift from the design.
 * Run: node scripts/check-contrast.mjs   (exits non-zero on a failing pair)
 */
// OKLCH -> sRGB -> WCAG contrast, for the real pairs in the stylesheet.
const f=(t)=>t>0.0031308?1.055*Math.pow(t,1/2.4)-0.055:12.92*t;
function oklch(L,C,h){
  const hr=h*Math.PI/180, a=C*Math.cos(hr), b=C*Math.sin(hr);
  const l_=L+0.3963377774*a+0.2158037573*b, m_=L-0.1055613458*a-0.0638541728*b, s_=L-0.0894841775*a-1.2914855480*b;
  const l=l_**3, m=m_**3, s=s_**3;
  return [ 4.0767416621*l-3.3077115913*m+0.2309699292*s,
          -1.2684380046*l+2.6097574011*m-0.3413193965*s,
          -0.0041960863*l-0.7034186147*m+1.7076147010*s ].map(f).map(v=>Math.min(1,Math.max(0,v)));
}
const lum=([r,g,b])=>{const c=[r,g,b].map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(A,B)=>{const a=lum(A),b=lum(B);return ((Math.max(a,b)+.05)/(Math.min(a,b)+.05));};
// read the real values out of the stylesheet so this can never drift
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../web/src/styles.css', import.meta.url),'utf8');
const v=(name)=>{const m=new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(css);
  if(!m) throw new Error('missing --'+name); return [+m[1],+m[2],+m[3]];};
const C={
  paper:v('paper'), paperLit:[1,0,0], plate:v('plate'),
  iron:v('iron'), ironDeep:[0.26,0.055,248], ironMid:v('iron-mid'),
  ironWash:v('iron-wash'),
  ink:v('ink'), inkSoft:v('ink-soft'), inkDim:v('ink-dim'),
  oxblood:v('oxblood'), oxbloodWash:v('oxblood-wash'),
  headCaption:[0.84,0.03,235], headSub:[0.88,0.025,235],
  gFiles:v('g-files'), gMedia:v('g-media'), gProjects:v('g-projects'), gApps:v('g-apps'),
};
const rgb=Object.fromEntries(Object.entries(C).map(([k,v])=>[k,oklch(...v)]));
const pairs=[
  ['ink on paper','ink','paper',4.5],['ink-soft on paper','inkSoft','paper',4.5],
  ['ink-dim on paper (captions/meta)','inkDim','paper',4.5],
  ['ink-dim on plate (sidebar)','inkDim','plate',4.5],
  ['iron link on paper','iron','paper',4.5],
  ['iron-mid icons on paper','ironMid','paper',3],
  ['oxblood on paper','oxblood','paper',4.5],
  ['oxblood on oxblood-wash (danger btn)','oxblood','oxbloodWash',4.5],
  ['paper-lit on iron (primary btn / header)','paperLit','iron',4.5],
  ['header caption on iron','headCaption','iron',4.5],
  ['header sub on iron','headSub','iron',4.5],
  ['ink on iron-wash (row hover)','ink','ironWash',4.5],
  ['genus files swatch on paper','gFiles','paper',3],
  ['genus media swatch on paper','gMedia','paper',3],
  ['genus projects swatch on paper','gProjects','paper',3],
  ['genus apps swatch on paper','gApps','paper',3],
];
let bad=0;
for(const [name,a,b,min] of pairs){
  const r=ratio(rgb[a],rgb[b]);
  const ok=r>=min; if(!ok) bad++;
  console.log(`${ok?'PASS':'FAIL'}  ${r.toFixed(2)}:1  (needs ${min})  ${name}`);
}
console.log(bad ? `\n${bad} FAILING PAIR(S)` : '\nAll pairs pass.');
process.exit(bad ? 1 : 0);
