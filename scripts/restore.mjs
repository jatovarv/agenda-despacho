import {DatabaseSync} from 'node:sqlite';
import {cpSync,existsSync,unlinkSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
const source=resolve(process.argv[2]||'');
if(!process.argv[2]||!existsSync(source))throw new Error('Indica un respaldo .sqlite existente.');
const data=resolve(process.env.DATA_DIR||'./data');mkdirSync(data,{recursive:true,mode:0o700});
const target=join(data,'agenda.sqlite');if(source===target)throw new Error('El respaldo no puede ser la base activa.');
const copy=join(data,'restore-'+Date.now()+'.sqlite');cpSync(source,copy);
let db;
try {
 db=new DatabaseSync(copy);
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('El respaldo esta dañado.');
 for(const table of ['records','users','audit','sessions','revision','_local_migrations']) {
   if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))throw new Error('No es un respaldo compatible de la agenda.');
 }
 db.exec('BEGIN IMMEDIATE');
 db.prepare('DELETE FROM sessions').run();
 db.prepare('INSERT INTO audit(at,actor,action,entity,before,after) VALUES(?,?,?,?,?,?)').run(new Date().toISOString(),'SERVIDOR','RESTAURAR RESPALDO','base de datos',null,JSON.stringify({sessionsRevoked:true}));
 db.exec('COMMIT');db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();db=null;
 for(const suffix of ['-wal','-shm'])if(existsSync(target+suffix))unlinkSync(target+suffix);
 renameSync(copy,target);
 console.log('Restauración completada; reinicia la agenda.');
} finally {if(db)db.close();if(existsSync(copy))unlinkSync(copy);}
