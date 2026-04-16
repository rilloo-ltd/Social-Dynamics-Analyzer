import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'New PayPal subscriptions are disabled. All users now share the same rolling quota.',
    },
    { status: 410 }
  );
}
