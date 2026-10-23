// Evaluates MEBAE_EVAL (a JS expression, may use `m` = window.__mebae) in the
// app frame of the managed browser and prints the JSON result.
// Usage: MEBAE_EVAL='m.state()' npx @iwsdk/cli browser run e2e/eval.mjs
export default async function run({ page, frame }) {
  const target = frame ?? page;
  const expr = process.env.MEBAE_EVAL ?? 'm.state()';
  return await target.evaluate(async (e) => {
    const m = window.__mebae;
    if (!m) throw new Error('window.__mebae missing (dev server only)');
    return await (0, eval)(`(async (m) => (${e}))`)(m);
  }, expr);
}
