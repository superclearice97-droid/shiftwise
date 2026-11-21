import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{userId:text('user_id').primaryKey(),payload:text('payload').notNull(),version:integer('version').notNull().default(0)});
// Phone notifications: a device's push address and its queued reminders. Payloads are encrypted by the device.
export const pushSubscriptions=sqliteTable('push_subscriptions',{id:text('id').primaryKey(),userId:text('user_id').notNull(),endpoint:text('endpoint').notNull(),origin:text('origin').notNull(),createdAt:integer('created_at').notNull()},t=>[index('push_subscriptions_user').on(t.userId)]);
export const pushQueue=sqliteTable('push_queue',{id:text('id').primaryKey(),subscriptionId:text('subscription_id').notNull(),userId:text('user_id').notNull(),sendAt:integer('send_at').notNull(),payload:text('payload').notNull()},t=>[index('push_queue_send_at').on(t.sendAt),index('push_queue_subscription').on(t.subscriptionId)]);
