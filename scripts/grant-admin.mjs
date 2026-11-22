import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {seedAdmin} from '../lib/store-db.mjs';

if (process.argv.length !== 3) {
  console.error('Cách dùng: npm run admin -- email@example.com');
  process.exit(1);
}
try {
  const db = new DatabaseSync(process.env.DATABASE_PATH || fileURLToPath(new URL('../data/runtime.sqlite',import.meta.url)));
  try {
    seedAdmin(db,process.argv[2]);
    console.log('Đã cấp quyền quản trị. Mở /admin bằng tài khoản này.');
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
