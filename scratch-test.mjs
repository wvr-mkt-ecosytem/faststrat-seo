import fs from "node:fs"; import http from "node:http";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.split("=")[0].trim(),l.split("=").slice(1).join("=").trim()]));
const AUTH="Basic "+Buffer.from(`${env.DASHBOARD_USER}:${env.DASHBOARD_PASSWORD}`).toString("base64");
const post=(ruta,cuerpo)=>new Promise((res,rej)=>{
 const body=JSON.stringify(cuerpo);
 const req=http.request({host:"localhost",port:3100,path:ruta,method:"POST",headers:{Authorization:AUTH,"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)}},r=>{
  let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res({status:r.statusCode,json:JSON.parse(d)})}catch{rej(new Error(d.slice(0,200)))}});});
 req.setTimeout(0);req.on("error",rej);req.end(body);});

const antes = fs.readdirSync("content/blog").length;
console.log(`artículos antes: ${antes}`);
const t0=Date.now();
const r = await post("/api/blog/generate", { keyword: "whatsapp business api pricing for small business", lang: "en" });
console.log(`\nstatus ${r.status} en ${((Date.now()-t0)/60000).toFixed(1)} min`);
console.log(JSON.stringify(r.json).slice(0,420));
const despues = fs.readdirSync("content/blog").length;
console.log(`\nartículos después: ${despues}  (${despues>antes?"ESCRIBIÓ":"NO escribió"})`);
