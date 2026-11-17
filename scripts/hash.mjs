/**
 * Genera el hash bcrypt de un PIN.
 * Uso:  node scripts/hash.mjs 4321
 */
import bcrypt from 'bcryptjs';

const pin = process.argv[2];

if (!pin || !/^\d{4,8}$/.test(pin)) {
  console.error('Uso: node scripts/hash.mjs <PIN de 4 a 8 dígitos>');
  process.exit(1);
}

const hash = await bcrypt.hash(pin, 10);
console.log(hash);
