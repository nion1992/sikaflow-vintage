import{t as C,N as j}from"./index-AS-tLWI4.js";const P=595.28,E=new TextEncoder;function b(r){return r.toFixed(2).replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"")}function $(r,t,e){if(r.length===0)throw new Error("Empty JPEG data.");if(!Number.isFinite(t)||!Number.isFinite(e)||t<=0||e<=0)throw new Error("Invalid image dimensions.");const o=P,i=Math.max(1,e*(o/t)),a=[];let f=0;const s=[0,0,0,0,0,0],c=n=>{const l=typeof n=="string"?E.encode(n):n;a.push(l),f+=l.length},d=n=>{s[n]=f,c(`${n} 0 obj
`)};c(`%PDF-1.4
`),c(new Uint8Array([37,226,227,207,211,10])),d(1),c(`<< /Type /Catalog /Pages 2 0 R >>
endobj
`),d(2),c(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
`),d(3),c(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${b(o)} ${b(i)}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>
endobj
`),d(4),c(`<< /Type /XObject /Subtype /Image /Width ${Math.round(t)} /Height ${Math.round(e)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${r.length} >>
stream
`),c(r),c(`
endstream
endobj
`);const g=`q
${b(o)} 0 0 ${b(i)} 0 0 cm
/Im0 Do
Q
`;d(5),c(`<< /Length ${E.encode(g).length} >>
stream
`),c(g),c(`endstream
endobj
`);const m=f;c(`xref
0 6
0000000000 65535 f 
`);for(let n=1;n<=5;n+=1)c(`${String(s[n]).padStart(10,"0")} 00000 n 
`);c(`trailer
<< /Size 6 /Root 1 0 R >>
startxref
${m}
%%EOF
`);const u=new Uint8Array(f);let y=0;for(const n of a)u.set(n,y),y+=n.length;return u}async function v(r){const t=await fetch(r,{cache:"force-cache",mode:"cors"});if(!t.ok)return r;const e=await t.blob();if(!e.type||!e.type.startsWith("image/"))return r;const o=await e.arrayBuffer();let i="";const a=new Uint8Array(o);for(let s=0;s<a.length;s++)i+=String.fromCharCode(a[s]);return`data:${e.type.startsWith("jpeg")?"jpeg":"png"};base64,${btoa(i)}`}function D(r,t){const e=document.createElement("img");return e.alt="Company logo",e.src=t,e.className="absolute top-2 left-2 max-w-[96px] max-h-[56px] rounded-md object-contain",r.appendChild(e),e}async function F(r,t){const o=Array.from(r.querySelectorAll("img")).find(a=>a.getAttribute("src")===t||a.src===t);if(o){const a=await v(t);return o.src=a,{changedSrc:o,originalSrc:t,injectedLogo:null}}return{changedSrc:null,originalSrc:null,injectedLogo:D(r,t)}}async function R(r,t){let e=null,o=null,i=null;if(t&&t.length>0){const a=await F(r,t);e=a.changedSrc,o=a.originalSrc,i=a.injectedLogo}try{const f=await(await j(r,{scale:2,dpr:1,backgroundColor:"#ffffff"})).toBlob({type:"jpeg",quality:.92});if(f.size===0)throw new Error("Empty capture.");const s=await createImageBitmap(f);try{const c=s.width,d=s.height;if(c<2||d<2)throw new Error("Capture has no usable size.");const g=document.createElement("canvas");g.width=48,g.height=48;const m=g.getContext("2d",{willReadFrequently:!0});if(m){m.drawImage(s,0,0,48,48);const{data:n}=m.getImageData(0,0,48,48);let l=255,w=0;for(let p=0;p<n.length;p+=4){const h=.299*n[p]+.587*n[p+1]+.114*n[p+2];h<l&&(l=h),h>w&&(w=h)}if(w-l<10)throw new Error("Capture was blank.")}let u=new Uint8Array(await f.arrayBuffer());if(u[0]!==255||u[1]!==216){const n=document.createElement("canvas");n.width=c,n.height=d;const l=n.getContext("2d");if(!l)throw new Error("Canvas 2D unavailable.");l.fillStyle="#ffffff",l.fillRect(0,0,c,d),l.drawImage(s,0,0);const w=await new Promise((p,h)=>{n.toBlob(S=>S?p(S):h(new Error("JPEG encode failed.")),"image/jpeg",.92)});if(u=new Uint8Array(await w.arrayBuffer()),u[0]!==255||u[1]!==216)throw new Error("Could not produce JPEG bytes for the PDF.")}const y=$(u,c,d);return new Blob([y],{type:"application/pdf"})}finally{s.close()}}finally{e&&o!=null&&(e.src=o),i&&i.remove()}}function x(r,t){const e=URL.createObjectURL(r),o=document.createElement("a");o.href=e,o.download=t,document.body.appendChild(o),o.click(),o.remove(),window.setTimeout(()=>URL.revokeObjectURL(e),1e4)}async function L({sheet:r,logoUrl:t,filename:e,text:o}){let i=null;if(r)try{i=await R(r,t)}catch(a){console.error("PDF generation failed:",a),C.error("Could not build the PDF — opening WhatsApp with the message only.")}if(i){const a=new File([i],e,{type:"application/pdf"});if(typeof navigator.share=="function"&&typeof navigator.canShare=="function"&&navigator.canShare({files:[a]}))try{return await navigator.share({files:[a],text:o}),"shared"}catch(s){if(s instanceof DOMException&&s.name==="AbortError")return"cancelled";console.error("Web Share failed:",s)}x(i,e),C.success(`PDF saved as ${e} — attach it in the chat.`)}return window.open(`https://wa.me/?text=${encodeURIComponent(o)}`,"_blank","noopener,noreferrer"),i?"saved":"message-only"}export{L as s};
