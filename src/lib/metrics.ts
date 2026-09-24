import {isRoomBooking} from './catalog';

// General activity includes external appointments; room usage has its own denominator.
export function bookingMetrics(bookings:any[],operations:any[],start:string,end:string){
 const all=bookings.filter(b=>b.date>=start&&b.date<=end&&b.status!=='deleted');
 const scheduled=all.filter(b=>['confirmed','attended'].includes(b.status));
 const attended=all.filter(b=>b.status==='attended');
 const roomBookings=scheduled.filter(isRoomBooking);
 const people=attended.reduce((n,b)=>n+b.people,0);
 const ops=[...new Map([...operations,...attended.flatMap(b=>b.operations)].map(o=>[o.id,o])).values()]
  .map(o=>({...o,count:attended.filter(b=>b.operationIds.includes(o.id)).length}))
  .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 return {all,scheduled,attended,roomBookings,people,ops};
}
