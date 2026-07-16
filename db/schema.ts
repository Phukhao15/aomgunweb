import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("users_email_idx").on(table.email)]);

export const families = sqliteTable("families", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("families_owner_idx").on(table.ownerUserId)]);

export const familyMembers = sqliteTable("family_members", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("parent"),
  invitedByUserId: text("invited_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("family_members_family_user_idx").on(table.familyId, table.userId)]);

export const parentInvites = sqliteTable("parent_invites", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => users.id),
  codeHash: text("code_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("parent_invites_code_hash_idx").on(table.codeHash)]);

export const children = sqliteTable("children", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  avatar: text("avatar").notNull().default("🧒🏻"),
  nickname: text("nickname"),
  pinSalt: text("pin_salt"),
  pinHash: text("pin_hash"),
  dailyBudget: integer("daily_budget").notNull().default(20000),
  weeklyBudget: integer("weekly_budget").notNull().default(100000),
  monthlyBudget: integer("monthly_budget").notNull().default(350000),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  childId: text("child_id").notNull().references(() => children.id),
  codeHash: text("code_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("invites_code_hash_idx").on(table.codeHash)]);

export const childSessions = sqliteTable("child_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  childId: text("child_id").notNull().references(() => children.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => children.id),
  actorType: text("actor_type").notNull(),
  kind: text("kind").notNull(),
  amount: integer("amount").notNull(),
  category: text("category").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const savingsGoals = sqliteTable("savings_goals", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => children.id),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(),
  savedAmount: integer("saved_amount").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
