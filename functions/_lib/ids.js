// Case references are random and non-sequential, so nobody can guess another person's case number.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0/O, 1/I/L
export function newRef() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return 'MSC-' + [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}
// A long random token for the private tracking link a client is given.
export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
