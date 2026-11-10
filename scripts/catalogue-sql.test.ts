import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SEED_FILE, catalogueSql } from './catalogue-sql';

it('the committed catalogue seed matches src/model/catalogue.ts (run npm run gen:catalogue-sql)', () => {
  expect(readFileSync(SEED_FILE, 'utf8')).toBe(catalogueSql());
});
