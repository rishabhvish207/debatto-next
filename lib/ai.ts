// lib/ai.ts
export async function callAI(system: string, userMsg: string) {
  const res = await fetch(`/api/debate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userMsg }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data.result;
}
