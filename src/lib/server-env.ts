import "server-only";

export function requireServerEnv(name: "PAYSTACK_SECRET_KEY" | "SUPABASE_SECRET_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
