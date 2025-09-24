import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('configurations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('config_id').notNullable();
    t.string('version').notNullable();
    t.string('tenant_id').notNullable();
    t.text('artifact_link');
    t.string('status').notNullable().defaultTo('PENDING');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('outbox_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('event_type').notNullable();
    t.jsonb('payload').notNullable();
    t.string('status').notNullable().defaultTo('PENDING');
    t.integer('attempts').defaultTo(knex.raw('0'));
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('action').notNullable();
    t.jsonb('details');
    t.string('actor');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('outbox_events');
  await knex.schema.dropTableIfExists('configurations');
}
