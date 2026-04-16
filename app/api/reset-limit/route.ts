import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Upload-limit resets are disabled. Capacity returns automatically on a rolling 24-hour window.',
    },
    { status: 410 }
  );
}
