// Tiny concurrency pool
export async function pool(items, n, fn) {
  let i = 0; const results = [];
  const workers = Array.from({ length: Math.min(n, items.length) }, async (_, w) => {
    while (i < items.length) { const k = i++; try { results[k] = await fn(items[k], w); } catch (e) { results[k] = { error: String(e.message || e) }; console.error('  ✗', items[k].id || k, String(e.message || e).slice(0, 200)); } }
  });
  await Promise.all(workers);
  return results;
}
