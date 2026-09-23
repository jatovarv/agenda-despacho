import {sqliteTable,text,integer,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const records=sqliteTable('records',{id:text('id').primaryKey(),kind:text('kind').notNull(),data:text('data').notNull()});
export const users=sqliteTable('users',{id:text('id').primaryKey(),username:text('username').notNull().unique(),name:text('name').notNull(),team:text('team').notNull(),role:text('role').notNull(),hash:text('hash').notNull(),active:integer('active').notNull().default(1),mustChange:integer('must_change').notNull().default(0)});
export const sessions=sqliteTable('sessions',{token:text('token').primaryKey(),userId:text('user_id').notNull(),expires:integer('expires').notNull()});
export const audit=sqliteTable('audit',{id:integer('id').primaryKey({autoIncrement:true}),at:text('at').notNull(),actor:text('actor').notNull(),action:text('action').notNull(),entity:text('entity').notNull(),before:text('before'),after:text('after')});
export const revision=sqliteTable('revision',{id:integer('id').primaryKey(),value:integer('value').notNull()});
export const guard=sqliteTable('guard',{id:text('id').primaryKey(),valid:integer('valid').notNull()},t=>[check('valid_mutation',sql`${t.valid}=1`)]);
export const attempts=sqliteTable('attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),until:integer('until').notNull()});
