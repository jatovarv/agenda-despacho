import {mkdirSync,cpSync,existsSync} from 'node:fs';
const root='.next/standalone';
if(!existsSync(root+'/server.js'))throw new Error('Falta la compilación standalone');
mkdirSync(root+'/.next',{recursive:true});
for(const [from,to] of [['.next/static',root+'/.next/static'],['public',root+'/public'],['drizzle',root+'/drizzle'],['db/sqlite.mjs',root+'/db/sqlite.mjs'],['scripts',root+'/scripts']])cpSync(from,to,{recursive:true});
console.log('Paquete de ejecución preparado.');
