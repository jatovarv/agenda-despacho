import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
if(existsSync('.env'))loadEnvFile('.env');
const {openDatabase,setupCode}=await import('../db/sqlite.mjs');
const count=openDatabase().prepare('SELECT count(*) AS n FROM users').get().n;
if(count) console.log('La cuenta de Dirección ya fue creada. Ingresa con tu usuario y contraseña.');
else console.log('Código de instalación (solo para crear la primera cuenta):\n'+setupCode());
