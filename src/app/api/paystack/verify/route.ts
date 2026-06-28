import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { reference, amount } = await req.json();

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = await res.json();

    const paidAmount = Number(data?.data?.amount || 0);
    const expectedAmount = Number(amount) * 100;

    if (
      data?.status === true &&
      data?.data?.status === "success" &&
      paidAmount === expectedAmount
    ) {
      return NextResponse.json({
        status: true,
        reference,
      });
    }

    return NextResponse.json({
      status: false,
      message: "Payment not verified",
    });
  } catch {
    return NextResponse.json(
      { status: false, message: "Payment verification failed" },
      { status: 500 }
    );
  }
}