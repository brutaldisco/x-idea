import { connection } from "next/server";
import { getHealth } from "@/server/health";

export async function GET() {
  await connection();
  const body = await getHealth();
  return Response.json(body, { status: 200 });
}
