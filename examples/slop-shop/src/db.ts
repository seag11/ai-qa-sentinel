import { DatabaseSync } from 'node:sqlite';

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
}

export interface Coupon {
  code: string;
  rate: number;
}

export function openDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL);
    CREATE TABLE coupons (code TEXT PRIMARY KEY, rate REAL NOT NULL);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL
    );
    INSERT INTO products VALUES (1, 'Mechanical keyboard', 120, 10), (2, 'USB-C cable', 15, 100);
    INSERT INTO coupons VALUES ('WELCOME10', 0.1), ('VIP', 0.25);
  `);
  return db;
}
