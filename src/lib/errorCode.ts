/**
 * The short code «Algo falló» shows (Páginas web v1 · 6–7): «7F3K-20».
 *
 * Four characters from the time and two at random, from an alphabet with
 * no look-alikes, so a person can read it out in a report and the log line
 * with the same code can be found. It carries nothing about the person.
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function errorCode(now: number = Date.now(), random: () => number = Math.random): string {
  let t = Math.floor(now / 1000);
  let head = '';
  for (let i = 0; i < 4; i += 1) {
    head = (ALPHABET[t % ALPHABET.length] ?? '2') + head;
    t = Math.floor(t / ALPHABET.length);
  }
  const tail = [0, 1].map(() => ALPHABET[Math.floor(random() * ALPHABET.length)] ?? '2').join('');
  return `${head}-${tail}`;
}
