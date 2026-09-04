/**
 * Plans module — save and retrieve user-saved workout plans (templates).
 */
import * as db from './db.js';

const STORE = 'plans';

export async function save(plan) {
  if (!plan.id) {
    plan.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  await db.put(STORE, plan);
  return plan;
}

export async function getAll() {
  return db.getAll(STORE);
}

export async function getById(id) {
  return db.get(STORE, id);
}

export async function remove(id) {
  return db.del(STORE, id);
}
