import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function dumpSchema() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/`;
  const response = await fetch(url, {
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    console.error("HTTP error:", response.status, response.statusText);
    return;
  }

  const spec: any = await response.json();
  console.log("PostgREST OpenAPI Specification fetched.");
  
  const definitions = spec.definitions || {};
  for (const tableName of Object.keys(definitions)) {
    console.log(`\nTable: ${tableName}`);
    const properties = definitions[tableName].properties || {};
    const required = definitions[tableName].required || [];
    for (const colName of Object.keys(properties)) {
      const prop = properties[colName];
      const isReq = required.includes(colName) ? "REQUIRED" : "optional";
      console.log(`  - ${colName}: ${prop.type || prop.format} (${isReq}) [description: ${prop.description || 'none'}]`);
    }
  }
}

dumpSchema().catch(console.error);
