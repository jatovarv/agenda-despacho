import {mkdirSync,existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {resolve,join} from 'node:path';
if(existsSync('.env'))loadEnvFile('.env');
const {backupDatabase}=await import('../db/sqlite.mjs');
const directory=resolve(process.env.BACKUP_DIR||'./backups');mkdirSync(directory,{recursive:true,mode:0o700});
const name='agenda-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';
console.log(await backupDatabase(join(directory,name)));
