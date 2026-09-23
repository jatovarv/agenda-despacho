const bytes=(n:number)=>crypto.getRandomValues(new Uint8Array(n));
const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
export const token=()=>hex(bytes(32));
export async function digest(s:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
export async function hashPassword(password:string,salt=hex(bytes(16)),iterations=600000){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return `pbkdf2$${iterations}$${salt}$${hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations},key,256))}`;
}
export async function verifyPassword(password:string,hash:string){
 const [algorithm,rounds,salt]=hash.split('$');const iterations=Number(rounds);
 if(algorithm!=='pbkdf2'||!Number.isInteger(iterations)||iterations<100000||iterations>1000000||!salt)return false;
 const actual=await hashPassword(password,salt,iterations);let diff=actual.length^hash.length;
 for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^(hash.charCodeAt(i)||0);return diff===0;
}
export const safeUser=(u:any)=>u?({id:u.id,username:u.username,name:u.name,team:u.team,role:u.role,active:!!u.active,mustChange:!!u.must_change}):null;
