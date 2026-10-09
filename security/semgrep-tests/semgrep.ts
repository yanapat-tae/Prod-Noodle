// Synthetic examples for Semgrep; never executed or included in the app.
// ruleid: no-dynamic-code
eval(input);
// ruleid: no-dynamic-code
new Function(input);
// ruleid: no-raw-html
element.innerHTML = input;
// ruleid: no-shell-string
exec(input);
// ruleid: no-interpolated-sql
db.query(`SELECT * FROM orders WHERE id = ${input}`);
// ruleid: no-private-client-env
const privateClientValue = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
// ruleid: no-disabled-tls
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// ok: no-interpolated-sql
db.query('SELECT * FROM orders WHERE id = $1', [input]);
// ok: no-private-client-env
const publicClientValue = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// ok: no-shell-string
spawn('node', ['script.mjs'], { shell: false });
