import { writeFileSync } from 'node:fs';
import { SEED_FILE, catalogueSql } from './catalogue-sql';

writeFileSync(SEED_FILE, catalogueSql());
console.log(`wrote ${SEED_FILE}`);
