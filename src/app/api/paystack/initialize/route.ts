import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, amount, name, phone } = await req.json();

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: Number(amount) * 100,
        currency: "GHS",
        metadata: {
          name,
          phone,
        },
      }),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: false, message: "Paystack initialization failed" },
      { status: 500 }
    );
  }
}