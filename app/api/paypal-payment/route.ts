import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'New PayPal tier purchases are disabled. All users now share the same rolling quota.',
    },
    { status: 410 }
  );
}
