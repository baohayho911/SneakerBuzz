import {randomUUID} from 'node:crypto';

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function initStore(db, products, collections) {
  db.exec(`
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS store_meta(key TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS store_products(
      handle TEXT PRIMARY KEY, payload TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      changed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS store_variants(
      id INTEGER PRIMARY KEY, handle TEXT NOT NULL REFERENCES store_products(handle),
      payload TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
      stock INTEGER NOT NULL CHECK(stock>=0), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS store_variant_handle ON store_variants(handle,position);
    CREATE TABLE IF NOT EXISTS store_collections(path TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS store_memberships(
      path TEXT REFERENCES store_collections(path), handle TEXT REFERENCES store_products(handle),
      position INTEGER NOT NULL, PRIMARY KEY(path,handle)
    );
    CREATE TABLE IF NOT EXISTS store_members(
      id TEXT PRIMARY KEY REFERENCES customers(id), role TEXT NOT NULL CHECK(role IN ('member','admin')),
      disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS store_orders(
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
      request_id TEXT NOT NULL, status TEXT NOT NULL, recipient TEXT NOT NULL,
      phone TEXT NOT NULL, address TEXT NOT NULL, note TEXT NOT NULL,
      subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, total INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(customer_id,request_id)
    );
    CREATE INDEX IF NOT EXISTS store_my_orders ON store_orders(customer_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS store_order_lines(
      order_id TEXT NOT NULL REFERENCES store_orders(id), variant_id INTEGER NOT NULL REFERENCES store_variants(id),
      title TEXT NOT NULL, variant TEXT NOT NULL, sku TEXT, price INTEGER NOT NULL, quantity INTEGER NOT NULL,
      PRIMARY KEY(order_id,variant_id)
    );
  `);
  transaction(db, () => {
    if (db.prepare("SELECT 1 FROM store_meta WHERE key='catalog-v1'").get()) return;
    const product = db.prepare('INSERT INTO store_products(handle,payload) VALUES(?,?)');
    const variant = db.prepare('INSERT INTO store_variants VALUES(?,?,?,?,?,?,?)');
    for (const {variants, ...p} of products) {
      product.run(p.handle, JSON.stringify(p));
      variants.forEach((v, index) => {
        const stock = Math.max(0, Math.trunc(Number(v.inventory_quantity) || 0));
        variant.run(v.id, p.handle, JSON.stringify(v), Math.round(v.price), stock, Number(v.available), index);
      });
    }
    const collection = db.prepare('INSERT INTO store_collections VALUES(?)');
    const member = db.prepare('INSERT OR IGNORE INTO store_memberships VALUES(?,?,?)');
    const handles = new Set(products.map(p => p.handle));
    for (const [key, list] of Object.entries(collections)) {
      collection.run(key);
      list.forEach((handle, index) => { if (handles.has(handle)) member.run(key, handle, index); });
    }
    db.prepare("INSERT INTO store_meta VALUES('catalog-v1')").run();
  });
}

export function catalogState(db) {
  const byHandle = new Map(), variants = new Map(), changed = new Set();
  const memberships = Object.fromEntries(db.prepare('SELECT path FROM store_collections').all().map(r => [r.path, []]));
  for (const row of db.prepare('SELECT * FROM store_products WHERE active=1').all()) {
    byHandle.set(row.handle, {...JSON.parse(row.payload), variants: []});
    if (row.changed) changed.add(row.handle);
  }
  for (const row of db.prepare('SELECT * FROM store_variants ORDER BY handle,position').all()) {
    const p = byHandle.get(row.handle);
    if (!p) continue;
    const v = {...JSON.parse(row.payload), id: row.id, price: row.price, inventory_quantity: row.stock,
      available: Boolean(row.enabled && row.stock), inventory_management: 'local', inventory_policy: 'deny'};
    p.variants.push(v);
    variants.set(String(v.id), {p,v});
  }
  for (const p of byHandle.values()) {
    const prices = p.variants.map(v => v.price);
    p.available = p.variants.some(v => v.available);
    p.price = p.price_min = Math.min(...prices);
    p.price_max = Math.max(...prices);
    p.price_varies = p.price_min !== p.price_max;
  }
  for (const {path,handle} of db.prepare('SELECT path,handle FROM store_memberships ORDER BY path,position').all()) {
    if (byHandle.has(handle)) memberships[path].push(handle);
  }
  return {byHandle, variants, memberships, changed};
}

export function seedAdmin(db, email) {
  const row = db.prepare('SELECT id FROM customers WHERE email=?').get(email.trim().toLowerCase());
  if (!row) throw Error('Email chưa có tài khoản. Hãy đăng ký trên website trước.');
  db.prepare(`INSERT INTO store_members VALUES(?, 'admin', 0)
    ON CONFLICT(id) DO UPDATE SET role='admin', disabled=0`).run(row.id);
}

export function createOrder(db, account, sessionId, input, bad) {
  if (!input || !/^[\w-]{16,80}$/.test(input.request_id || '')) throw bad('Mã yêu cầu không hợp lệ.');
  const text = (key, min, max) => {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if (value.length < min || value.length > max) throw bad('Kiểm tra lại tên, số điện thoại, địa chỉ và ghi chú.');
    return value;
  };
  const recipient = text('recipient', 2, 100), phone = text('phone', 8, 24);
  if (!/^\+?[\d .()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 8) throw bad('Số điện thoại không hợp lệ.');
  const address = text('address', 8, 300), note = text('note', 0, 500);
  return transaction(db, () => {
    const prior = db.prepare('SELECT * FROM store_orders WHERE customer_id=? AND request_id=?').get(account.id,input.request_id);
    if (prior) return prior;
    const session = db.prepare('SELECT cart FROM sessions WHERE id=? AND customer_id=? AND expires_at>?').get(sessionId,account.id,Date.now());
    const cart = JSON.parse(session?.cart || '[]');
    if (!cart.length) throw bad('Giỏ hàng đang trống.');
    const lookup = db.prepare(`SELECT v.*,p.payload AS product FROM store_variants v
      JOIN store_products p ON p.handle=v.handle WHERE v.id=? AND p.active=1 AND v.enabled=1`);
    const lines = cart.map(item => {
      const variant = lookup.get(item.id);
      if (!variant || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>variant.stock) {
        throw bad('Một sản phẩm đã hết hàng hoặc tồn kho thay đổi. Vui lòng kiểm tra giỏ hàng.',409);
      }
      return {...variant, quantity:item.quantity, product:JSON.parse(variant.product), variant:JSON.parse(variant.payload)};
    });
    const subtotal = lines.reduce((total, row) => total + row.quantity * row.price, 0);
    if (input.expected_subtotal !== subtotal) throw bad('Giá giỏ hàng đã thay đổi. Vui lòng tải lại trang.',409);
    const shipping = subtotal >= 99900000 ? 0 : 3500000;
    const id = randomUUID(), date = new Date().toISOString();
    db.prepare('INSERT INTO store_orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, account.id, input.request_id, 'pending', recipient, phone, address, note, subtotal, shipping, subtotal + shipping, date, date);
    const insert = db.prepare('INSERT INTO store_order_lines VALUES(?,?,?,?,?,?,?)');
    const reserve = db.prepare('UPDATE store_variants SET stock=stock-? WHERE id=? AND stock>=?');
    for (const row of lines) {
      if (!reserve.run(row.quantity,row.id,row.quantity).changes) throw bad('Tồn kho vừa thay đổi.',409);
      insert.run(id,row.id,row.product.title,row.variant.title || '',row.variant.sku || '',row.price,row.quantity);
      db.prepare('UPDATE store_products SET changed=1 WHERE handle=?').run(row.handle);
    }
    db.prepare("UPDATE sessions SET cart='[]' WHERE id=?").run(sessionId);
    return db.prepare('SELECT * FROM store_orders WHERE id=?').get(id);
  });
}
