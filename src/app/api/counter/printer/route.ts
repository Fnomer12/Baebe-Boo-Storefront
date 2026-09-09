import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCounterApi } from "@/lib/auth";
import {
  buildNativeReceiptCalibrationJob,
  getNativePrinterStatus,
  printNativeJob,
} from "@/lib/labels/native-print";

const requestSchema = z.object({
  action: z.literal("test"),
  printer: z.string().trim().min(1).max(128),
});

export async function GET() {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  try {
    return NextResponse.json(await getNativePrinterStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The host printer service is unavailable.";
    return NextResponse.json(
      { message: /enoent|not found/i.test(message) ? "CUPS is not available on this host." : message },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Choose a printer before testing it." }, { status: 400 });
  }

  try {
    const status = await getNativePrinterStatus();
    const printer = status.printers.find(
      (candidate) => candidate.name === parsed.data.printer && candidate.connected,
    );
    if (!printer) {
      return NextResponse.json(
        { message: "That printer is not connected to this host. Reconnect it and refresh the list." },
        { status: 409 },
      );
    }

    const result = await printNativeJob(
      buildNativeReceiptCalibrationJob(),
      "Baebe Boo counter printer connection test",
      printer.name,
    );
    const response = NextResponse.json({ tested: true, host: status.host, ...result });
    response.cookies.set("baebe_printer_verified", printer.name, {
      httpOnly: true,
      maxAge: 60 * 60 * 8,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The printer test could not be sent.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
