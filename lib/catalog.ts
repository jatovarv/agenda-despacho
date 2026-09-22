export const ROOMS = [
 {id:'barra',name:'Sala Barra',capacity:5,color:'#2563eb',accessible:true},
 {id:'redonda',name:'Sala Redonda',capacity:5,color:'#7c3aed',accessible:false},
 {id:'anexo',name:'Sala Anexo Not.',capacity:6,color:'#0891b2',accessible:true},
 {id:'rectangular',name:'Sala Rectangular',capacity:7,color:'#d97706',accessible:false},
 {id:'acuerdos',name:'Sala Acuerdos',capacity:16,color:'#0d9488',accessible:false},
];
const groups: Record<string,string[]> = {
 'Societario': ['Constitución de sociedades','Fusión de sociedades','Escisión de sociedades','Transformación de sociedades','Liquidación de sociedades','Protocolización de actas de Asamblea y de Consejo','Constitución de sociedades y asociaciones civiles','Reformas de sociedades y asociaciones civiles','Constitución y reformas de instituciones de asistencia privada (I.A.P)'],
 'Crédito y garantías':['Apertura de crédito','Créditos de habilitación y refaccionarios','Hipoteca'],
 'Personal, familiar y sucesorio':['Testamento','Documento de voluntad anticipada','Nombramiento de tutor cautelar','Poderes','Revocación de poderes','Sucesión testamentaria','Sucesión intestamentaria','Cambio de régimen matrimonial','Adjudicación por herencia'],
 'Inmobiliario y patrimonial':['Cesión de derechos','Compraventa CDMX','Compraventa Edo. de México','Donación','Permuta','Formalización de transmisiones de propiedad','Constitución de régimen de propiedad y condominio','Aportación a sociedades','Fideicomisos','Fusión de predios','Lotificación de predios','Subdivisión de predios','Dación en pago','Transmisión de propiedad en ejecución de fideicomiso'],
 'Fe pública y certificaciones':['Notificaciones','Interpelaciones','Requerimientos','Fe de hechos','Declaraciones','Certificaciones','Protocolización de documentos','Reconocimiento de firma y ratificación de contenido','Certificación de copias con su original']
};
export const CATALOG=Object.entries(groups).flatMap(([matter,names],g)=>names.map((name,i)=>({id:`op-${g+1}-${i+1}`,matter,name,active:true})));
export const DEFAULT_SETTINGS={name:'Agenda del despacho',open:'08:00',close:'17:30',duration:60,timezone:'America/Mexico_City'};
export const minutes=(time:string)=>Number(time.split(':')[0])*60+Number(time.split(':')[1]);
export const clock=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const localNow=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
export function assignRoom(input:any, bookings:any[],blocks:any[]){
 const ordered=input.accessibility?[ROOMS[0],ROOMS[2],ROOMS[1],ROOMS[3],ROOMS[4]]:ROOMS;
 const start=minutes(input.time),end=start+Number(input.duration);
 return ordered.find(r=>r.capacity>=input.people && !bookings.some(b=>b.id!==input.id && b.date===input.date && b.room===r.id && ['confirmed','attended'].includes(b.status) && minutes(b.time)<end && minutes(b.time)+b.duration>start) && !blocks.some(b=>b.date===input.date && b.room===r.id && minutes(b.start)<end && minutes(b.end)>start)) || null;
}
export function alternatives(input:any,bookings:any[],blocks:any[],settings:any){
 const slots=[];
 for(let n=minutes(settings.open);n+input.duration<=minutes(settings.close);n+=15){
  if(n===minutes(input.time)||(input.date===today()&&n<minutes(localNow())))continue;
  const room=assignRoom({...input,time:clock(n)},bookings,blocks);
  if(room)slots.push({time:clock(n),room:room.id,name:room.name});
 }
 return slots.sort((a,b)=>Math.abs(minutes(a.time)-minutes(input.time))-Math.abs(minutes(b.time)-minutes(input.time))||a.time.localeCompare(b.time)).slice(0,4);
}
