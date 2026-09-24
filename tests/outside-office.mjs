import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const folder=mkdtempSync(join(tmpdir(),'agenda-outside-'));
try {
 await build({entryPoints:['lib/catalog.ts','lib/metrics.ts','lib/export.ts'],bundle:true,platform:'node',format:'esm',outdir:folder});
 const {ROOMS,assignRoom,alternatives,isRoomBooking,DEFAULT_SETTINGS}=await import(pathToFileURL(join(folder,'catalog.js')));
 const {bookingMetrics}=await import(pathToFileURL(join(folder,'metrics.js')));
 const {bookingLocation,exportSheets,printBooking}=await import(pathToFileURL(join(folder,'export.js')));
 const operations=[{id:'a',name:'Poderes',matter:'Personal'},{id:'b',name:'Testamento',matter:'Personal'},{id:'c',name:'Hipoteca',matter:'Crédito'}];
 const office={id:'legacy',folio:1,date:'2027-01-12',time:'10:00',duration:60,people:3,room:'barra',status:'attended',operationIds:['a'],operations:[operations[0]],attendee:'u1',client:'Cliente en oficina'};
 const external={...office,id:'external',folio:2,room:null,outsideOffice:true,people:20,duration:120,operationIds:['a','b'],operations:operations.slice(0,2),client:'Cliente externo'};
 const input={...office,id:'new',status:'confirmed'};
 const fullBlocks=ROOMS.map(r=>({room:r.id,date:office.date,start:'08:00',end:'17:30'}));
 assert.equal(assignRoom(input,[],fullBlocks),null);
 assert.equal(assignRoom({...input,outsideOffice:true},[],[]),null);
 assert.deepEqual(alternatives(external,[],fullBlocks,DEFAULT_SETTINGS),[]);
 assert.equal(assignRoom(input,[office,external],[]).id,'redonda','una cita antigua sigue ocupando su sala');
 assert.equal(assignRoom(input,[{...external,room:'barra'}],[]).id,'barra','externas no ocupan aunque traigan una sala residual');
 assert.equal(isRoomBooking(office),true);
 assert.equal(isRoomBooking({...external,room:'barra'}),false);

 const bookedExternal={...external,id:'booked',status:'confirmed',operationIds:['b'],operations:[operations[1]]};
 const bookings=[office,external,bookedExternal,{...external,id:'cancelled',status:'cancelled'}, {...external,id:'deleted',status:'deleted'}, {...external,id:'future',date:'2027-01-13'}];
 const metrics=bookingMetrics(bookings,operations,'2027-01-06','2027-01-12');
 assert.equal(metrics.scheduled.length,3,'externas confirmadas/atendidas cuentan en el total');
 assert.equal(metrics.attended.length,2);
 assert.equal(metrics.people,23,'suma personas externas atendidas, no canceladas o futuras');
 assert.equal(metrics.people/metrics.attended.length,11.5);
 assert.equal(metrics.roomBookings.length,1,'denominador de salas excluye externas');
 assert.equal(metrics.roomBookings.reduce((n,b)=>n+b.duration,0),60);
 assert.equal(new Set(metrics.scheduled.filter(isRoomBooking).map(b=>b.room)).size,1);
 assert.deepEqual(metrics.ops.map(o=>[o.id,o.count]),[['a',2],['b',1],['c',0]]);
 assert.equal(metrics.scheduled.filter(b=>b.attendee==='u1').length,3,'actividad por integrante incluye externas');

 const sheets=exportSheets({bookings:[office,external],operations,blocks:[]},[]);
 const [header,legacyRow,externalRow]=sheets[0].rows;
 assert.equal(legacyRow[header.indexOf('Fuera de la oficina')],'No');
 assert.equal(externalRow[header.indexOf('Fuera de la oficina')],'Sí');
 assert.equal(externalRow[header.indexOf('Lugar de atención')],'Fuera de la oficina');
 assert.equal(sheets[1].rows.filter(row=>row.at(-1)==='Sí').length,2);
 assert.equal(bookingLocation(office),'Sala Barra');
 let html='';
 printBooking({...external,accessibility:true},'Despacho',{document:{open(){},write(s){html=s},close(){}}});
 assert(html.includes('Fuera de la oficina'));
 assert(!html.includes('Sin asignar'));
 assert(!html.includes('Prioridad por discapacidad solicitada'));
 assert(html.includes('Confirmación de cita'));
 console.log('PASS: asignación, compatibilidad histórica, métricas generales/salas, exportación y PDF de atenciones externas.');
} finally {rmSync(folder,{recursive:true,force:true});}
