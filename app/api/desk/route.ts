import {db} from '@/db/raw';
import {CATALOG,DEFAULT_SETTINGS,ROOMS,minutes,today,localNow,assignRoom,alternatives} from '@/lib/catalog';
import {digest,hashPassword,verifyPassword,token,safeUser} from '@/lib/auth';
export const dynamic='force-dynamic';
const json=(v:any,status=200,headers:any={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store',...headers}});
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status});};
const clean=(s:any,max=180)=>typeof s==='string'?s.trim().slice(0,max):'';
const id=()=>crypto.randomUUID();
const elevated=(u:any)=>['admin','ceo'].includes(u.role);
const requireAdmin=(u:any)=>{if(!elevated(u))fail('Esta acción requiere CEO o Admin.',403);};
const cookie=(req:Request)=>req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('desk_session='))?.slice(13)||'';
async function current(req:Request){const t=cookie(req);if(!t)return null;return db().prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1').bind(await digest(t),Date.now()).first<any>();}
async function snapshot(includeAudit=false){
 const result=await db().batch([db().prepare('SELECT value FROM revision WHERE id=1'),db().prepare('SELECT * FROM records'),db().prepare('SELECT id,username,name,team,role,active,must_change FROM users'),...(includeAudit?[db().prepare('SELECT * FROM audit ORDER BY id DESC')]:[])]);
 const records=result[1].results.map((r:any)=>({...JSON.parse(r.data),id:r.id,kind:r.kind}));
 return {audit:includeAudit?result[3].results:undefined,rev:(result[0].results[0] as any)?.value||0,records,bookings:records.filter(x=>x.kind==='booking'),blocks:records.filter(x=>x.kind==='block'),teams:records.filter(x=>x.kind==='team'),operations:records.filter(x=>x.kind==='operation'),settings:records.find(x=>x.kind==='settings')||DEFAULT_SETTINGS,users:result[2].results};
}
const record=(kind:string,data:any)=>db().prepare('INSERT INTO records(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').bind(data.id,kind,JSON.stringify(data));
function audit(actor:string,action:string,entity:string,before:any,after:any){return db().prepare('INSERT INTO audit(at,actor,action,entity,before,after) VALUES(?,?,?,?,?,?)').bind(new Date().toISOString(),actor,action,entity,before?JSON.stringify(before):null,after?JSON.stringify(after):null);}
async function transact(rev:number,statements:any[],actor:string,action:string,entity:string,before:any,after:any){
 const marker=id();
 await db().batch([
 db().prepare('INSERT INTO guard(id,valid) VALUES(?,CASE WHEN (SELECT value FROM revision WHERE id=1)=? THEN 1 ELSE 0 END)').bind(marker,rev),
 ...statements,audit(actor,action,entity,before,after),db().prepare('UPDATE revision SET value=value+1 WHERE id=1'),db().prepare('DELETE FROM guard WHERE id=?').bind(marker)]);
}
const dateValid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const timeValid=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
function validateBooking(b:any,s:any,allowPast=false){
 if(!clean(b.client))fail('Indica el nombre del cliente.');
 if(!s.users.some((u:any)=>u.id===b.attendee&&u.active))fail('Selecciona una persona activa del despacho.');
 if(!dateValid(b.date)||!timeValid(b.time))fail('Fecha u hora no válida.');
 if(!allowPast&&(b.date<today()||(b.date===today()&&minutes(b.time)<minutes(localNow()))))fail('Elige una fecha y hora futuras.');
 if(!Number.isInteger(b.people)||b.people<1||b.people>100)fail('Indica entre 1 y 100 personas. Los grupos de más de 16 requieren lista de espera.');
 if(!Number.isInteger(b.duration)||b.duration<15||b.duration>600||b.duration%15)fail('La duración debe ser de 15 a 600 minutos, en intervalos de 15.');
 if(minutes(b.time)<minutes(s.settings.open)||minutes(b.time)+b.duration>minutes(s.settings.close))fail('La cita debe quedar dentro del horario de atención.');
 if(!Array.isArray(b.operationIds)||!b.operationIds.length||b.operationIds.length>100)fail('Selecciona al menos una operación.');
 if(b.operationIds.some((x:any)=>!s.operations.some((o:any)=>o.id===x&&o.active)))fail('Una operación ya no está activa. Revisa la selección.');
}
async function sessionResponse(req:Request,u:any){const t=token();await db().batch([db().prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),db().prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').bind(await digest(t),u.id,Date.now()+8*3600e3)]);return json({user:safeUser(u)},200,{'Set-Cookie':`desk_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${new URL(req.url).protocol==='https:'?'; Secure':''}`});}
export async function GET(req:Request){try{
 const count=await db().prepare('SELECT count(*) n FROM users').first<any>();if(!count.n)return json({setup:true});
 const u=await current(req);if(!u)return json({login:true},401);
 if(u.must_change)return json({user:safeUser(u)});
 const exporting=new URL(req.url).searchParams.get('export')==='1';if(exporting)requireAdmin(u);
 const s=await snapshot(exporting);
 if(new URL(req.url).searchParams.get('audit')==='1'){requireAdmin(u);const logs=await db().prepare('SELECT * FROM audit ORDER BY id DESC').all();return json({audit:logs.results});}
 return json({user:safeUser(u),...(exporting?{audit:s.audit}:{}),...Object.fromEntries(['bookings','blocks','teams','operations','settings'].map(k=>[k,(s as any)[k]])),users:s.users.map(safeUser)});
 }catch(e:any){console.error('desk GET',e.message);return json({error:e.status?e.message:'No se pudo cargar la agenda. Intenta nuevamente.'},e.status||503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)fail('Origen no autorizado.',403);
 if(!req.headers.get('content-type')?.includes('application/json'))fail('Formato no válido.',415);
 const raw=await req.text();if(raw.length>60000)fail('Solicitud demasiado grande.',413);const b=JSON.parse(raw),action=clean(b.action,40);
 if(action==='setup'){
 if((await db().prepare('SELECT count(*) n FROM users').first<any>()).n)fail('La configuración inicial ya se completó.',409);
 const username=clean(b.username).toUpperCase(),name=clean(b.name);if(!/^[A-Z0-9._-]{2,30}$/.test(username)||!name||typeof b.password!=='string'||b.password.length<12||b.password.length>200)fail('Indica nombre, usuario de 2 a 30 caracteres y contraseña de al menos 12 caracteres.');
 const u={id:id(),username,name,team:'team-admin',role:'ceo',active:1,must_change:0};
 await db().batch([db().prepare('INSERT INTO revision(id,value) VALUES(1,1)'),db().prepare('INSERT INTO users(id,username,name,team,role,hash,active,must_change) VALUES(?,?,?,?,?,?,1,0)').bind(u.id,username,name,u.team,u.role,await hashPassword(b.password)),record('team',{id:'team-admin',name:'Dirección'}),record('team',{id:'team-16',name:'Equipo 16'}),record('settings',{id:'settings',...DEFAULT_SETTINGS}),...CATALOG.map(o=>record('operation',o)),audit(username,'CONFIGURACIÓN INICIAL','despacho',null,{user:safeUser(u),operations:CATALOG.length})]);return sessionResponse(req,u);
 }
 if(action==='login'){
 const username=clean(b.username).toUpperCase(),key=await digest(username+'|'+(req.headers.get('cf-connecting-ip')||'local'));
 const at=await db().prepare('SELECT * FROM attempts WHERE key=?').bind(key).first<any>();if(at&&at.until>Date.now()&&at.count>=8)fail('Demasiados intentos. Intenta en 15 minutos.',429);
 const u=await db().prepare('SELECT * FROM users WHERE username=? AND active=1').bind(username).first<any>();
 if(typeof b.password!=='string'||b.password.length>200||!u||!await verifyPassword(b.password,u.hash)){
 await db().batch([db().prepare('INSERT INTO attempts(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<? THEN 1 ELSE count+1 END,until=?').bind(key,Date.now()+900e3,Date.now(),Date.now()+900e3),audit(username||'desconocido','ACCESO FALLIDO','sesión',null,null)]);fail('Usuario o contraseña incorrectos.',401);}
 await db().batch([db().prepare('DELETE FROM attempts WHERE key=?').bind(key),audit(u.username,'INICIAR SESIÓN','sesión',null,null)]);return sessionResponse(req,u);
 }
 const u=await current(req);if(!u)fail('La sesión expiró. Vuelve a ingresar.',401);
 if(action==='logout'){await db().batch([db().prepare('DELETE FROM sessions WHERE token=?').bind(await digest(cookie(req))),audit(u.username,'CERRAR SESIÓN','sesión',null,null)]);return json({ok:true},200,{'Set-Cookie':'desk_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
 if(u.must_change&&action!=='password')fail('Debes cambiar tu contraseña temporal.',403);
 if(['print','export'].includes(action)){if(action==='export')requireAdmin(u);await audit(u.username,action==='print'?'IMPRIMIR':'EXPORTAR',clean(b.entity)||'agenda',null,{format:clean(b.format)}).run();return json({ok:true});}
 for(let attempt=0;attempt<8;attempt++){
 const s=await snapshot();const live=await current(req);if(!live)fail('La sesión expiró. Vuelve a ingresar.',401);Object.assign(u,live);if(u.must_change&&action!=='password')fail('Debes cambiar tu contraseña temporal.',403);let statements:any[]=[],before:any=null,after:any=null,entity='',label='';let extra:any={};
 if(action==='booking'){
 before=b.id?s.bookings.find(x=>x.id===b.id):null;
 if(b.id&&!before)fail('Cita no encontrada.',404);
 if(before&&b.expectedUpdatedAt!==before.updatedAt)fail('Otra persona modificó esta cita. Ciérrala y ábrela nuevamente para revisar los cambios.',409);
 if(before&&!elevated(u)&&before.team!==u.team)fail('Solo puedes modificar citas de tu equipo.',403);
 if(before&&!['confirmed','waiting'].includes(before.status))fail('Esta cita ya no admite cambios.',409);
 const attendee=s.users.find((x:any)=>x.id===b.attendee) as any;
 if(!elevated(u)&&attendee?.team!==u.team)fail('Selecciona una persona de tu equipo.',403);
 const ids=[...new Set(b.operationIds)] as string[];
 after={id:before?.id||id(),client:clean(b.client),attendee:b.attendee,attendeeName:attendee?.name,team:attendee?.team,teamName:s.teams.find(t=>t.id===attendee?.team)?.name,date:b.date,time:b.time,duration:Number(b.duration),people:Number(b.people),accessibility:!!b.accessibility,operationIds:ids,notes:clean(b.notes,1000)};
 validateBooking(after,s);
 const room=assignRoom(after,s.bookings,s.blocks);
 if(!room&&!b.waiting)return json({conflict:true,alternatives:alternatives(after,s.bookings,s.blocks,s.settings),error:after.people>16?'El grupo supera la capacidad máxima de 16 personas.':'No hay sala disponible para ese horario.'},409);
 const folio=before?.folio||Math.max(0,...s.bookings.map(x=>x.folio))+1;
 after={...after,folio,room:room?.id||null,status:room?'confirmed':'waiting',operations:ids.map(x=>{const o=s.operations.find(y=>y.id===x);return{id:o.id,name:o.name,matter:o.matter}}),createdAt:before?.createdAt||new Date().toISOString(),createdBy:before?.createdBy||u.username,updatedAt:new Date().toISOString(),updatedBy:u.username};
 statements=[record('booking',after)];entity=`C-${String(folio).padStart(6,'0')}`;label=before?'REAGENDAR CITA':room?'CREAR CITA':'AGREGAR A ESPERA';extra={booking:after};
 }else if(action==='status'||action==='retry'){
 before=s.bookings.find(x=>x.id===b.id);if(!before)fail('Cita no encontrada.',404);
 if(!elevated(u)&&before.team!==u.team)fail('Solo puedes modificar citas de tu equipo.',403);
 if(!['confirmed','waiting'].includes(before.status)&&!(action==='status'&&b.status==='deleted'&&before.status==='cancelled'))fail('La cita ya cambió de estado.',409);
 after={...before,updatedBy:u.username,updatedAt:new Date().toISOString()};
 if(action==='retry'){
 if(before.status!=='waiting')fail('La cita no está en espera.');validateBooking(before,s);const room=assignRoom(before,s.bookings,s.blocks);
 if(!room)return json({conflict:true,error:'Aún no hay sala disponible.',alternatives:alternatives(before,s.bookings,s.blocks,s.settings)},409);after.room=room.id;after.status='confirmed';label='ASIGNAR DESDE ESPERA';
 }else{
 if(!['cancelled','attended','deleted'].includes(b.status))fail('Estado inválido.');
 if(b.status==='attended'&&(before.status!=='confirmed'||before.date>today()||(before.date===today()&&minutes(before.time)>minutes(localNow()))))fail('Puedes marcar atendida cuando llegue la hora de una cita confirmada.');
 if(b.status==='deleted')requireAdmin(u);
 if(['cancelled','deleted'].includes(b.status)&&!clean(b.reason))fail('Indica el motivo.');after.status=b.status;after.reason=clean(b.reason,500);label={cancelled:'CANCELAR CITA',attended:'MARCAR ATENDIDA',deleted:'ELIMINAR CITA'}[b.status as 'cancelled'];
 }
 statements=[record('booking',after)];entity=`C-${String(before.folio).padStart(6,'0')}`;extra={booking:after};
 }else if(action==='block'){
 requireAdmin(u);if(!ROOMS.some(r=>r.id===b.room)||!dateValid(b.date)||!timeValid(b.start)||!timeValid(b.end)||minutes(b.start)>=minutes(b.end)||!clean(b.reason))fail('Revisa sala, fecha, horario y motivo.');
 if(b.date<today()||minutes(b.start)<minutes(s.settings.open)||minutes(b.end)>minutes(s.settings.close))fail('El bloqueo debe ser futuro y estar dentro del horario de atención.');
 if(s.bookings.some(x=>x.date===b.date&&x.room===b.room&&['confirmed','attended'].includes(x.status)&&minutes(x.time)<minutes(b.end)&&minutes(x.time)+x.duration>minutes(b.start)))fail('Hay una cita en ese rango. Reagéndala antes de bloquear.',409);
 if(s.blocks.some(x=>x.date===b.date&&x.room===b.room&&minutes(x.start)<minutes(b.end)&&minutes(x.end)>minutes(b.start)))fail('Ya existe un bloqueo en ese rango.',409);
 after={id:id(),room:b.room,date:b.date,start:b.start,end:b.end,reason:clean(b.reason,500),createdBy:u.username};statements=[record('block',after)];entity=after.id;label='BLOQUEAR SALA';
 }else if(action==='unblock'){
 requireAdmin(u);before=s.blocks.find(x=>x.id===b.id);if(!before)fail('Bloqueo no encontrado.');statements=[db().prepare('DELETE FROM records WHERE id=? AND kind=?').bind(b.id,'block')];entity=b.id;label='DESBLOQUEAR SALA';
 }else if(action==='team'){
 requireAdmin(u);if(!clean(b.name))fail('Indica el nombre del equipo.');before=s.teams.find(x=>x.id===b.id)||null;after={id:before?.id||id(),name:clean(b.name)};statements=[record('team',after)];entity=after.name;label=before?'EDITAR EQUIPO':'CREAR EQUIPO';
 }else if(action==='users'){
 requireAdmin(u);if(!s.teams.some(x=>x.id===b.team))fail('Selecciona un equipo.');const names=clean(b.names,3000).split(/[\n,;]/).map((x:string)=>x.trim().toUpperCase()).filter(Boolean);
 if(!names.length||names.length>30||new Set(names).size!==names.length||names.some((n:string)=>!/^[A-Z0-9._-]{2,30}$/.test(n)))fail('Usa de 1 a 30 usuarios únicos, de 2 a 30 letras, números, puntos o guiones.');
 if(s.users.some((x:any)=>names.includes(x.username)))fail('Uno de esos usuarios ya existe.');
 const credentials=[];const added=[];
 for(const username of names){const password=token().slice(0,16)+'!aA';const newUser={id:id(),username,name:username,team:b.team,role:'staff'};statements.push(db().prepare('INSERT INTO users(id,username,name,team,role,hash,active,must_change) VALUES(?,?,?,?,?,?,1,1)').bind(newUser.id,username,username,b.team,'staff',await hashPassword(password)));credentials.push({username,password});added.push(newUser);}
 after=added;entity=b.team;label='CREAR USUARIOS';extra={credentials};
 }else if(action==='user'){
 requireAdmin(u);before=s.users.find((x:any)=>x.id===b.id);if(!before)fail('Usuario no encontrado.');
 if(!s.teams.some(x=>x.id===b.team)||!['staff','admin','ceo'].includes(b.role)||!clean(b.name))fail('Revisa los datos del usuario.');
 if(before.id===u.id&&(!b.active||b.role!==u.role))fail('No puedes desactivar ni cambiar el rol de tu propia cuenta.');
 if(before.role==='ceo'&&(!b.active||b.role!=='ceo')&&s.users.filter((x:any)=>x.role==='ceo'&&x.active).length<2)fail('Debe quedar al menos un CEO activo.');
 after={...before,name:clean(b.name),team:b.team,role:b.role,active:b.active?1:0};statements=[db().prepare('UPDATE users SET name=?,team=?,role=?,active=? WHERE id=?').bind(after.name,after.team,after.role,after.active,b.id),db().prepare('DELETE FROM sessions WHERE user_id=?').bind(b.id)];entity=before.username;label='EDITAR USUARIO';
 }else if(action==='resetPassword'){
 requireAdmin(u);before=s.users.find((x:any)=>x.id===b.id);if(!before)fail('Usuario no encontrado.');if(before.id===u.id)fail('Utiliza Cambiar mi contraseña.');const password=token().slice(0,16)+'!aA';statements=[db().prepare('UPDATE users SET hash=?,must_change=1 WHERE id=?').bind(await hashPassword(password),b.id),db().prepare('DELETE FROM sessions WHERE user_id=?').bind(b.id)];entity=before.username;label='RESTABLECER CONTRASEÑA';after={mustChange:true};before=null;extra={credentials:[{username:entity,password}]};
 }else if(action==='password'){
 if(typeof b.password!=='string'||b.password.length<12||b.password.length>200||typeof b.current!=='string'||!await verifyPassword(b.current,u.hash))fail('Revisa tu contraseña actual; la nueva debe tener al menos 12 caracteres.');
 statements=[db().prepare('UPDATE users SET hash=?,must_change=0 WHERE id=?').bind(await hashPassword(b.password),u.id),db().prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').bind(u.id,await digest(cookie(req)))];entity=u.username;label='CAMBIAR CONTRASEÑA';after={changed:true};
 }else if(action==='operation'){
 requireAdmin(u);before=s.operations.find(x=>x.id===b.id)||null;if(!clean(b.name)||!clean(b.matter))fail('Indica operación y materia.');after={id:before?.id||id(),name:clean(b.name),matter:clean(b.matter),active:b.active!==false};statements=[record('operation',after)];entity=after.id;label=before?'EDITAR CATÁLOGO':'AGREGAR OPERACIÓN';
 }else if(action==='settings'){
 requireAdmin(u);if(!clean(b.name)||!timeValid(b.open)||!timeValid(b.close)||minutes(b.close)<=minutes(b.open)||![15,30,45,60,90,120].includes(Number(b.duration)))fail('Revisa nombre, horario y duración inicial.');
 if(s.bookings.some(x=>['confirmed','waiting'].includes(x.status)&&x.date>=today()&&(minutes(x.time)<minutes(b.open)||minutes(x.time)+x.duration>minutes(b.close))))fail('El nuevo horario dejaría citas futuras fuera de atención. Reagéndalas primero.',409);
 before=s.settings;after={...s.settings,name:clean(b.name),open:b.open,close:b.close,duration:Number(b.duration)};statements=[record('settings',after)];entity='despacho';label='CONFIGURAR AGENDA';
 }else fail('Acción no válida.');
 try{await transact(s.rev,statements,u.username,label,entity,before,after);return json({ok:true,...extra});}catch(e:any){if(/valid_mutation/.test(e.message)&&attempt<7)continue;throw e;}
 }
 return json({error:'La agenda cambió mientras guardabas. Intenta otra vez.'},409);
 }catch(e:any){console.error('desk POST',e.message);return json({error:e.status?e.message:/UNIQUE|valid_mutation/.test(e.message)?'El registro cambió o ya existe. Actualiza e intenta nuevamente.':'No se pudo guardar. Tus datos permanecen en el formulario.'},e.status||409);}}
