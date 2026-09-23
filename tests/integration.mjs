import assert from 'node:assert/strict';
const base=process.env.DESK_TEST_URL||'http://127.0.0.1:3187';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Solo se ejecuta contra la base local de pruebas');
let cookie='';let checks=0;
async function call(body,c=cookie,audit=false){const r=await fetch(base+'/api/desk'+(audit?'?audit=1':''),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(c?{Cookie:c}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...data};}
function check(v,label){assert(v,label);checks++;console.log('PASS',label);}
const initial=await call();let login;
if(initial.setup){const rejected=await call({action:'setup',setupCode:'invalid',name:'Intruso',username:'BAD_SETUP',password:'Should-not-create-2026!'});check(rejected.status===403,'instalación protegida con código del servidor');}
if(initial.setup)login=await call({action:'setup',setupCode:process.env.SETUP_CODE,name:'Dirección de prueba',username:'QA_ADMIN',password:'Local-QA-only-2026!'});
else login=await call({action:'login',username:'QA_ADMIN',password:'Local-QA-only-2026!'});
check(login.status===200,'login / configuración inicial');
const originRejected=await fetch(base+'/api/desk',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://externo.invalid',Cookie:cookie},body:JSON.stringify({action:'logout'})});check(originRejected.status===403,'rechaza origen externo');
const originAccepted=await fetch(base+'/api/desk',{method:'POST',headers:{'Content-Type':'application/json',Origin:process.env.APP_ORIGIN||base,Cookie:cookie},body:JSON.stringify({action:'print',entity:'prueba de origen',format:'PDF'})});check(originAccepted.status===200,'acepta dirección configurada detrás de proxy');
const adminCookie=cookie;let d=await call();check(d.settings.open==='08:00'&&d.settings.close==='17:30'&&d.settings.duration===60,'horario 08:00–17:30 y duración 60');check(d.operations.length===44,'44 operaciones del catálogo');
const last=[new Date().toISOString().slice(0,10),...d.bookings.map(b=>b.date)].sort().at(-1);const dt=new Date(Date.parse(last+'T12:00:00Z')+86400e3).toISOString().slice(0,10),run=Date.now();const make=(n,time='10:00')=>({action:'booking',client:`Prueba ${run}-${n}`,attendee:d.user.id,date:dt,time,duration:60,people:4,operationIds:d.operations.slice(0,2).map(o=>o.id)});
const reservations=await Promise.all(Array.from({length:6},(_,i)=>call(make(i))));const accepted=reservations.filter(r=>r.booking?.status==='confirmed');check(accepted.length===5,'cinco reservas concurrentes y ninguna doble asignación');check(new Set(accepted.map(r=>r.booking.room)).size===5,'cada reserva simultánea ocupa una sala distinta');const conflict=reservations.find(r=>r.conflict);check(conflict?.alternatives.length===4,'sin disponibilidad ofrece 4 alternativas');
// Las cinco salas ya están ocupadas: la atención externa debe confirmarse igual.
const external=await call({...make('externa'),outsideOffice:true,people:20,waiting:true,room:'barra'});
check(external.booking?.outsideOffice===true&&external.booking.status==='confirmed'&&external.booking.room===null,'externa con 20 personas se confirma sin sala aunque todas estén ocupadas');
const stillFull=await call(make('sigue-lleno'));check(stillFull.conflict,'externa no libera ni sustituye salas de otras citas');
const invalidOutside=await call({...make('tipo-externa'),outsideOffice:'false'});check(invalidOutside.status===400,'fuera de oficina exige un booleano');
const externalToOffice=await call({...external.booking,action:'booking',outsideOffice:false,people:4,expectedUpdatedAt:external.booking.updatedAt});
check(externalToOffice.conflict,'convertir externa a oficina exige disponibilidad');
let unchanged=await call();check(unchanged.bookings.find(b=>b.id===external.booking.id).outsideOffice===true,'conversión fallida conserva la cita externa');
const externalEdit=await call({...external.booking,action:'booking',notes:'Seguimiento externo',expectedUpdatedAt:external.booking.updatedAt});
check(externalEdit.booking?.folio===external.booking.folio&&externalEdit.booking.room===null,'editar externa conserva folio y ausencia de sala');
const waiting=await call({...make('espera'),waiting:true});check(waiting.booking?.status==='waiting','lista de espera');
const extraWaiting=await call({...make('espera-a-externa'),waiting:true});
const waitingToOutside=await call({...extraWaiting.booking,action:'booking',outsideOffice:true,expectedUpdatedAt:extraWaiting.booking.updatedAt});
check(waitingToOutside.booking?.status==='confirmed'&&waitingToOutside.booking.room===null&&waitingToOutside.booking.folio===extraWaiting.booking.folio,'convertir espera en externa confirma sin sala y conserva folio');
const cancelledExternal=await call({action:'status',id:waitingToOutside.booking.id,status:'cancelled',reason:'Fin de prueba externa'});
check(cancelledExternal.booking?.outsideOffice===true&&cancelledExternal.booking.room===null&&cancelledExternal.booking.status==='cancelled','se puede cancelar una cita externa sin asignarle sala');
const saved=accepted[0].booking;check(saved.operations.length===2,'múltiples operaciones por cita');
const blockConflict=await call({action:'block',room:saved.room,date:dt,start:'10:00',end:'11:00',reason:'Prueba de choque'});check(blockConflict.status===409,'bloqueo rechaza cita existente');
await call({action:'status',id:saved.id,status:'cancelled',reason:'Liberar en prueba'});const retried=await call({action:'retry',id:waiting.booking.id});check(retried.booking?.room===saved.room,'asignación desde espera al liberar sala');
const boundary=await call(make('limite','11:00'));check(boundary.booking?.room==='barra','intervalos consecutivos no chocan');
const accessible=await call({...make('accesible','11:00'),accessibility:true});check(accessible.booking?.room==='anexo','discapacidad prioriza Anexo antes de Redonda');
const blocked=await call({action:'block',room:'barra',date:dt,start:'13:00',end:'14:00',reason:'Bloqueo de prueba'});check(blocked.ok,'bloqueo válido');const avoid=await call(make('bloqueo','13:00'));check(avoid.booking?.room==='redonda','asignación evita sala bloqueada');
const overtime=await call({...make('tarde','17:00'),duration:60});check(overtime.status===400,'no permite terminar después de 17:30');
const large=await call({...make('grupo','15:00'),people:17});check(large.conflict&&large.alternatives.length===0,'grupo mayor de 16 sin asignación');
const stale=await call({...make('edición','11:00'),id:boundary.booking.id,expectedUpdatedAt:'old'});check(stale.status===409,'edición desactualizada se rechaza');
const edited=await call({...boundary.booking,action:'booking',time:'14:30',expectedUpdatedAt:boundary.booking.updatedAt});check(edited.booking?.time==='14:30','reagendar conserva folio');check(edited.booking.folio===boundary.booking.folio,'folio estable al modificar');
const impossibleAttend=await call({action:'status',id:edited.booking.id,status:'attended'});check(impossibleAttend.status===400,'no cuenta citas futuras como atendidas');
// Conversión de una cita de oficina libera la sala; volver a oficina asigna nuevamente.
const officeCopy=edited.booking;
const toOutside=await call({...officeCopy,action:'booking',outsideOffice:true,expectedUpdatedAt:officeCopy.updatedAt});
check(toOutside.booking?.room===null&&toOutside.booking.status==='confirmed'&&toOutside.booking.folio===officeCopy.folio,'marcar externa libera sala y conserva folio');
const released=await call({action:'block',room:officeCopy.room,date:dt,start:'14:30',end:'15:30',reason:'Sala liberada por atención externa'});
check(released.ok,'se puede bloquear la sala que dejó libre una cita externa');
const backInside=await call({...toOutside.booking,action:'booking',outsideOffice:false,expectedUpdatedAt:toOutside.booking.updatedAt});
check(backInside.booking?.room&&backInside.booking.room!==officeCopy.room&&!backInside.booking.outsideOffice,'volver a oficina evita el bloqueo y asigna otra sala');
const conversionLogs=await call(undefined,adminCookie,true);
check(conversionLogs.audit.some(a=>a.action==='REAGENDAR CITA'&&a.before&&a.after&&JSON.parse(a.before).id===officeCopy.id&&JSON.parse(a.after).outsideOffice===true&&JSON.parse(a.after).room===null),'auditoría conserva cambio a externa y sala anterior');
// El dato debe sobrevivir a otra petición y estar en la exportación completa.
const externalSnapshot=await call();check(externalSnapshot.bookings.find(b=>b.id===external.booking.id)?.outsideOffice===true,'atención externa persiste en agenda');
const batchUsers=await call({action:'users',team:'team-16',names:`QA_${run}`});check(batchUsers.credentials?.length===1,'alta de usuario con contraseña temporal');const credentials=batchUsers.credentials[0];
let staff=await call({action:'login',...credentials});check(staff.user?.mustChange,'primer acceso exige cambiar contraseña');const staffCookie=cookie;const forced=await call(undefined,staffCookie);check(forced.user.mustChange&&!forced.bookings,'cuenta temporal no recibe datos de agenda');
await call({action:'password',current:credentials.password,password:'New-local-QA-2026!'},staffCookie);const forbidden=await call({action:'block',room:'barra',date:dt,start:'15:00',end:'16:00',reason:'No autorizado'},staffCookie);check(forbidden.status===403,'rol Equipo no puede bloquear salas');const auditForbidden=await call(undefined,staffCookie,true);check(auditForbidden.status===403,'auditoría reservada a Admin/CEO');
const crossTeamExternal=await call({...externalEdit.booking,action:'booking',expectedUpdatedAt:externalEdit.booking.updatedAt},staffCookie);
check(crossTeamExternal.status===403,'una cita externa respeta permisos de equipo');
const crossTeam=await call({action:'status',id:edited.booking.id,status:'cancelled',reason:'No autorizado'},staffCookie);check(crossTeam.status===403,'restricción de edición por equipo');
const logs=await call(undefined,adminCookie,true);check(logs.audit.some(a=>a.action==='REAGENDAR CITA'&&a.before&&a.after),'auditoría guarda antes y después');check(!JSON.stringify(logs.audit).includes(credentials.password),'auditoría no expone contraseñas temporales');
const anon=await call(undefined,'');check(anon.status===401&&!anon.bookings,'API privada sin sesión');
const exportResponse=await fetch(base+'/api/desk?export=1',{headers:{Cookie:adminCookie}});const exported=await exportResponse.json();check(exportResponse.status===200&&exported.audit.length>0&&exported.bookings.length>0,'exportación consistente de registros y auditoría');
check(exported.bookings.some(b=>b.id===external.booking.id&&b.outsideOffice&&b.room===null),'exportación de API incluye cita externa sin sala');
const data=await call(undefined,adminCookie);const numbers=data.bookings.map(b=>b.folio);check(new Set(numbers).size===numbers.length,'folios únicos');
console.log(`RESULTADO: ${checks} comprobaciones correctas. Datos exclusivamente locales.`);
