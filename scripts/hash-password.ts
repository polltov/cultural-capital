/**
 * Печатает bcrypt-хеш (cost 12) пароля админа для ADMIN_PASSWORD_HASH.
 * Пароль читается из stdin или скрытым вводом — не из аргументов (чтобы не попал в историю shell).
 *
 *   npx tsx scripts/hash-password.ts
 *   printf '%s' "$PASS" | npx tsx scripts/hash-password.ts
 */
import bcrypt from "bcryptjs";

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stderr.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          stderr.write("\n");
          return reject(new Error("Отменено"));
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  let password: string;
  if (process.stdin.isTTY) {
    password = await readHidden("Пароль: ");
    const again = await readHidden("Ещё раз: ");
    if (password !== again) throw new Error("Пароли не совпадают");
  } else {
    password = await readStdin();
  }
  if (password.length < 10) throw new Error("Пароль короче 10 символов");
  process.stdout.write(`${await bcrypt.hash(password, 12)}\n`);
}

main().catch((e: Error) => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
