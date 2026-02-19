# Database Integration

Guide for setting up database connections and managing schemas with Better Auth.

## Direct Connections

### SQLite

```ts
import Database from "better-sqlite3";

export const auth = betterAuth({
  database: new Database("./sqlite.db"),
});
```

Or with Bun:

```ts
import { Database } from "bun:sqlite";

export const auth = betterAuth({
  database: new Database("./sqlite.db"),
});
```

### PostgreSQL

```ts
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
});
```

### MySQL

```ts
import mysql from "mysql2/promise";

export const auth = betterAuth({
  database: mysql.createPool({
    uri: process.env.DATABASE_URL,
  }),
});
```

## ORM Adapters

### Prisma

```ts
import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql", // or "mysql", "sqlite"
  }),
});
```

**Critical**: Better Auth uses adapter model names, NOT underlying table names. If Prisma model is `User` mapping to table `users`, use `modelName: "user"` (Prisma reference), not `"users"`.

### Drizzle

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const db = drizzle(process.env.DATABASE_URL!);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
  }),
});
```

### MongoDB

```ts
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

const client = new MongoClient(process.env.DATABASE_URL!);
const db = client.db("myapp");

export const auth = betterAuth({
  database: mongodbAdapter(db),
});
```

## Schema Management

### Built-in Kysely (Direct Apply)

```bash
npx @better-auth/cli@latest migrate
```

Applies schema changes directly to the database.

### Prisma

```bash
# Generate Prisma schema additions
npx @better-auth/cli@latest generate --output prisma/schema.prisma

# Apply with Prisma
npx prisma migrate dev
```

### Drizzle

```bash
# Generate Drizzle schema file
npx @better-auth/cli@latest generate --output src/db/auth-schema.ts

# Apply with Drizzle Kit
npx drizzle-kit push
```

**Important**: Re-run schema generation/migration after adding or changing plugins.

## Secondary Storage

Use Redis or KV stores for session storage and rate limiting:

```ts
export const auth = betterAuth({
  secondaryStorage: {
    get: async (key) => redis.get(key),
    set: async (key, value, ttl) => {
      if (ttl) await redis.set(key, value, "EX", ttl);
      else await redis.set(key, value);
    },
    delete: async (key) => redis.del(key),
  },
});
```

When `secondaryStorage` is defined, sessions go there by default (not the database). Set `session.storeSessionInDatabase: true` to also persist to the database.

## Custom ID Generation

```ts
export const auth = betterAuth({
  advanced: {
    database: {
      generateId: "uuid", // or "serial", false, or custom function
    },
  },
});
```
