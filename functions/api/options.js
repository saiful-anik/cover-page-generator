export async function onRequestGet({ request }) {
  const response = await fetch(new URL("/data.json", request.url));
  if (!response.ok) {
    return Response.json({ error: "Could not load dropdown data." }, { status: 500 });
  }

  const source = await response.json();
  return Response.json({
    types: Array.isArray(source.TYPE) ? source.TYPE : [source.TYPE].filter(Boolean),
    profiles: Array.isArray(source.PROFILES) ? source.PROFILES : [],
    courses: Array.isArray(source.COURSES) ? source.COURSES : [],
  }, { headers: { "Cache-Control": "no-store" } });
}
