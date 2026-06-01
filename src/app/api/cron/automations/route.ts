import { NextResponse } from "next/server";
import { runDueAutomations } from "@/lib/automation/engine";

export const runtime = "nodejs";

// Vercel Cron hits this hourly (see vercel.json). Runs every enabled automation
// whose nextRunAt is due. Guarded by CRON_SECRET when set. The demo path is the
// "Executar agora" button; this enables real unattended scheduling on deploy.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const res = await runDueAutomations(new Date());
  return NextResponse.json(res);
}
