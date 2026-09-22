import {env} from 'cloudflare:workers';
export function db(){if(!env.DB)throw new Error('Base de datos no disponible');return env.DB;}
