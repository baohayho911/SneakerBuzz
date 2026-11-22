import {transaction, createOrder} from './store-db.mjs';

const transitions = {
  pending: ['confirmed','cancelled'],
  confirmed: ['shipping','cancelled'],
  shipping: ['completed'],
  completed: [],
  cancelled: [],
};

export function storeRoutes({db, json, bad, body, getSession, customer, refresh}) {
  const orderLines = db.prepare('SELECT variant_id,title,variant,sku,price,quantity FROM store_order_lines WHERE order_id=?');
  const details = ({request_id, ...order}) => ({...order, items: orderLines.all(order.id)});
  const updateFlag = () => db.prepare("INSERT OR IGNORE INTO store_meta VALUES('catalog-updated')").run();
  const auth = (req, res, admin = false) => {
    const session = getSession(req, res), account = customer(session);
    if (!account) throw bad('Vui lòng đăng nhập.', 401);
    if (admin && account.role !== 'admin') throw bad('Tài khoản này không có quyền quản trị.', 403);
    return {session, account};
  };
  const str = (value, name, max, required = true) => {
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw bad(name + ' không hợp lệ.');
    return value.trim();
  };
  const number = (value, name, min, max) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw bad(name + ' không hợp lệ.');
    return value;
  };
  function editProduct(handle, data) {
    if (!/^[a-z0-9][a-z0-9-]{0,149}$/.test(handle)) throw bad('Đường dẫn sản phẩm không hợp lệ.');
    if (!data || !Array.isArray(data.variants) || !data.variants.length || data.variants.length > 100) throw bad('Cần từ 1 đến 100 biến thể.');
    if (!Array.isArray(data.collections) || data.collections.length > 100) throw bad('Danh mục không hợp lệ.');
    const title = str(data.title,'Tên sản phẩm',220), vendor = str(data.vendor,'Thương hiệu',100,false);
    const type = str(data.type,'Loại sản phẩm',100,false);
    const image = str(data.image,'Đường dẫn ảnh',1000,false);
    if (image && !/^https:\/\/[^\s]+$|^\/assets\/[\w.-]+$/.test(image)) throw bad('Dùng địa chỉ HTTPS hoặc ảnh nội bộ /assets/.');
    const description = str(data.description,'Mô tả',20000,false);
    return transaction(db, () => {
      const stored = db.prepare('SELECT payload FROM store_products WHERE handle=?').get(handle);
      const base = stored ? JSON.parse(stored.payload) : {id: Date.now(), handle, created_at:new Date().toISOString()};
      const payload = {...base, title,vendor,type,description_text:description,featured_image:image,
        images:[...new Set([image,...(base.images || [])].filter(Boolean))], options:['Kích thước','Màu sắc','Chất liệu']};
      const forbidden = ['/collections/all'];
      for (const collection of data.collections)
        if (!db.prepare('SELECT 1 FROM store_collections WHERE path=?').get(collection)) throw bad('Danh mục chưa tồn tại.');
      const oldVariants = db.prepare('SELECT * FROM store_variants WHERE handle=? ORDER BY position').all(handle);
      const ids = new Set(data.variants.map(v => v?.id).filter(id => id != null));
      if (oldVariants.some(v => !ids.has(v.id)) || ids.size !== data.variants.filter(v => v?.id != null).length)
        throw bad('Giữ ID biến thể cũ và tắt biến thể nếu ngừng bán.');
      db.prepare(`INSERT INTO store_products VALUES(?,?,?,1)
        ON CONFLICT(handle) DO UPDATE SET payload=excluded.payload,active=excluded.active,changed=1`)
        .run(handle,JSON.stringify(payload),Number(data.active !== false));
      const nextId = () => db.prepare('SELECT COALESCE(MAX(id), 0)+1 AS id FROM store_variants').get().id;
      data.variants.forEach((item, position) => {
        if (!item || typeof item !== 'object') throw bad('Biến thể không hợp lệ.');
        const row = oldVariants.find(v => v.id === item.id);
        if (item.id != null && !row) throw bad('Biến thể không thuộc sản phẩm.');
        const id = row?.id ?? nextId();
        const price = number(item.price,'Giá bán',0,1000000000)*100;
        const stock = number(item.stock,'Tồn kho',0,1000000);
        const options = ['size','color','material'].map(key => str(item[key] ?? '',key,100,false));
        const label = options.filter(Boolean).join(' / ') || 'Mặc định';
        const sku = str(item.sku ?? '','SKU',100,false);
        const variant = {...(row ? JSON.parse(row.payload) : {}), id,sku,title:label,options,option1:options[0],option2:options[1],option3:options[2]};
        if (row && item.expected_stock !== row.stock) throw bad('Tồn kho vừa thay đổi. Hãy tải lại sản phẩm trước khi lưu.',409);
        db.prepare(`INSERT INTO store_variants VALUES(?,?,?,?,?,?,?) ON CONFLICT(id)
          DO UPDATE SET payload=excluded.payload,price=excluded.price,stock=excluded.stock,enabled=excluded.enabled,position=excluded.position`)
          .run(id,handle,JSON.stringify(variant),price,stock,Number(item.enabled !== false),position);
      });
      const desired = new Set([...data.collections,...forbidden]);
      const existing = db.prepare('SELECT path FROM store_memberships WHERE handle=?').all(handle);
      for (const row of existing) if (!desired.has(row.path)) db.prepare('DELETE FROM store_memberships WHERE path=? AND handle=?').run(row.path,handle);
      for (const key of desired) db.prepare(`INSERT OR IGNORE INTO store_memberships
        SELECT ?, ?, COALESCE(MAX(position),-1)+1 FROM store_memberships WHERE path=?`).run(key,handle,key);
      updateFlag();
      return {handle};
    });
  }

  return async (req, res, url, pathname) => {
    if (!['/api/orders','/api/account/profile'].includes(pathname) && !pathname.startsWith('/api/admin/store/')) return false;
    const isAdmin = pathname.startsWith('/api/admin/store/');
    const {session, account} = auth(req,res,isAdmin);
    const method = req.method, page = Math.min(10000,Math.max(1,parseInt(url.searchParams.get('page'),10)||1)), offset=(page-1)*25;
    const paginate = (rows) => ({rows:rows.slice(0,25), next:rows.length>25});
    if (pathname === '/api/orders') {
      if (method === 'GET') json(res,paginate(db.prepare('SELECT * FROM store_orders WHERE customer_id=? ORDER BY created_at DESC,id LIMIT 26 OFFSET ?').all(account.id,offset).map(details)));
      else if (method === 'POST') {
        const input = await body(req);
        const order = createOrder(db,account,session.id,input,bad);
        refresh();
        json(res,details(order),201);
      } else throw bad('Phương thức không hợp lệ.',405);
    } else if (pathname === '/api/account/profile' && method === 'POST') {
      const input = await body(req);
      db.prepare('UPDATE customers SET first_name=?,last_name=? WHERE id=?')
        .run(str(input?.first_name,'Tên',100),str(input?.last_name,'Họ',100),account.id);
      json(res,{customer:customer(session)});
    } else if (pathname === '/api/admin/store/overview' && method === 'GET') {
      json(res,{
        products:db.prepare('SELECT COUNT(*) n FROM store_products WHERE active=1').get().n,
        variants:db.prepare('SELECT COUNT(*) n FROM store_variants').get().n,
        members:db.prepare('SELECT COUNT(*) n FROM customers').get().n,
        pending:db.prepare("SELECT COUNT(*) n FROM store_orders WHERE status='pending'").get().n,
        collections:db.prepare("SELECT path FROM store_collections WHERE path<>'/collections/all' ORDER BY path").all().map(row=>row.path),
      });
    } else if (pathname === '/api/admin/store/products') {
      if (method === 'GET') {
        const handle = url.searchParams.get('handle');
        if (handle) {
          const row = db.prepare('SELECT * FROM store_products WHERE handle=?').get(handle);
          if (!row) throw bad('Không tìm thấy sản phẩm.',404);
          const p = JSON.parse(row.payload);
          const variants = db.prepare('SELECT * FROM store_variants WHERE handle=? ORDER BY position').all(handle).map(v => {
            const raw = JSON.parse(v.payload);
            const option = (names) => {
              const i = p.options?.findIndex(o => names.includes((o.name || o).toLowerCase())) ?? -1;
              return i >= 0 ? (raw.options?.[i] ?? raw['option'+(i+1)] ?? '') : '';
            };
            return {id:v.id, price:v.price/100,stock:v.stock,expected_stock:v.stock,enabled:Boolean(v.enabled),sku:raw.sku || '',
              size:option(['kích thước','size']),color:option(['màu sắc','color']),material:option(['chất liệu','material'])};
          });
          json(res,{handle, title:p.title,vendor:p.vendor||'',type:p.type||'', image:typeof p.featured_image==='string'?p.featured_image.replace(/^\/\//,'https://'):p.featured_image?.src||'',
            description:p.description_text ?? String(p.description || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,20000),
            active:Boolean(row.active), variants,collections:db.prepare("SELECT path FROM store_memberships WHERE handle=? AND path<>'/collections/all'").all(handle).map(r=>r.path)});
        } else {
          const q = (url.searchParams.get('q')||'').trim().slice(0,150);
          json(res,paginate(db.prepare(`SELECT handle,active,json_extract(payload,'$.title') title,json_extract(payload,'$.vendor') vendor
            FROM store_products WHERE instr(lower(handle || ' ' || json_extract(payload,'$.title')),lower(?))>0
            ORDER BY handle LIMIT 26 OFFSET ?`).all(q,offset)));
        }
      } else if (method === 'POST') {
        const input = await body(req);
        const handle = str(input?.handle,'Đường dẫn',150);
        const exists = db.prepare('SELECT 1 FROM store_products WHERE handle=?').get(handle);
        if (Boolean(exists) === Boolean(input.create)) throw bad(exists?'Đường dẫn đã được sử dụng.':'Không tìm thấy sản phẩm.',409);
        const result = editProduct(handle,input);
        refresh();
        json(res,result,exists?200:201);
      } else throw bad('Phương thức không hợp lệ.',405);
    } else if (pathname === '/api/admin/store/orders') {
      if (method === 'GET') {
        const status = url.searchParams.get('status') || '';
        json(res,paginate(db.prepare("SELECT * FROM store_orders WHERE ?='' OR status=? ORDER BY created_at DESC,id LIMIT 26 OFFSET ?").all(status,status,offset).map(details)));
      } else if (method === 'POST') {
        const input = await body(req);
        transaction(db, () => {
          const row = db.prepare('SELECT status FROM store_orders WHERE id=?').get(String(input?.id || ''));
          if (!row) throw bad('Không tìm thấy đơn hàng.',404);
          if (!transitions[row.status].includes(input.status)) throw bad('Không thể chuyển sang trạng thái này.',409);
          db.prepare('UPDATE store_orders SET status=?,updated_at=? WHERE id=?').run(input.status,new Date().toISOString(),input.id);
          if (input.status === 'cancelled') {
            for (const item of orderLines.all(input.id))
              db.prepare('UPDATE store_variants SET stock=stock+? WHERE id=?').run(item.quantity,item.variant_id);
          }
        });
        refresh();
        json(res,{ok:true});
      } else throw bad('Phương thức không hợp lệ.',405);
    } else if (pathname === '/api/admin/store/members') {
      if (method === 'GET') {
        json(res,paginate(db.prepare(`SELECT c.id,email,first_name,last_name,created_at,
          COALESCE(m.role,'member') role, COALESCE(m.disabled,0) disabled
          FROM customers c LEFT JOIN store_members m ON m.id=c.id ORDER BY created_at DESC,c.id LIMIT 26 OFFSET ?`).all(offset)));
      } else if (method === 'POST') {
        const input = await body(req);
        if (typeof input?.disabled !== 'boolean') throw bad('Trạng thái tài khoản không hợp lệ.');
        const target = db.prepare("SELECT COALESCE(m.role,'member') role FROM customers c LEFT JOIN store_members m ON m.id=c.id WHERE c.id=?").get(String(input.id||''));
        if (!target) throw bad('Không tìm thấy thành viên.',404);
        if (target.role === 'admin') throw bad('Không khóa được tài khoản quản trị tại đây.',403);
        transaction(db, () => {
          db.prepare(`INSERT INTO store_members VALUES(?,'member',?) ON CONFLICT(id) DO UPDATE SET disabled=excluded.disabled`).run(input.id,Number(input.disabled));
          if (input.disabled) db.prepare('DELETE FROM sessions WHERE customer_id=?').run(input.id);
        });
        json(res,{ok:true});
      } else throw bad('Phương thức không hợp lệ.',405);
    } else throw bad('Không tìm thấy đường dẫn.',404);
    return true;
  };
}
